-- ============================================================
-- TamCar — Versement quotidien (formule Cession) : jauge « part de TamCar », prélèvement du manque à minuit,
-- jours non travaillés (le contrat est prolongé d'autant). Décisions de Terence, 2026-10-07/08.
--
--   • Part de TamCar du jour = somme, sur les courses terminées ce jour-là, de (prix − part du chauffeur) :
--     c'est ce que TamCar (et le propriétaire du véhicule) retient déjà course par course. Elle continue de
--     compter AU-DELÀ du versement : l'excédent est pour TamCar (le bonus de performance, inchangé, en rend la moitié).
--   • Versement du jour : moto 2 500, tricycle 5 000, Essentiel 7 200, Confort 9 000 F (réglages versement_*).
--   • À 00 h 10 (heure de Porto-Novo), pour la veille, du lundi au samedi : si la part de TamCar est sous le versement,
--     le manque est prélevé sur le portefeuille Revenus (solde négatif accepté, comme la cotisation TamAssur ;
--     la suspension à −5 000 F s'applique comme pour toute dette). Jamais le dimanche. Idempotent.
--   • Jour non travaillé (panne, maladie) enregistré par l'admin : rien n'est prélevé (ni versement ni TamAssur)
--     et le contrat est prolongé du nombre de jours. Un jour déjà prélevé est remboursé.
--   • Seulement la formule Cession (pas les propriétaires). Démarrage : réglage floor_debit_from (défaut 2027-01-01).
-- ============================================================

-- A. Réglages -------------------------------------------------------------
insert into public.program_rules (key, value, label) values
  ('versement_moto',      2500, 'Versement minimal par jour (part de TamCar) : moto (F)'),
  ('versement_tricycle',  5000, 'Versement minimal par jour (part de TamCar) : tricycle (F)'),
  ('versement_essentiel', 7200, 'Versement minimal par jour (part de TamCar) : voiture Essentiel (F)'),
  ('versement_confort',   9000, 'Versement minimal par jour (part de TamCar) : voiture Confort (F)')
on conflict (key) do nothing;

insert into public._push_settings (key, value)
values ('floor_debit_from', '2027-01-01')
on conflict (key) do nothing;

create or replace function public._floor_start()
returns date language sql stable security definer set search_path = public as $fn$
  select coalesce((select nullif(value, '')::date from public._push_settings where key = 'floor_debit_from'), date '2027-01-01');
$fn$;
revoke execute on function public._floor_start() from public, anon, authenticated;

create or replace function public._vehicle_versement(p_category text)
returns int language sql stable security definer set search_path = public as $fn$
  select case p_category
    when 'moto'      then public._program_rule('versement_moto')
    when 'tricycle'  then public._program_rule('versement_tricycle')
    when 'essentiel' then public._program_rule('versement_essentiel')
    when 'confort'   then public._program_rule('versement_confort')
    else 0 end;
$fn$;
revoke execute on function public._vehicle_versement(text) from public, anon, authenticated;

-- B. Tables -----------------------------------------------------------------
alter table public.drivers add column if not exists cession_start_on date;

create table if not exists public.driver_excused_days (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  day date not null,
  reason text not null check (reason in ('panne', 'maladie', 'autre')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (driver_id, day)
);
create index if not exists driver_excused_days_day_idx on public.driver_excused_days (day desc);
alter table public.driver_excused_days enable row level security;
drop policy if exists driver_excused_days_select on public.driver_excused_days;
create policy driver_excused_days_select on public.driver_excused_days for select
  using (public.is_admin() or driver_id in (select id from public.drivers where profile_id = auth.uid()));

create table if not exists public.driver_floor_log (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  day date not null,
  due_fcfa int not null,
  volume_fcfa int not null default 0,
  tamcar_part_fcfa int not null default 0,
  shortfall_fcfa int not null default 0,
  status text not null check (status in ('covered', 'charged', 'excused', 'refunded')),
  created_at timestamptz not null default now(),
  unique (driver_id, day)
);
create index if not exists driver_floor_log_day_idx on public.driver_floor_log (day desc);
alter table public.driver_floor_log enable row level security;
drop policy if exists driver_floor_log_select on public.driver_floor_log;
create policy driver_floor_log_select on public.driver_floor_log for select
  using (public.is_admin() or driver_id in (select id from public.drivers where profile_id = auth.uid()));

-- C. Totaux d'un jour ---------------------------------------------------------
create or replace function public._floor_day_totals(p_driver uuid, p_day date)
returns table (volume int, part int)
language sql stable security definer set search_path = public as $fn$
  select coalesce(sum(r.price_total_fcfa), 0)::int,
         coalesce(sum(greatest(0, r.price_total_fcfa - coalesce(r.driver_share_fcfa, 0))), 0)::int
    from public.rides r
   where r.driver_id = p_driver and r.status = 'completed'
     and (r.ended_at at time zone 'Africa/Porto-Novo')::date = p_day;
$fn$;
revoke execute on function public._floor_day_totals(uuid, date) from public, anon, authenticated;

-- Fin estimée du contrat : début + durée de la cession + jours non travaillés
create or replace function public._cession_end(p_driver uuid)
returns date language sql stable security definer set search_path = public as $fn$
  select case when s.d is null then null
         else (s.d + make_interval(months => public._tamassur_months(p_driver))
                   + make_interval(days => (select count(*)::int from public.driver_excused_days x where x.driver_id = p_driver)))::date end
    from (select coalesce((select cession_start_on from public.drivers where id = p_driver), public._tamassur_start(p_driver)) as d) s;
$fn$;
revoke execute on function public._cession_end(uuid) from public, anon, authenticated;

-- D. Jauge du chauffeur ---------------------------------------------------------
drop function if exists public.driver_floor_today(uuid);
create or replace function public.driver_floor_today(p_driver_id uuid)
returns table (
  applies boolean,
  versement_fcfa int,
  volume_fcfa int,
  tamcar_part_fcfa int,
  pct int,
  surplus_fcfa int,
  remaining_fcfa int,
  excused boolean,
  is_sunday boolean,
  started boolean,
  starts_on date,
  extension_days int,
  contract_end_on date
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_cat text;
  v_app text;
  v_due int;
  v_vol int := 0;
  v_part int := 0;
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
begin
  if not exists (select 1 from public.drivers d where d.id = p_driver_id and (d.profile_id = auth.uid() or public.is_admin())) then
    raise exception 'Not authorized';
  end if;
  select v.category::text, d.application_type::text into v_cat, v_app
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = p_driver_id;
  v_due := case when v_app = 'cession' then public._vehicle_versement(coalesce(v_cat, '')) else 0 end;
  select t.volume, t.part into v_vol, v_part from public._floor_day_totals(p_driver_id, v_today) t;

  return query select
    v_due > 0,
    v_due,
    v_vol,
    v_part,
    case when v_due > 0 then (v_part * 100 / v_due) else 0 end,
    greatest(0, v_part - v_due),
    greatest(0, v_due - v_part),
    exists (select 1 from public.driver_excused_days x where x.driver_id = p_driver_id and x.day = v_today),
    extract(dow from v_today) = 0,
    v_today >= public._floor_start(),
    public._floor_start(),
    (select count(*)::int from public.driver_excused_days x where x.driver_id = p_driver_id),
    public._cession_end(p_driver_id);
end;
$fn$;
revoke execute on function public.driver_floor_today(uuid) from public, anon;
grant execute on function public.driver_floor_today(uuid) to authenticated;

-- E. Clôture de minuit : prélèvement du manque ---------------------------------
create or replace function public.charge_driver_floor(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Porto-Novo')::date - 1);
  v_drv record;
  v_due int;
  v_vol int;
  v_part int;
  v_short int;
  v_log uuid;
  v_wallet uuid;
  v_scanned int := 0;
  v_covered int := 0;
  v_excused int := 0;
  v_charged int := 0;
  v_total int := 0;
begin
  if extract(dow from v_day) = 0 then
    return jsonb_build_object('day', v_day, 'skipped', 'sunday');
  end if;
  if v_day < public._floor_start() then
    return jsonb_build_object('day', v_day, 'skipped', 'not_started', 'starts_on', public._floor_start());
  end if;

  for v_drv in
    select d.id, d.profile_id, v.category::text as cat
      from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.application_type::text = 'cession'
  loop
    v_due := public._vehicle_versement(v_drv.cat);
    if v_due <= 0 then continue; end if;
    v_scanned := v_scanned + 1;

    if exists (select 1 from public.driver_floor_log l where l.driver_id = v_drv.id and l.day = v_day) then continue; end if;

    if exists (select 1 from public.driver_excused_days x where x.driver_id = v_drv.id and x.day = v_day) then
      insert into public.driver_floor_log (driver_id, day, due_fcfa, status)
      values (v_drv.id, v_day, v_due, 'excused') on conflict (driver_id, day) do nothing;
      v_excused := v_excused + 1;
      continue;
    end if;

    select t.volume, t.part into v_vol, v_part from public._floor_day_totals(v_drv.id, v_day) t;
    v_short := greatest(0, v_due - v_part);

    v_log := null;
    insert into public.driver_floor_log (driver_id, day, due_fcfa, volume_fcfa, tamcar_part_fcfa, shortfall_fcfa, status)
    values (v_drv.id, v_day, v_due, v_vol, v_part, v_short, case when v_short = 0 then 'covered' else 'charged' end)
    on conflict (driver_id, day) do nothing
    returning id into v_log;
    if v_log is null then continue; end if;

    if v_short = 0 then
      v_covered := v_covered + 1;
      continue;
    end if;

    select id into v_wallet from public.wallets where profile_id = v_drv.profile_id and kind = 'tamcar_revenus' for update;
    if v_wallet is null then
      insert into public.wallets (profile_id, kind, balance_fcfa) values (v_drv.profile_id, 'tamcar_revenus', 0)
      returning id into v_wallet;
    end if;
    update public.wallets set balance_fcfa = balance_fcfa - v_short, updated_at = now() where id = v_wallet;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_wallet, 'floor_topup', v_short, 'internal', 'success',
            jsonb_build_object('day', v_day, 'due', v_due, 'tamcar_part', v_part, 'volume', v_vol));

    perform public._push_notify(
      v_drv.profile_id,
      'Versement du jour : ' || v_short || ' F prélevés',
      'Le ' || to_char(v_day, 'DD/MM') || ', la part de TamCar sur vos courses était de ' || v_part || ' F pour ' || v_due
        || ' F de versement. Les ' || v_short || ' F manquants ont été prélevés sur votre portefeuille.',
      '/wallet', 'floor:' || v_day::text, false
    );
    v_charged := v_charged + 1;
    v_total := v_total + v_short;
  end loop;

  return jsonb_build_object('day', v_day, 'drivers_scanned', v_scanned, 'covered', v_covered,
                            'excused', v_excused, 'charged', v_charged, 'charged_fcfa', v_total);
end;
$fn$;
revoke execute on function public.charge_driver_floor(date) from public, anon, authenticated;
grant execute on function public.charge_driver_floor(date) to service_role;

do $cron$
begin
  perform cron.unschedule('driver-floor-close');
exception when others then null;
end;
$cron$;
-- 23 h 10 UTC = 00 h 10 à Porto-Novo : clôture de la veille
select cron.schedule('driver-floor-close', '10 23 * * *', $job$ select public.charge_driver_floor(); $job$);

-- F. Jours non travaillés (admin) -------------------------------------------------
create or replace function public.admin_excuse_driver_days(
  p_driver_id uuid, p_from date, p_to date, p_reason text, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_added int := 0;
  v_refunded int := 0;
  v_row record;
  v_wallet uuid;
  v_profile uuid;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_reason not in ('panne', 'maladie', 'autre') then raise exception 'Motif invalide'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Période invalide'; end if;
  if p_to - p_from > 90 then raise exception 'Période trop longue (90 jours au plus)'; end if;
  if p_from < v_today - 30 then raise exception 'On ne peut pas déclarer un jour de plus de 30 jours en arrière'; end if;
  select profile_id into v_profile from public.drivers where id = p_driver_id;
  if v_profile is null then raise exception 'Chauffeur inconnu'; end if;

  insert into public.driver_excused_days (driver_id, day, reason, note, created_by)
  select p_driver_id, g::date, p_reason, nullif(trim(p_note), ''), auth.uid()
    from generate_series(p_from, p_to, interval '1 day') g
   where extract(dow from g) <> 0
  on conflict (driver_id, day) do nothing;
  get diagnostics v_added = row_count;

  -- Un jour déjà prélevé est remboursé
  for v_row in
    select l.id, l.day, l.shortfall_fcfa from public.driver_floor_log l
     where l.driver_id = p_driver_id and l.day between p_from and p_to and l.status = 'charged'
  loop
    select id into v_wallet from public.wallets where profile_id = v_profile and kind = 'tamcar_revenus' for update;
    if v_wallet is null then continue; end if;
    update public.wallets set balance_fcfa = balance_fcfa + v_row.shortfall_fcfa, updated_at = now() where id = v_wallet;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_wallet, 'floor_refund', v_row.shortfall_fcfa, 'internal', 'success',
            jsonb_build_object('day', v_row.day, 'reason', p_reason));
    update public.driver_floor_log set status = 'refunded' where id = v_row.id;
    v_refunded := v_refunded + v_row.shortfall_fcfa;
  end loop;

  if v_added > 0 then
    perform public._push_notify(
      v_profile, 'Jours non travaillés enregistrés',
      v_added || ' jour' || case when v_added > 1 then 's' else '' end || ' non travaillé' || case when v_added > 1 then 's' else '' end
        || ' (' || p_reason || ') : rien n''est prélevé et votre contrat est prolongé d''autant.',
      '/dashboard', 'excused:' || p_from::text, false
    );
  end if;
  return jsonb_build_object('added', v_added, 'refunded_fcfa', v_refunded);
end;
$fn$;
revoke execute on function public.admin_excuse_driver_days(uuid, date, date, text, text) from public, anon;
grant execute on function public.admin_excuse_driver_days(uuid, date, date, text, text) to authenticated;

create or replace function public.admin_remove_excused_day(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select * into r from public.driver_excused_days where id = p_id;
  if not found then raise exception 'Jour introuvable'; end if;
  if exists (select 1 from public.driver_floor_log l where l.driver_id = r.driver_id and l.day = r.day) then
    raise exception 'Ce jour est déjà clôturé : il ne peut plus être retiré.';
  end if;
  delete from public.driver_excused_days where id = p_id;
end;
$fn$;
revoke execute on function public.admin_remove_excused_day(uuid) from public, anon;
grant execute on function public.admin_remove_excused_day(uuid) to authenticated;

create or replace function public.admin_set_cession_start(p_driver_id uuid, p_date date)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update public.drivers set cession_start_on = p_date where id = p_driver_id;
  if not found then raise exception 'Chauffeur inconnu'; end if;
end;
$fn$;
revoke execute on function public.admin_set_cession_start(uuid, date) from public, anon;
grant execute on function public.admin_set_cession_start(uuid, date) to authenticated;

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
revoke execute on function public.admin_driver_contract(uuid) from public, anon;
grant execute on function public.admin_driver_contract(uuid) to authenticated;

-- G. TamAssur : rien n'est prélevé un jour non travaillé -----------------------
create or replace function public.charge_driver_insurance(p_period date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn_charge$
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
  v_charge_id uuid;
  v_new_bal int;
  v_drivers int := 0;
  v_debited int := 0;
  v_total int := 0;
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
  loop
    v_drivers := v_drivers + 1;
    v_amount := public._tamassur_amount(v_drv.id);

    v_charge_id := null;
    insert into public.driver_insurance_charges
      (driver_id, period, amount_fcfa, collected_fcfa, status, collected_at)
    values (v_drv.id, v_period, v_amount, v_amount, 'paid', now())
    on conflict (driver_id, period) do update
      set amount_fcfa = excluded.amount_fcfa,
          collected_fcfa = excluded.collected_fcfa,
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

    -- Part du fonds de rachat (jamais en négatif : sinon la part manquante reste sur Revenus)
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
    update public.wallets set balance_fcfa = balance_fcfa + v_amount, updated_at = now()
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
    values (v_epargne_id, 'tamassur_saving', v_amount, 'internal', 'success',
            jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm',
                               'from_rachat', v_fund_share, 'from_revenus', v_rev_debit));

    v_debited := v_debited + 1;
    v_total := v_total + v_amount;
    v_from_fund := v_from_fund + v_fund_share;
    if v_new_bal < 0 then v_negative := v_negative + 1; end if;
  end loop;

  return jsonb_build_object(
    'period', v_period,
    'drivers_scanned', v_drivers,
    'debited', v_debited,
    'saved_fcfa', v_total,
    'from_rachat_fcfa', v_from_fund,
    'balances_negative', v_negative
  );
end;
$fn_charge$;
revoke execute on function public.charge_driver_insurance(date) from public, anon, authenticated;
grant execute on function public.charge_driver_insurance(date) to service_role;
