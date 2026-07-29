-- ============================================================
-- TamCar — TamAssur : assurance ÉPARGNE chauffeur (2026-07-29)
--   TamAssur = épargne RÉCUPÉRABLE (« ~600 000 F à toi sur 2 ans »),
--   pas une prime perdue. Chaque jour, un montant choisi par le
--   chauffeur (plancher 1 000 F) est transféré de son wallet
--   « Revenus » vers une poche dédiée « Épargne » (tamcar_epargne).
--   Le capital lui appartient (avance possible après 24 mois — méca
--   de retrait à venir, comme le fonds rachat verrouillé).
--
--   - Montant CONFIGURABLE par chauffeur (drivers.tamassur_fcfa >= 1000).
--   - Sweep QUOTIDIEN (cron) : Revenus -> Épargne. Rattrapage des jours
--     non épargnés dès que le solde le permet (oldest-first).
--   - Le ledger driver_insurance_charges sert de calendrier de cotisation
--     (period = jour, status paid/partial/pending).
-- ============================================================

-- A. Nouvelle poche épargne + type de transaction (crédit épargne) -----
--    Valeurs d'enum utilisées uniquement dans des corps plpgsql /
--    exécutions différées => pas de conflit "unsafe use of new value".
alter type wallet_kind    add value if not exists 'tamcar_epargne';
alter type wallet_tx_type add value if not exists 'tamassur_saving';

-- B. Montant TamAssur choisi par le chauffeur (plancher 1 000 F/jour) ---
alter table public.drivers
  add column if not exists tamassur_fcfa int not null default 1000;

alter table public.drivers
  drop constraint if exists drivers_tamassur_min;
alter table public.drivers
  add constraint drivers_tamassur_min check (tamassur_fcfa >= 1000);

-- C. Le chauffeur configure son montant (>= 1 000) ---------------------
create or replace function public.set_my_tamassur(p_amount int)
returns int
language plpgsql security definer set search_path = public as $fn_set$
declare
  v_driver_id uuid;
  v_amount int;
begin
  select id into v_driver_id from public.drivers where profile_id = auth.uid();
  if v_driver_id is null then
    raise exception 'not_a_driver';
  end if;
  v_amount := greatest(coalesce(p_amount, 1000), 1000);   -- plancher 1 000
  update public.drivers set tamassur_fcfa = v_amount where id = v_driver_id;
  return v_amount;
end;
$fn_set$;

revoke execute on function public.set_my_tamassur(int) from public, anon;
grant execute on function public.set_my_tamassur(int) to authenticated;

create or replace function public.my_tamassur()
returns int
language sql stable security definer set search_path = public as $fn_amt$
  select coalesce(tamassur_fcfa, 1000) from public.drivers where profile_id = auth.uid();
$fn_amt$;
grant execute on function public.my_tamassur to authenticated;

-- D. Nouveau défaut du ledger (période = jour désormais) ---------------
alter table public.driver_insurance_charges alter column amount_fcfa set default 1000;

-- E. Sweep QUOTIDIEN : Revenus -> Épargne (service_role / cron) ---------
create or replace function public.charge_driver_insurance(p_period date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn_charge$
declare
  v_period date := coalesce(
    p_period,
    (now() at time zone 'Africa/Porto-Novo')::date
  );
  v_drv record;
  v_rev record;
  v_charge record;
  v_epargne_id uuid;
  v_amount int;
  v_take int;
  v_bal int;
  v_saved int;
  v_new_collected int;
  v_saved_total int := 0;
  v_drivers int := 0;
begin
  for v_drv in
    select id, profile_id, coalesce(tamassur_fcfa, 1000) as amount
      from public.drivers where status = 'active'
  loop
    v_drivers := v_drivers + 1;
    v_amount := greatest(v_drv.amount, 1000);

    -- Calendrier : charge du jour (montant courant tant que non épargnée)
    insert into public.driver_insurance_charges (driver_id, period, amount_fcfa)
    values (v_drv.id, v_period, v_amount)
    on conflict (driver_id, period) do update
      set amount_fcfa = excluded.amount_fcfa
      where driver_insurance_charges.collected_fcfa = 0;

    -- Poche épargne (création paresseuse)
    select id into v_epargne_id from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_epargne';
    if v_epargne_id is null then
      insert into public.wallets (profile_id, kind, balance_fcfa)
      values (v_drv.profile_id, 'tamcar_epargne', 0)
      returning id into v_epargne_id;
    end if;

    -- Solde Revenus (verrou)
    select id, balance_fcfa into v_rev from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_revenus'
     for update;
    if v_rev.id is null then continue; end if;
    v_bal := v_rev.balance_fcfa;
    if v_bal <= 0 then continue; end if;

    -- Cotisation du jour + rattrapage des jours non épargnés (oldest-first)
    v_saved := 0;
    for v_charge in
      select * from public.driver_insurance_charges
       where driver_id = v_drv.id and status <> 'paid' and period <= v_period
       order by period asc
       for update
    loop
      exit when v_bal <= 0;
      v_take := least(v_bal, v_charge.amount_fcfa - v_charge.collected_fcfa);
      if v_take <= 0 then continue; end if;

      v_bal := v_bal - v_take;
      v_saved := v_saved + v_take;
      v_new_collected := v_charge.collected_fcfa + v_take;

      update public.driver_insurance_charges
         set collected_fcfa = v_new_collected,
             status = case when v_new_collected >= amount_fcfa then 'paid' else 'partial' end,
             collected_at = case when v_new_collected >= amount_fcfa then now() else collected_at end
       where id = v_charge.id;
    end loop;

    -- Transfert effectif Revenus -> Épargne (montants positifs = absolus)
    if v_saved > 0 then
      update public.wallets set balance_fcfa = v_bal, updated_at = now()
       where id = v_rev.id;
      update public.wallets set balance_fcfa = balance_fcfa + v_saved, updated_at = now()
       where id = v_epargne_id;

      insert into public.wallet_transactions
        (wallet_id, type, amount_fcfa, provider, status, meta)
      values
        (v_rev.id, 'insurance_premium', v_saved, 'internal', 'success',
         jsonb_build_object('period', v_period, 'product', 'tamassur')),
        (v_epargne_id, 'tamassur_saving', v_saved, 'internal', 'success',
         jsonb_build_object('period', v_period, 'product', 'tamassur'));

      v_saved_total := v_saved_total + v_saved;
    end if;
  end loop;

  return jsonb_build_object(
    'period', v_period,
    'drivers_scanned', v_drivers,
    'saved_fcfa', v_saved_total
  );
end;
$fn_charge$;

revoke execute on function public.charge_driver_insurance(date) from public, anon, authenticated;
grant execute on function public.charge_driver_insurance(date) to service_role;

-- F. Statut côté chauffeur : 60 derniers jours -------------------------
create or replace function public.my_insurance_status()
returns table (period date, amount_fcfa int, collected_fcfa int, status text)
language sql stable security definer set search_path = public as $fn_status$
  select c.period, c.amount_fcfa, c.collected_fcfa, c.status
  from public.driver_insurance_charges c
  join public.drivers d on d.id = c.driver_id
  where d.profile_id = auth.uid()
  order by c.period desc
  limit 60;
$fn_status$;
grant execute on function public.my_insurance_status to authenticated;

-- G. Cron : mensuel -> QUOTIDIEN (21:00 UTC = 22:00 Porto-Novo) --------
do $cron$
begin
  perform cron.unschedule('driver_insurance_monthly');
exception when others then null;
end
$cron$;

do $cron$
begin
  perform cron.unschedule('driver_insurance_daily');
exception when others then null;
end
$cron$;

select cron.schedule(
  'driver_insurance_daily',
  '0 21 * * *',
  $job$ select public.charge_driver_insurance(); $job$
);
