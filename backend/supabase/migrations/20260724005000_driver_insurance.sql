-- ============================================================
-- TamCar — Assurance individuelle conducteur (2026-07-24)
--   Prélèvement mensuel automatique de 2 000 F sur le wallet
--   TamCar Revenus du chauffeur, avec traçabilité transparente.
--
-- Politique impayé (MVP) : si le solde revenus est insuffisant, on
-- prélève ce qui est disponible (status 'partial') ou rien ('pending').
-- Le reliquat est retenté au prochain passage mensuel (le champ
-- collected_fcfa cumule). Affiché au chauffeur via my_insurance_status().
--
-- ⚠️ Montant 2 000 F câblé dans charge_driver_insurance (v_amount).
--    Pour le changer : modifier la constante + les lignes déjà créées.
-- ============================================================

-- 1. Nouveau type de transaction wallet -----------------------
--    (valeur ajoutée ici, utilisée seulement à l'exécution du cron →
--     pas de conflit "unsafe use of new value" avec plpgsql.)
alter type wallet_tx_type add value if not exists 'insurance_premium';

-- 2. Ledger des charges d'assurance ---------------------------
create table if not exists public.driver_insurance_charges (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  period date not null,                       -- 1er du mois concerné
  amount_fcfa int not null default 2000,
  collected_fcfa int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'partial', 'paid')),
  created_at timestamptz not null default now(),
  collected_at timestamptz,
  unique (driver_id, period)
);

create index if not exists driver_insurance_driver_idx
  on public.driver_insurance_charges (driver_id, period desc);

alter table public.driver_insurance_charges enable row level security;

drop policy if exists driver_insurance_select on public.driver_insurance_charges;
create policy driver_insurance_select on public.driver_insurance_charges
  for select using (
    driver_id in (select id from public.drivers where profile_id = auth.uid())
    or public.is_admin()
  );

-- 3. Collecte mensuelle (service_role / cron) -----------------
create or replace function public.charge_driver_insurance(p_period date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn_charge$
declare
  v_period date := coalesce(
    p_period,
    date_trunc('month', (now() at time zone 'Africa/Porto-Novo'))::date
  );
  v_amount int := 2000;
  v_drv record;
  v_wallet record;
  v_charge record;
  v_take int;
  v_new_collected int;
  v_collected_total int := 0;
  v_drivers int := 0;
begin
  for v_drv in
    select id, profile_id from public.drivers where status = 'active'
  loop
    v_drivers := v_drivers + 1;

    -- Garantir une ligne de charge pour la période
    insert into public.driver_insurance_charges (driver_id, period, amount_fcfa)
    values (v_drv.id, v_period, v_amount)
    on conflict (driver_id, period) do nothing;

    select * into v_charge from public.driver_insurance_charges
     where driver_id = v_drv.id and period = v_period
     for update;
    if v_charge.status = 'paid' then continue; end if;

    select id, balance_fcfa into v_wallet from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_revenus'
     for update;
    if v_wallet.id is null then continue; end if;

    v_take := least(v_wallet.balance_fcfa, v_charge.amount_fcfa - v_charge.collected_fcfa);
    if v_take <= 0 then continue; end if;

    update public.wallets
       set balance_fcfa = balance_fcfa - v_take, updated_at = now()
     where id = v_wallet.id;

    insert into public.wallet_transactions
      (wallet_id, type, amount_fcfa, provider, status, meta)
    values
      (v_wallet.id, 'insurance_premium', -v_take, 'internal', 'success',
       jsonb_build_object('period', v_period, 'charge_id', v_charge.id));

    v_new_collected := v_charge.collected_fcfa + v_take;
    update public.driver_insurance_charges
       set collected_fcfa = v_new_collected,
           status = case when v_new_collected >= amount_fcfa then 'paid' else 'partial' end,
           collected_at = case when v_new_collected >= amount_fcfa then now() else collected_at end
     where id = v_charge.id;

    v_collected_total := v_collected_total + v_take;

    -- Notification transparente au chauffeur
    perform public._push_notify(
      v_drv.profile_id,
      'Assurance conducteur',
      v_take || ' F prélevés sur tes revenus pour ton assurance ('
        || to_char(v_period, 'MM/YYYY') || ').',
      '/wallet', 'insurance:' || v_charge.id::text, false
    );
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

-- 4. Lecture côté chauffeur -----------------------------------
create or replace function public.my_insurance_status()
returns table (period date, amount_fcfa int, collected_fcfa int, status text)
language sql stable security definer set search_path = public as $fn_status$
  select c.period, c.amount_fcfa, c.collected_fcfa, c.status
  from public.driver_insurance_charges c
  join public.drivers d on d.id = c.driver_id
  where d.profile_id = auth.uid()
  order by c.period desc
  limit 12;
$fn_status$;

grant execute on function public.my_insurance_status to authenticated;

-- 5. Cron mensuel — 1er du mois à 06:00 UTC -------------------
--    (idempotent : on retire l'ancien job s'il existe.)
do $cron$
begin
  perform cron.unschedule('driver_insurance_monthly');
exception when others then null;
end
$cron$;

select cron.schedule(
  'driver_insurance_monthly',
  '0 6 1 * *',
  $job$ select public.charge_driver_insurance(); $job$
);
