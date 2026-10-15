-- ============================================================
-- TamCar — Objectif quotidien « tout compris » (versement + TamAssur) et épargne GAGNÉE chaque jour d'objectif atteint (2026-10-15)
--
--   Décision de Terence (2026-10-15) : l'objectif quotidien annoncé aux chauffeurs en formule Cession INCLUT la cotisation TamAssur de 1 000 F :
--   moto 3 500 F (2 500 + 1 000), tricycle 6 000 F, Essentiel 8 200 F, Confort 10 000 F. La jauge « Part de TamCar » se remplit vers cet objectif.
--     - objectif atteint (part de TamCar des courses + versements hors application déclarés >= objectif) : plus aucun prélèvement ce jour-là,
--       la cotisation est couverte par la part de TamCar et 834 F sont ÉPARGNÉS : la jauge d'épargne avance ;
--     - objectif non atteint : le manque est prélevé comme avant, mais SEULEMENT sur le versement (2 500 F pour une moto) ; pas de cotisation,
--       donc pas d'épargne ce jour-là ;
--     - le prélèvement séparé de 22 h ne concerne plus que les chauffeurs hors formule Cession (et les cessions avant le démarrage).
--
--   Courses faites HORS application : le chauffeur verse les fonds à TamCar (espèces ou Mobile Money) ; l'administrateur enregistre le versement
--   (admin_declare_offline_payment). Il compte dans la part de TamCar du jour : l'objectif peut être atteint, le tableau de bord du chauffeur se met
--   à jour, l'épargne est créditée, et un manque déjà prélevé est remboursé (jour déjà clôturé).
-- ============================================================

-- 1. Colonnes du journal quotidien et versements hors application
alter table public.driver_floor_log add column if not exists offline_fcfa int not null default 0;
alter table public.driver_floor_log add column if not exists saved_fcfa int not null default 0;

create table if not exists public.driver_offline_payments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  day date not null,
  amount_fcfa int not null check (amount_fcfa > 0),
  method text not null check (method in ('cash', 'mobile_money')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists driver_offline_payments_driver_day on public.driver_offline_payments (driver_id, day);

alter table public.driver_offline_payments enable row level security;
drop policy if exists driver_offline_payments_select on public.driver_offline_payments;
create policy driver_offline_payments_select on public.driver_offline_payments
  for select using (
    driver_id in (select id from public.drivers where profile_id = (select auth.uid()))
    or (select public.is_admin())
  );
revoke all on public.driver_offline_payments from anon, authenticated;
grant select on public.driver_offline_payments to authenticated;

-- 2. Objectif quotidien : versement + cotisation (0 hors formule Cession)
create or replace function public._floor_target(p_driver uuid)
returns int
language sql stable security definer set search_path = public as $fn$
  select case when d.application_type::text = 'cession' and public._vehicle_versement(coalesce(v.category::text, '')) > 0
              then public._vehicle_versement(coalesce(v.category::text, '')) + public._tamassur_amount(d.id)
              else 0 end
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = p_driver;
$fn$;
revoke execute on function public._floor_target(uuid) from public, anon, authenticated;

-- 3. Évaluation (ou ré-évaluation) d'un jour : idempotente. p_final = jour clôturé (prélèvement du manque et journal) ;
--    sinon seule l'épargne est créditée, dès que l'objectif est atteint.
create or replace function public._floor_eval_day(p_driver uuid, p_day date, p_final boolean)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_prof uuid; v_cat text; v_app text;
  v_vers int; v_cot int; v_target int; v_vol int; v_part int; v_off int; v_s int;
  v_reached boolean; v_short int; v_prev_short int := 0; v_prev_status text; v_prev_exists boolean := false; v_delta int;
  v_wallet uuid; v_ep uuid; v_saved int := 0; v_saved_done boolean; v_dfrom date; v_status text;
begin
  select d.profile_id, v.category::text, d.application_type::text into v_prof, v_cat, v_app
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id where d.id = p_driver;
  if v_prof is null or v_app <> 'cession' then return null; end if;
  v_vers := public._vehicle_versement(coalesce(v_cat, ''));
  if v_vers <= 0 then return null; end if;

  v_cot := public._tamassur_amount(p_driver);
  v_target := v_vers + v_cot;

  if exists (select 1 from public.driver_excused_days x where x.driver_id = p_driver and x.day = p_day) then
    if p_final then
      insert into public.driver_floor_log (driver_id, day, due_fcfa, status)
      values (p_driver, p_day, v_target, 'excused') on conflict (driver_id, day) do nothing;
    end if;
    return jsonb_build_object('status', 'excused');
  end if;

  select t.volume, t.part into v_vol, v_part from public._floor_day_totals(p_driver, p_day) t;
  select coalesce(sum(o.amount_fcfa), 0)::int into v_off from public.driver_offline_payments o where o.driver_id = p_driver and o.day = p_day;
  v_s := v_part + v_off;
  v_reached := v_s >= v_target;
  v_short := case when v_reached then 0 else greatest(0, v_vers - v_s) end;

  -- Épargne : créditée une seule fois par jour, dès que l'objectif est atteint (et après le démarrage de la cotisation)
  select nullif(value, '')::date into v_dfrom from public._push_settings where key = 'tamassur_debit_from';
  v_dfrom := coalesce(v_dfrom, date '2027-01-01');
  select exists (select 1 from public.driver_insurance_charges c where c.driver_id = p_driver and c.period = p_day and c.status = 'paid') into v_saved_done;
  if v_reached and not v_saved_done and p_day >= v_dfrom then
    v_saved := public._tamassur_savings_day(p_driver);
    insert into public.driver_insurance_charges (driver_id, period, amount_fcfa, collected_fcfa, saved_fcfa, status, collected_at)
    values (p_driver, p_day, v_cot, v_cot, v_saved, 'paid', now())
    on conflict (driver_id, period) do update
      set amount_fcfa = excluded.amount_fcfa, collected_fcfa = excluded.collected_fcfa, saved_fcfa = excluded.saved_fcfa,
          status = 'paid', collected_at = now()
      where public.driver_insurance_charges.status <> 'paid';
    select id into v_ep from public.wallets where profile_id = v_prof and kind = 'tamcar_epargne' for update;
    if v_ep is null then
      insert into public.wallets (profile_id, kind, balance_fcfa) values (v_prof, 'tamcar_epargne', 0) returning id into v_ep;
    end if;
    update public.wallets set balance_fcfa = balance_fcfa + v_saved, updated_at = now() where id = v_ep;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_ep, 'tamassur_saving', v_saved, 'internal', 'success',
            jsonb_build_object('day', p_day, 'product', 'tamassur', 'mode', 'objectif_atteint',
                               'cotisation', v_cot, 'frais_garantie', v_cot - v_saved, 'part_tamcar', v_s, 'objectif', v_target));
  end if;

  if p_final then
    select true, l.shortfall_fcfa, l.status into v_prev_exists, v_prev_short, v_prev_status
      from public.driver_floor_log l where l.driver_id = p_driver and l.day = p_day;
    if v_prev_status = 'refunded' then return jsonb_build_object('status', 'refunded'); end if;
    v_delta := v_short - coalesce(v_prev_short, 0);
    if v_delta <> 0 then
      select id into v_wallet from public.wallets where profile_id = v_prof and kind = 'tamcar_revenus' for update;
      if v_wallet is null then
        insert into public.wallets (profile_id, kind, balance_fcfa) values (v_prof, 'tamcar_revenus', 0) returning id into v_wallet;
      end if;
      update public.wallets set balance_fcfa = balance_fcfa - v_delta, updated_at = now() where id = v_wallet;
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
      values (v_wallet, (case when v_delta > 0 then 'floor_topup' else 'floor_refund' end)::public.wallet_tx_type, abs(v_delta), 'internal', 'success',
              jsonb_build_object('day', p_day, 'due', v_vers, 'objectif', v_target, 'tamcar_part', v_part, 'hors_application', v_off, 'volume', v_vol));
    end if;
    v_status := case when v_short = 0 then 'covered' else 'charged' end;
    insert into public.driver_floor_log (driver_id, day, due_fcfa, volume_fcfa, tamcar_part_fcfa, shortfall_fcfa, status, offline_fcfa, saved_fcfa)
    values (p_driver, p_day, v_target, v_vol, v_part, v_short, v_status, v_off,
            coalesce((select c.saved_fcfa from public.driver_insurance_charges c where c.driver_id = p_driver and c.period = p_day and c.status = 'paid'), 0))
    on conflict (driver_id, day) do update
      set due_fcfa = excluded.due_fcfa, volume_fcfa = excluded.volume_fcfa, tamcar_part_fcfa = excluded.tamcar_part_fcfa,
          shortfall_fcfa = excluded.shortfall_fcfa, status = excluded.status, offline_fcfa = excluded.offline_fcfa, saved_fcfa = excluded.saved_fcfa;
    if not coalesce(v_prev_exists, false) and v_short > 0 then
      perform public._push_notify(
        v_prof,
        'Versement du jour : ' || v_short || ' F prélevés',
        'Le ' || to_char(p_day, 'DD/MM') || ', la part de TamCar sur vos courses était de ' || v_s || ' F pour un objectif de ' || v_target
          || ' F (versement ' || v_vers || ' F + épargne ' || v_cot || ' F). Les ' || v_short || ' F manquants du versement ont été prélevés sur votre portefeuille ; pas d''épargne ce jour-là.',
        '/wallet', 'floor:' || p_day::text, false
      );
    end if;
  end if;

  return jsonb_build_object('status', case when v_short = 0 then 'covered' else 'charged' end, 'reached', v_reached, 'part', v_s, 'target', v_target,
                            'shortfall', v_short, 'saved', v_saved);
end;
$fn$;
revoke execute on function public._floor_eval_day(uuid, date, boolean) from public, anon, authenticated;

-- 4. Clôture de minuit : chaque chauffeur en formule Cession passe par l'évaluation du jour
create or replace function public.charge_driver_floor(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Porto-Novo')::date - 1);
  v_drv record;
  v_res jsonb;
  v_scanned int := 0; v_covered int := 0; v_excused int := 0; v_charged int := 0; v_total int := 0; v_saved int := 0;
begin
  if extract(dow from v_day) = 0 then
    return jsonb_build_object('day', v_day, 'skipped', 'sunday');
  end if;
  if v_day < public._floor_start() then
    return jsonb_build_object('day', v_day, 'skipped', 'not_started', 'starts_on', public._floor_start());
  end if;

  for v_drv in
    select d.id from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.application_type::text = 'cession'
  loop
    v_res := public._floor_eval_day(v_drv.id, v_day, true);
    if v_res is null then continue; end if;
    v_scanned := v_scanned + 1;
    case v_res ->> 'status'
      when 'excused' then v_excused := v_excused + 1;
      when 'covered' then v_covered := v_covered + 1; v_saved := v_saved + coalesce((v_res ->> 'saved')::int, 0);
      when 'charged' then v_charged := v_charged + 1; v_total := v_total + coalesce((v_res ->> 'shortfall')::int, 0);
      else null;
    end case;
  end loop;

  return jsonb_build_object('day', v_day, 'drivers_scanned', v_scanned, 'covered', v_covered,
                            'excused', v_excused, 'charged', v_charged, 'charged_fcfa', v_total, 'saved_fcfa', v_saved);
end;
$fn$;
revoke execute on function public.charge_driver_floor(date) from public, anon, authenticated;
grant execute on function public.charge_driver_floor(date) to service_role;

-- 5. Prélèvement de 22 h : plus pour les chauffeurs en formule Cession une fois le versement démarré (la cotisation est dans l'objectif)
create or replace function public.charge_driver_insurance(p_period date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_period date := coalesce(
    p_period,
    (now() at time zone 'Africa/Porto-Novo')::date
  );
  v_from date;
  v_drv record;
  v_rev_id uuid;
  v_rev_bal int;
  v_epargne_id uuid;
  v_fund_id uuid;
  v_fund_bal int;
  v_fund_share int;
  v_rev_debit int;
  v_amount int;
  v_saved int;
  v_charge_id uuid;
  v_new_bal int;
  v_drivers int := 0;
  v_debited int := 0;
  v_total int := 0;
  v_saved_total int := 0;
  v_from_fund int := 0;
  v_negative int := 0;
begin
  if extract(dow from v_period) = 0 then
    return jsonb_build_object('period', v_period, 'skipped', 'sunday');
  end if;

  select nullif(value, '')::date into v_from
    from public._push_settings where key = 'tamassur_debit_from';
  v_from := coalesce(v_from, date '2027-01-01');
  if v_period < v_from then
    return jsonb_build_object('period', v_period, 'skipped', 'not_started', 'starts_on', v_from);
  end if;

  for v_drv in
    select d.id, d.profile_id from public.drivers d
     where d.status = 'active'
       and not exists (select 1 from public.driver_excused_days x where x.driver_id = d.id and x.day = v_period)
       and not (v_period >= public._floor_start() and public._floor_target(d.id) > 0)
  loop
    v_drivers := v_drivers + 1;
    v_amount := public._tamassur_amount(v_drv.id);
    v_saved := public._tamassur_savings_day(v_drv.id);

    v_charge_id := null;
    insert into public.driver_insurance_charges
      (driver_id, period, amount_fcfa, collected_fcfa, saved_fcfa, status, collected_at)
    values (v_drv.id, v_period, v_amount, v_amount, v_saved, 'paid', now())
    on conflict (driver_id, period) do update
      set amount_fcfa = excluded.amount_fcfa,
          collected_fcfa = excluded.collected_fcfa,
          saved_fcfa = excluded.saved_fcfa,
          status = 'paid',
          collected_at = now()
      where driver_insurance_charges.status <> 'paid'
    returning id into v_charge_id;
    if v_charge_id is null then continue; end if;

    select id into v_rev_id from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_revenus';
    if v_rev_id is null then
      insert into public.wallets (profile_id, kind, balance_fcfa)
      values (v_drv.profile_id, 'tamcar_revenus', 0)
      returning id into v_rev_id;
    end if;
    select balance_fcfa into v_rev_bal from public.wallets where id = v_rev_id for update;

    select id into v_epargne_id from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_epargne';
    if v_epargne_id is null then
      insert into public.wallets (profile_id, kind, balance_fcfa)
      values (v_drv.profile_id, 'tamcar_epargne', 0)
      returning id into v_epargne_id;
    end if;

    v_fund_share := 0;
    select id, balance_fcfa into v_fund_id, v_fund_bal from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_rachat' for update;
    if v_fund_id is not null then
      v_fund_share := greatest(0, least(
        round(v_amount * public._program_rule('tamassur_fund_pct') / 100.0)::int, v_fund_bal, v_amount));
    end if;
    v_rev_debit := v_amount - v_fund_share;

    v_new_bal := v_rev_bal - v_rev_debit;
    update public.wallets set balance_fcfa = v_new_bal, updated_at = now() where id = v_rev_id;
    if v_fund_share > 0 then
      update public.wallets set balance_fcfa = balance_fcfa - v_fund_share, updated_at = now() where id = v_fund_id;
    end if;
    update public.wallets set balance_fcfa = balance_fcfa + v_saved, updated_at = now()
     where id = v_epargne_id;
    update public.driver_insurance_charges set from_rachat_fcfa = v_fund_share where id = v_charge_id;

    if v_rev_debit > 0 then
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
      values (v_rev_id, 'insurance_premium', v_rev_debit, 'internal', 'success',
              jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm'));
    end if;
    if v_fund_share > 0 then
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
      values (v_fund_id, 'tamassur_from_rachat', v_fund_share, 'internal', 'success',
              jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm'));
    end if;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_epargne_id, 'tamassur_saving', v_saved, 'internal', 'success',
            jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm',
                               'cotisation', v_amount, 'frais_garantie', v_amount - v_saved,
                               'from_rachat', v_fund_share, 'from_revenus', v_rev_debit));

    v_debited := v_debited + 1;
    v_total := v_total + v_amount;
    v_saved_total := v_saved_total + v_saved;
    v_from_fund := v_from_fund + v_fund_share;
    if v_new_bal < 0 then v_negative := v_negative + 1; end if;
  end loop;

  return jsonb_build_object(
    'period', v_period,
    'drivers_scanned', v_drivers,
    'debited', v_debited,
    'cotisations_fcfa', v_total,
    'saved_fcfa', v_saved_total,
    'from_rachat_fcfa', v_from_fund,
    'balances_negative', v_negative
  );
end;
$fn$;
revoke execute on function public.charge_driver_insurance(date) from public, anon, authenticated;
grant execute on function public.charge_driver_insurance(date) to service_role;

-- 6. Jauge du chauffeur : objectif tout compris, part de TamCar comprenant les versements hors application déclarés
drop function if exists public.driver_floor_today(uuid);
create function public.driver_floor_today(p_driver_id uuid)
returns table (
  applies boolean, versement_fcfa int, volume_fcfa int, tamcar_part_fcfa int, pct int, surplus_fcfa int, remaining_fcfa int,
  excused boolean, is_sunday boolean, started boolean, starts_on date, extension_days int, contract_end_on date,
  cotisation_fcfa int, savings_fcfa int, offline_fcfa int, reached boolean
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_target int;
  v_cot int;
  v_vol int := 0;
  v_part int := 0;
  v_off int := 0;
  v_s int;
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
begin
  if not exists (select 1 from public.drivers d where d.id = p_driver_id and (d.profile_id = auth.uid() or public.is_admin())) then
    raise exception 'Not authorized';
  end if;
  v_target := public._floor_target(p_driver_id);
  v_cot := case when v_target > 0 then public._tamassur_amount(p_driver_id) else 0 end;
  select t.volume, t.part into v_vol, v_part from public._floor_day_totals(p_driver_id, v_today) t;
  select coalesce(sum(o.amount_fcfa), 0)::int into v_off from public.driver_offline_payments o where o.driver_id = p_driver_id and o.day = v_today;
  v_s := v_part + v_off;

  return query select
    v_target > 0,
    v_target,
    v_vol,
    v_s,
    case when v_target > 0 then (v_s * 100 / v_target) else 0 end,
    greatest(0, v_s - v_target),
    greatest(0, v_target - v_s),
    exists (select 1 from public.driver_excused_days x where x.driver_id = p_driver_id and x.day = v_today),
    extract(dow from v_today) = 0,
    v_today >= public._floor_start(),
    public._floor_start(),
    (select count(*)::int from public.driver_excused_days x where x.driver_id = p_driver_id),
    public._cession_end(p_driver_id),
    v_cot,
    case when v_target > 0 then public._tamassur_savings_day(p_driver_id) else 0 end,
    v_off,
    v_target > 0 and v_s >= v_target;
end;
$fn$;
revoke execute on function public.driver_floor_today(uuid) from public, anon;
grant execute on function public.driver_floor_today(uuid) to authenticated;

-- 7. L'administrateur enregistre un versement hors application : objectif atteint -> jauge, épargne, remboursement d'un manque déjà prélevé
create or replace function public.admin_declare_offline_payment(p_driver_id uuid, p_day date, p_amount int, p_method text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_prof uuid;
  v_app text;
  v_target int;
  v_id uuid;
  v_res jsonb;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_method is null or p_method not in ('cash', 'mobile_money') then raise exception 'Moyen de paiement invalide (espèces ou Mobile Money)'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'Montant invalide (entre 1 et 1 000 000 F)'; end if;
  if p_day is null or p_day > v_today then raise exception 'La date ne peut pas être dans le futur'; end if;
  if p_day < v_today - 30 then raise exception 'On ne peut pas déclarer un jour de plus de 30 jours en arrière'; end if;
  if extract(dow from p_day) = 0 then raise exception 'Pas d''objectif le dimanche'; end if;
  if p_day < public._floor_start() then
    raise exception 'L''objectif quotidien démarre le %', to_char(public._floor_start(), 'DD/MM/YYYY');
  end if;
  select profile_id, application_type::text into v_prof, v_app from public.drivers where id = p_driver_id;
  if v_prof is null then raise exception 'Chauffeur inconnu'; end if;
  if v_app <> 'cession' then raise exception 'Seuls les chauffeurs en formule Cession ont un objectif quotidien'; end if;
  v_target := public._floor_target(p_driver_id);
  if v_target <= 0 then raise exception 'Aucun objectif pour ce véhicule'; end if;
  if exists (select 1 from public.driver_excused_days x where x.driver_id = p_driver_id and x.day = p_day) then
    raise exception 'Ce jour est déclaré non travaillé : retirez-le d''abord';
  end if;

  insert into public.driver_offline_payments (driver_id, day, amount_fcfa, method, note, created_by)
  values (p_driver_id, p_day, p_amount, p_method, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;

  -- Jour déjà clôturé : prélèvement ajusté (remboursement du manque) ; jour en cours : seule l'épargne, dès que l'objectif est atteint
  v_res := public._floor_eval_day(p_driver_id, p_day, p_day < v_today);

  perform public._push_notify(
    v_prof, 'Versement hors application enregistré',
    'TamCar a enregistré ' || p_amount || ' F reçus ' || case when p_method = 'mobile_money' then 'par Mobile Money' else 'en espèces' end
      || ' pour le ' || to_char(p_day, 'DD/MM') || '.'
      || case when coalesce((v_res ->> 'reached')::boolean, false) then ' Objectif atteint : votre épargne avance.' else '' end,
    '/dashboard', 'offline:' || v_id::text, false
  );

  return jsonb_build_object('id', v_id, 'reached', coalesce((v_res ->> 'reached')::boolean, false), 'part_fcfa', v_res -> 'part', 'target_fcfa', v_target,
                            'shortfall_fcfa', v_res -> 'shortfall', 'saved_fcfa', v_res -> 'saved');
end;
$fn$;
revoke execute on function public.admin_declare_offline_payment(uuid, date, int, text, text) from public, anon;
grant execute on function public.admin_declare_offline_payment(uuid, date, int, text, text) to authenticated;

drop function if exists public.admin_driver_offline_payments(uuid);
create function public.admin_driver_offline_payments(p_driver_id uuid)
returns table (id uuid, day date, amount_fcfa int, method text, note text, created_at timestamptz, created_by_name text, day_status text, day_saved_fcfa int)
language sql stable security definer set search_path = public as $fn$
  select o.id, o.day, o.amount_fcfa, o.method, o.note, o.created_at, p.full_name,
         (select l.status from public.driver_floor_log l where l.driver_id = o.driver_id and l.day = o.day),
         (select c.saved_fcfa from public.driver_insurance_charges c where c.driver_id = o.driver_id and c.period = o.day and c.status = 'paid')
    from public.driver_offline_payments o
    left join public.profiles p on p.id = o.created_by
   where o.driver_id = p_driver_id and public.is_admin()
   order by o.day desc, o.created_at desc
   limit 60;
$fn$;
revoke execute on function public.admin_driver_offline_payments(uuid) from public, anon;
grant execute on function public.admin_driver_offline_payments(uuid) to authenticated;

-- 8. Fiche contrat (admin) : objectif tout compris en plus du versement
create or replace function public.admin_driver_contract(p_driver_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_app text; v_cat text; v_manual date; v_start date;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select d.application_type::text, v.category::text, d.cession_start_on into v_app, v_cat, v_manual
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id where d.id = p_driver_id;
  if not found then raise exception 'Chauffeur inconnu'; end if;
  v_start := coalesce(v_manual, public._tamassur_start(p_driver_id));
  return jsonb_build_object(
    'application_type', v_app,
    'category', v_cat,
    'versement_fcfa', case when v_app = 'cession' then public._vehicle_versement(coalesce(v_cat, '')) else 0 end,
    'target_fcfa', public._floor_target(p_driver_id),
    'cotisation_fcfa', case when v_app = 'cession' then public._tamassur_amount(p_driver_id) else 0 end,
    'start_on', v_start,
    'manual_start', v_manual is not null,
    'months', public._tamassur_months(p_driver_id),
    'extension_days', (select count(*)::int from public.driver_excused_days x where x.driver_id = p_driver_id),
    'end_on', public._cession_end(p_driver_id),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'day', x.day, 'reason', x.reason, 'note', x.note,
        'closed', exists (select 1 from public.driver_floor_log l where l.driver_id = x.driver_id and l.day = x.day)
      ) order by x.day desc)
        from public.driver_excused_days x where x.driver_id = p_driver_id), '[]'::jsonb)
  );
end;
$fn$;
