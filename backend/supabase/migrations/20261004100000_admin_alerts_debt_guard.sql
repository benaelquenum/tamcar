-- ============================================================
-- TamCar — Alertes admin (SOS, dettes) + garde-fou de dette (2026-10-04)
--
--   1. admin_alerts : fil d'alertes pour le back-office. Chaque alerte
--      déclenche (a) une ligne lue en temps réel par l'admin (sirène,
--      bandeau, badge), (b) un push sur les appareils de TOUS les admins.
--   2. SOS : chaque nouvelle alerte SOS crée une alerte « critique ».
--   3. Dette chauffeur : dès que le wallet Revenus atteint −5 000 F,
--      le chauffeur est SUSPENDU AUTOMATIQUEMENT (hors ligne, motif
--      « dette ») ; dès que le solde repasse au-dessus de −5 000 F
--      (règlement, gains…), il est RÉACTIVÉ AUTOMATIQUEMENT. Aucune
--      intervention de l'admin, qui est seulement prévenu.
--      Une suspension manuelle (motif vide) n'est jamais levée par le
--      système.
--   4. Compteurs de badges pour les onglets du back-office.
-- ============================================================

-- A. Motif de suspension ------------------------------------------------
alter table public.drivers
  add column if not exists suspension_reason text,
  add column if not exists suspended_at timestamptz;

-- Un chauffeur qui n'est plus suspendu n'a plus de motif.
create or replace function public._drivers_clear_suspension_reason()
returns trigger language plpgsql as $fn$
begin
  if new.status::text <> 'suspended' then
    new.suspension_reason := null;
    new.suspended_at := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists drivers_clear_suspension_reason on public.drivers;
create trigger drivers_clear_suspension_reason
  before update of status on public.drivers
  for each row when (new.status is distinct from old.status)
  execute function public._drivers_clear_suspension_reason();

-- B. Fil d'alertes admin ------------------------------------------------
create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                       -- sos | driver_debt | debt_cleared | dispute_review
  severity text not null default 'normal' check (severity in ('critical', 'normal', 'info')),
  title text not null,
  body text,
  link text,
  ref_id uuid,
  seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_alerts_created_idx on public.admin_alerts (created_at desc);
create index if not exists admin_alerts_unseen_idx on public.admin_alerts (kind) where seen_at is null;

alter table public.admin_alerts enable row level security;
drop policy if exists admin_alerts_select on public.admin_alerts;
create policy admin_alerts_select on public.admin_alerts for select using (public.is_admin());
-- Aucune policy d'écriture : seules les fonctions security definer écrivent.

do $pub$
begin
  alter publication supabase_realtime add table public.admin_alerts;
exception when duplicate_object then null;
end
$pub$;

-- Crée l'alerte + push chez chaque admin. Interne : jamais appelable par l'API.
create or replace function public._admin_alert(
  p_kind text,
  p_severity text,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_ref uuid default null
)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_admin record;
begin
  insert into public.admin_alerts (kind, severity, title, body, link, ref_id)
  values (p_kind, p_severity, p_title, p_body, p_link, p_ref);

  if p_severity in ('critical', 'normal') then
    for v_admin in select id from public.profiles where role::text = 'admin' loop
      perform public._push_notify(
        v_admin.id, p_title, coalesce(p_body, ''), coalesce(p_link, '/admin'),
        'admin-' || p_kind || coalesce(':' || p_ref::text, ''),
        p_severity = 'critical'
      );
    end loop;
  end if;
end;
$fn$;
revoke execute on function public._admin_alert(text, text, text, text, text, uuid) from public, anon, authenticated;

-- C. SOS -> alerte critique --------------------------------------------
create or replace function public._sos_alert_to_admin()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_name text;
  v_phone text;
begin
  select full_name, phone into v_name, v_phone from public.profiles where id = new.triggered_by;
  perform public._admin_alert(
    'sos', 'critical',
    'SOS — ' || case new.role when 'driver' then 'chauffeur ' else 'client ' end || coalesce(v_name, ''),
    coalesce(nullif(trim(new.reason), ''), 'Aucune précision')
      || case when new.ride_id is not null then ' · course en cours' else '' end
      || case when v_phone is not null then ' · ' || v_phone else '' end,
    '/admin/sos', new.id
  );
  return new;
end;
$fn$;
revoke execute on function public._sos_alert_to_admin() from public, anon, authenticated;

drop trigger if exists sos_alert_to_admin on public.sos_alerts;
create trigger sos_alert_to_admin
  after insert on public.sos_alerts
  for each row execute function public._sos_alert_to_admin();

-- D. Garde-fou de dette : suspension / réactivation automatiques --------
create or replace function public._debt_guard_apply(p_profile_id uuid, p_balance int)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_drv record;
begin
  select d.id, d.status::text as status, d.suspension_reason, p.full_name
    into v_drv
    from public.drivers d join public.profiles p on p.id = d.profile_id
   where d.profile_id = p_profile_id;
  if v_drv.id is null then return; end if;

  if p_balance <= -5000 then
    if v_drv.status = 'active' then
      update public.drivers
         set status = 'suspended', suspension_reason = 'debt', suspended_at = now(),
             is_online = false, updated_at = now()
       where id = v_drv.id;
      perform public._admin_alert(
        'driver_debt', 'normal',
        'Dette de ' || (-p_balance) || ' F — ' || v_drv.full_name || ' suspendu',
        'Suspension automatique : le chauffeur est hors ligne et sera réactivé dès que sa dette repasse sous 5 000 F.',
        '/admin/dettes', v_drv.id
      );
      perform public._push_notify(
        p_profile_id, 'Compte suspendu : dette à régler',
        'Votre solde est de ' || p_balance || ' F. Réglez au moins ' || (-p_balance - 4999)
          || ' F depuis l''application : votre compte sera réactivé automatiquement.',
        '/wallet', 'debt-suspended', true
      );
    end if;
  else
    if v_drv.status = 'suspended' and v_drv.suspension_reason = 'debt' then
      update public.drivers
         set status = 'active', suspension_reason = null, suspended_at = null, updated_at = now()
       where id = v_drv.id;
      perform public._admin_alert(
        'debt_cleared', 'info',
        v_drv.full_name || ' : dette réglée, compte réactivé',
        'Réactivation automatique (solde Revenus : ' || p_balance || ' F).',
        '/admin/dettes', v_drv.id
      );
      perform public._push_notify(
        p_profile_id, 'Compte réactivé',
        'Votre dette est réglée. Vous pouvez vous remettre en ligne.',
        '/', 'debt-cleared', false
      );
    end if;
  end if;
end;
$fn$;
revoke execute on function public._debt_guard_apply(uuid, int) from public, anon, authenticated;

create or replace function public._wallet_debt_guard()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  perform public._debt_guard_apply(new.profile_id, new.balance_fcfa);
  return new;
end;
$fn$;
revoke execute on function public._wallet_debt_guard() from public, anon, authenticated;

drop trigger if exists wallets_debt_guard on public.wallets;
create trigger wallets_debt_guard
  after insert or update of balance_fcfa on public.wallets
  for each row
  when (new.kind::text = 'tamcar_revenus')
  execute function public._wallet_debt_guard();

-- Filet de sécurité : rattrape tout ce que le déclencheur aurait manqué
-- (ex. admin qui réactive à la main un chauffeur encore endetté).
create or replace function public._debt_guard_sweep()
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_row record;
  v_n int := 0;
begin
  for v_row in
    select w.profile_id, w.balance_fcfa
      from public.wallets w
      join public.drivers d on d.profile_id = w.profile_id
     where w.kind::text = 'tamcar_revenus'
       and ((w.balance_fcfa <= -5000 and d.status::text = 'active')
         or (w.balance_fcfa > -5000 and d.status::text = 'suspended' and d.suspension_reason = 'debt'))
  loop
    perform public._debt_guard_apply(v_row.profile_id, v_row.balance_fcfa);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;
revoke execute on function public._debt_guard_sweep() from public, anon, authenticated;

do $cron$
begin
  perform cron.unschedule('debt-guard-sweep');
exception when others then null;
end
$cron$;
select cron.schedule('debt-guard-sweep', '*/15 * * * *', $job$ select public._debt_guard_sweep(); $job$);

-- E. Mise en ligne : mêmes règles que la suspension (seuil −5 000 F inclus)
create or replace function public.driver_go_online(
  current_lng double precision,
  current_lat double precision
)
returns public.drivers
language plpgsql security definer set search_path = public as $$
declare
  result public.drivers;
  v_balance int;
  v_until timestamptz;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select status::text into v_status from public.drivers where profile_id = auth.uid();
  if v_status = 'suspended' then
    raise exception 'Compte suspendu. Si c''est pour une dette, réglez-la depuis votre portefeuille : la réactivation est automatique.'
      using errcode = 'P0001';
  end if;

  -- Blocage dette : à partir de −5 000 F, recharger avant de repasser en ligne.
  select balance_fcfa into v_balance from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus';
  if coalesce(v_balance, 0) <= -5000 then
    raise exception 'Dette de % F (seuil de 5 000 F atteint). Rechargez au moins % F pour repasser en ligne.',
      (-v_balance), (-v_balance - 4999)
      using errcode = 'P0001';
  end if;

  -- Véhicule réservé : pas de mise en ligne pendant la location ni son tampon.
  select max(vr.ends_at) into v_until
    from public.vehicle_rentals vr
    join public.drivers d on d.id = vr.driver_id
    join public.rental_rates rr on rr.category = vr.category
   where d.profile_id = auth.uid()
     and vr.status in ('confirmed', 'in_progress')
     and now() >= vr.starts_at - make_interval(mins => rr.block_before_min)
     and now() < vr.ends_at;
  if v_until is not null then
    raise exception 'Ton véhicule est réservé (location VIP) jusqu''à %. Tu repasseras en ligne ensuite.',
      to_char(v_until at time zone 'Africa/Porto-Novo', 'HH24"h"MI')
      using errcode = 'P0001';
  end if;

  update public.drivers
  set is_online = true,
      current_location = st_setsrid(st_makepoint(current_lng, current_lat), 4326)::geography,
      last_seen_at = now(),
      updated_at = now()
  where profile_id = auth.uid()
  returning * into result;

  if result is null then
    raise exception 'Not a driver';
  end if;
  return result;
end;
$$;
grant execute on function public.driver_go_online(double precision, double precision) to authenticated;

-- F. Compteurs de badges + marquage « vu » ------------------------------
create or replace function public.admin_badge_counts()
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.is_admin() then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'sos',             (select count(*) from public.sos_alerts where status = 'open'),
    'sos_active',      (select count(*) from public.sos_alerts where status <> 'resolved'),
    'debts',           (select count(*) from public.admin_alerts where kind = 'driver_debt' and seen_at is null),
    'debts_suspended', (select count(*) from public.drivers where status::text = 'suspended' and suspension_reason = 'debt'),
    'disputes',        0
  );
end;
$fn$;
revoke execute on function public.admin_badge_counts() from public, anon;
grant execute on function public.admin_badge_counts() to authenticated;

create or replace function public.admin_mark_alerts_seen(p_kind text)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update public.admin_alerts set seen_at = now() where kind = p_kind and seen_at is null;
end;
$fn$;
revoke execute on function public.admin_mark_alerts_seen(text) from public, anon;
grant execute on function public.admin_mark_alerts_seen(text) to authenticated;

-- G. Liste des dettes : indique les suspensions automatiques -------------
drop function if exists public.admin_driver_debts();
create or replace function public.admin_driver_debts()
returns table (
  driver_id uuid,
  full_name text,
  phone text,
  debt_fcfa int,
  is_online boolean,
  last_seen_at timestamptz,
  driver_status text,
  suspended_for_debt boolean,
  suspended_at timestamptz
)
language sql stable security definer set search_path = public as $fn$
  select
    d.id as driver_id,
    p.full_name,
    p.phone,
    (-w.balance_fcfa)::int as debt_fcfa,
    d.is_online,
    d.last_seen_at,
    d.status::text as driver_status,
    (d.status::text = 'suspended' and d.suspension_reason = 'debt') as suspended_for_debt,
    d.suspended_at
  from public.wallets w
  join public.drivers d on d.profile_id = w.profile_id
  join public.profiles p on p.id = d.profile_id
  where w.kind = 'tamcar_revenus'
    and w.balance_fcfa < 0
    and (select public.is_admin())
  order by w.balance_fcfa asc;
$fn$;
revoke execute on function public.admin_driver_debts() from public, anon;
grant execute on function public.admin_driver_debts() to authenticated;

-- H. TamAssur : le push « dette » est désormais envoyé par le garde-fou (suspension),
--    on retire celui de la fonction de prélèvement pour éviter le doublon.
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
  v_amount int;
  v_charge_id uuid;
  v_new_bal int;
  v_drivers int := 0;
  v_debited int := 0;
  v_total int := 0;
  v_negative int := 0;
begin
  -- Pas de prélèvement le dimanche
  if extract(dow from v_period) = 0 then
    return jsonb_build_object('period', v_period, 'skipped', 'sunday');
  end if;

  -- Pas de prélèvement avant la date d'activation
  select nullif(value, '')::date into v_from
    from public._push_settings where key = 'tamassur_debit_from';
  v_from := coalesce(v_from, date '2027-01-01');
  if v_period < v_from then
    return jsonb_build_object('period', v_period, 'skipped', 'not_started', 'starts_on', v_from);
  end if;

  for v_drv in
    select id, profile_id, coalesce(tamassur_fcfa, 1000) as amount
      from public.drivers where status = 'active'
  loop
    v_drivers := v_drivers + 1;
    v_amount := greatest(v_drv.amount, 1000);

    -- Calendrier : la ligne du jour est créée directement « paid » ;
    -- si elle l'est déjà (relance de la tâche), on ne prélève pas deux fois.
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

    -- Poches Revenus et Épargne (création paresseuse), verrou sur Revenus
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

    -- Prélèvement ferme : le solde peut devenir négatif
    v_new_bal := v_rev_bal - v_amount;
    update public.wallets set balance_fcfa = v_new_bal, updated_at = now() where id = v_rev_id;
    update public.wallets set balance_fcfa = balance_fcfa + v_amount, updated_at = now()
     where id = v_epargne_id;

    insert into public.wallet_transactions
      (wallet_id, type, amount_fcfa, provider, status, meta)
    values
      (v_rev_id, 'insurance_premium', v_amount, 'internal', 'success',
       jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm')),
      (v_epargne_id, 'tamassur_saving', v_amount, 'internal', 'success',
       jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm'));

    v_debited := v_debited + 1;
    v_total := v_total + v_amount;
    if v_new_bal < 0 then v_negative := v_negative + 1; end if;

  end loop;

  return jsonb_build_object(
    'period', v_period,
    'drivers_scanned', v_drivers,
    'debited', v_debited,
    'saved_fcfa', v_total,
    'balances_negative', v_negative
  );
end;
$fn_charge$;

revoke execute on function public.charge_driver_insurance(date) from public, anon, authenticated;
grant execute on function public.charge_driver_insurance(date) to service_role;
