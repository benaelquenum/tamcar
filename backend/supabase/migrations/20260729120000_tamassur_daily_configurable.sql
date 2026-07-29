-- ============================================================
-- TamCar — TamAssur : assurance épargne chauffeur (2026-07-29)
--   Refonte de l'« assurance conducteur » :
--   - Montant CONFIGURABLE par chauffeur, plancher 1 000 F, défaut 1 000.
--   - Prélèvement QUOTIDIEN (au lieu de mensuel) sur le wallet TamCar
--     Revenus, façon tontine/susu. Prime pure (non récupérable).
--   - Rattrapage : les jours impayés sont collectés dès que le solde le
--     permet (du plus ancien au plus récent), en un seul passage.
--   La période du ledger passe de « 1er du mois » à « le jour concerné ».
-- ============================================================

-- 1. Montant TamAssur choisi par le chauffeur (plancher 1 000 F/jour) --
alter table public.drivers
  add column if not exists tamassur_fcfa int not null default 1000;

alter table public.drivers
  drop constraint if exists drivers_tamassur_min;
alter table public.drivers
  add constraint drivers_tamassur_min check (tamassur_fcfa >= 1000);

-- 2. Le chauffeur configure son montant (>= 1 000) --------------------
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

-- 3. Lecture du montant configuré ------------------------------------
create or replace function public.my_tamassur()
returns int
language sql stable security definer set search_path = public as $fn_amt$
  select coalesce(tamassur_fcfa, 1000) from public.drivers where profile_id = auth.uid();
$fn_amt$;
grant execute on function public.my_tamassur to authenticated;

-- 4. Nouveau défaut du ledger (période = jour désormais) -------------
alter table public.driver_insurance_charges alter column amount_fcfa set default 1000;

-- 5. Collecte QUOTIDIENNE + rattrapage (service_role / cron) ----------
create or replace function public.charge_driver_insurance(p_period date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn_charge$
declare
  v_period date := coalesce(
    p_period,
    (now() at time zone 'Africa/Porto-Novo')::date
  );
  v_drv record;
  v_wallet record;
  v_charge record;
  v_amount int;
  v_take int;
  v_bal int;
  v_new_collected int;
  v_collected_total int := 0;
  v_drivers int := 0;
begin
  for v_drv in
    select id, profile_id, coalesce(tamassur_fcfa, 1000) as amount
      from public.drivers where status = 'active'
  loop
    v_drivers := v_drivers + 1;
    v_amount := greatest(v_drv.amount, 1000);

    -- Garantir la charge du jour (montant courant tant que non prélevée)
    insert into public.driver_insurance_charges (driver_id, period, amount_fcfa)
    values (v_drv.id, v_period, v_amount)
    on conflict (driver_id, period) do update
      set amount_fcfa = excluded.amount_fcfa
      where driver_insurance_charges.collected_fcfa = 0;

    -- Solde revenus du chauffeur (verrou)
    select id, balance_fcfa into v_wallet from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_revenus'
     for update;
    if v_wallet.id is null then continue; end if;
    v_bal := v_wallet.balance_fcfa;
    if v_bal <= 0 then continue; end if;

    -- Collecte des jours impayés, du plus ancien au plus récent
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
      v_new_collected := v_charge.collected_fcfa + v_take;

      update public.driver_insurance_charges
         set collected_fcfa = v_new_collected,
             status = case when v_new_collected >= amount_fcfa then 'paid' else 'partial' end,
             collected_at = case when v_new_collected >= amount_fcfa then now() else collected_at end
       where id = v_charge.id;

      insert into public.wallet_transactions
        (wallet_id, type, amount_fcfa, provider, status, meta)
      values
        (v_wallet.id, 'insurance_premium', -v_take, 'internal', 'success',
         jsonb_build_object('period', v_charge.period, 'charge_id', v_charge.id, 'product', 'tamassur'));

      v_collected_total := v_collected_total + v_take;
    end loop;

    -- Solde final du wallet après collecte
    update public.wallets
       set balance_fcfa = v_bal, updated_at = now()
     where id = v_wallet.id;
  end loop;

  return jsonb_build_object(
    'period', v_period,
    'drivers_scanned', v_drivers,
    'collected_fcfa', v_collected_total
  );
end;
$fn_charge$;

revoke execute on function public.charge_driver_insurance(date) from public, anon, authenticated;
grant execute on function public.charge_driver_insurance(date) to service_role;

-- 6. Statut côté chauffeur : 60 derniers jours -----------------------
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

-- 7. Cron : mensuel -> QUOTIDIEN (21:00 UTC = 22:00 Porto-Novo) -------
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
