-- ============================================================
-- Fin de course par le chauffeur (2026-10-28)
--
-- Jusqu'ici seul le client terminait la course (client_request_completion). Si le
-- client ne peut pas le faire (téléphone éteint, descendu sans terminer), le
-- chauffeur reste bloqué. Cette migration lui permet de terminer, sous contrôle :
--
--   1. la course doit être en cours (in_progress, démarrée) ;
--   2. fin libre près de la destination (<= end_near_m) OU une fois la durée
--      estimée atteinte ; ailleurs, une RAISON est obligatoire ;
--   3. loin de la destination : prix recalculé au prorata (même formule que
--      pour le client) ;
--   4. chaque fin est tracée (qui, quand, position GPS, distance, durée) ;
--   5. fin à plus de end_near_m de la destination, ou position incohérente :
--      litige ouvert automatiquement + alerte admin ;
--   6. le client est prévenu (push) et peut contester pendant end_contest_min ;
--   7. end_alert_count fins loin de la destination en end_alert_days jours
--      pour un même chauffeur : alerte admin.
--
-- L'ancienne driver_complete_ride (sans aucun contrôle, appelable directement
-- par n'importe quel chauffeur) est neutralisée.
-- ============================================================

-- A. Réglages (modifiables depuis /admin/fins-de-course) -------------------
insert into public.program_rules (key, value, label) values
  ('end_near_m',      500, 'Fin par le chauffeur : distance (m) à la destination en deçà de laquelle la fin est libre'),
  ('end_contest_min', 60,  'Fin par le chauffeur : délai (minutes) pendant lequel le client peut contester'),
  ('end_alert_count', 3,   'Fin par le chauffeur : nombre de fins loin de la destination qui déclenche une alerte admin'),
  ('end_alert_days',  7,   'Fin par le chauffeur : période de comptage de ces fins (jours)')
on conflict (key) do nothing;

-- B. Trace de chaque fin de course faite par le chauffeur -------------------
create table if not exists public.ride_end_reviews (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references public.rides(id) on delete cascade,
  driver_id uuid references public.drivers(id),
  ended_by_profile_id uuid not null references public.profiles(id),
  ended_at timestamptz not null default now(),
  end_lat double precision,
  end_lng double precision,
  gps_accuracy_m int,
  gps_source text not null default 'reported' check (gps_source in ('server', 'reported')),
  gps_gap_m int,
  dist_to_dropoff_m int not null,
  elapsed_min numeric(8,1) not null,
  expected_min int,
  near boolean not null,
  duration_reached boolean not null,
  reason_code text check (reason_code is null or reason_code in ('client_asked_stop', 'client_left', 'vehicle_problem', 'safety', 'other')),
  reason_text text,
  price_before_fcfa int,
  price_after_fcfa int,
  flags text[] not null default '{}',
  status text not null default 'recorded' check (status in ('recorded', 'dispute', 'resolved')),
  contest_until timestamptz not null,
  contested_at timestamptz,
  contest_note text,
  verdict text check (verdict is null or verdict in ('valid', 'driver_fault')),
  admin_note text,
  credit_fcfa int not null default 0,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists ride_end_reviews_status_idx on public.ride_end_reviews (status, created_at desc);
create index if not exists ride_end_reviews_driver_idx on public.ride_end_reviews (driver_id, created_at desc);

alter table public.ride_end_reviews enable row level security;
drop policy if exists ride_end_reviews_select on public.ride_end_reviews;
create policy ride_end_reviews_select on public.ride_end_reviews for select using (
  public.is_admin()
  or exists (select 1 from public.rides r where r.id = ride_end_reviews.ride_id and r.client_id = auth.uid())
  or driver_id in (select dr.id from public.drivers dr where dr.profile_id = auth.uid())
);
revoke insert, update, delete on public.ride_end_reviews from anon, authenticated;

-- C. Évaluation commune (aperçu + fin) : position, distance, durée, prix -----
create or replace function public._ride_end_eval(
  p_ride public.rides,
  p_driver public.drivers,
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_rep geography;
  v_pos geography;
  v_src text;
  v_gap int := null;
  v_dist double precision;
  v_near_m int := public._program_rule('end_near_m');
  v_near boolean;
  v_elapsed numeric;
  v_exp int;
  v_dur boolean;
  v_price int;
  v_min int;
  v_floor int;
  v_ratio numeric;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Position GPS requise pour terminer la course.';
  end if;
  v_rep := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  -- Position de référence : celle que le serveur connaît (battement récent du
  -- chauffeur) ; à défaut, celle que l'application transmet.
  if p_driver.current_location is not null and p_driver.last_seen_at is not null
     and p_driver.last_seen_at > now() - interval '120 seconds' then
    v_pos := p_driver.current_location;
    v_src := 'server';
    v_gap := round(st_distance(p_driver.current_location, v_rep))::int;
  else
    v_pos := v_rep;
    v_src := 'reported';
  end if;

  v_dist := st_distance(v_pos, p_ride.dropoff_location);
  v_near := v_dist <= v_near_m;
  v_elapsed := round((extract(epoch from (now() - coalesce(p_ride.started_at, now()))) / 60.0)::numeric, 1);
  v_exp := coalesce(p_ride.duration_min, 0);
  v_dur := v_exp > 0 and v_elapsed >= v_exp;

  -- Prix : plein tarif près de la destination ; sinon prorata de la distance
  -- parcourue (formule de client_request_completion, jamais au-dessus du prix initial).
  v_price := p_ride.price_total_fcfa;
  if not v_near then
    v_ratio := case when coalesce(p_ride.distance_km, 0) > 0
                    then greatest(0, p_ride.distance_km - (v_dist / 1000.0)) / p_ride.distance_km
                    else 0 end;
    select t.min_course_fcfa into v_min
      from public.pricing_tiers t
     where t.category = coalesce(p_ride.requested_category, 'essentiel'::vehicle_category);
    v_min := coalesce(v_min, 500);
    v_floor := public.ceil_to_50(greatest(v_min, floor(p_ride.price_total_fcfa * 0.30)::int));
    v_price := public.ceil_to_50(greatest(v_floor, floor(p_ride.price_total_fcfa * v_ratio)::int));
    v_price := least(v_price, p_ride.price_total_fcfa);
  end if;

  return jsonb_build_object(
    'dist_m', round(v_dist)::int,
    'near', v_near,
    'near_m', v_near_m,
    'elapsed_min', v_elapsed,
    'expected_min', v_exp,
    'duration_reached', v_dur,
    'reason_required', (not v_near and not v_dur),
    'gps_source', v_src,
    'gps_gap_m', v_gap,
    'price_fcfa', v_price,
    'price_total_fcfa', p_ride.price_total_fcfa,
    'contest_min', public._program_rule('end_contest_min')
  );
end;
$fn$;
revoke all on function public._ride_end_eval(public.rides, public.drivers, double precision, double precision) from public, anon, authenticated;

-- D. Aperçu pour l'écran du chauffeur ---------------------------------------
create or replace function public.ride_end_preview(
  p_ride_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  r public.rides;
  d public.drivers;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into d from public.drivers dd where dd.profile_id = auth.uid();
  if d.id is null then raise exception 'Not a driver'; end if;
  select * into r from public.rides rr where rr.id = p_ride_id;
  if r.id is null then raise exception 'Course introuvable'; end if;
  if r.driver_id is distinct from d.id then raise exception 'Not your ride'; end if;
  if r.status <> 'in_progress' or r.started_at is null then raise exception 'La course n''est pas en cours.'; end if;
  return public._ride_end_eval(r, d, p_lat, p_lng);
end;
$fn$;
grant execute on function public.ride_end_preview(uuid, double precision, double precision) to authenticated;

-- E. La fin de course par le chauffeur --------------------------------------
create or replace function public.driver_finish_ride(
  ride_id uuid,
  actual_lat double precision,
  actual_lng double precision,
  p_accuracy_m int default null,
  p_reason_code text default null,
  p_reason_text text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  d public.drivers;
  ev jsonb;
  v_reason text;
  v_text text;
  v_flags text[] := '{}';
  v_near boolean;
  v_dispute boolean;
  v_dist int;
  v_price int;
  v_contest int;
  v_days int;
  v_n int;
  v_name text;
  v_review public.ride_end_reviews;
  v_label text;
  v_body text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into d from public.drivers dd where dd.profile_id = auth.uid();
  if d.id is null then raise exception 'Not a driver'; end if;

  select * into r from public.rides rr where rr.id = driver_finish_ride.ride_id for update;
  if r.id is null then raise exception 'Course introuvable'; end if;
  if r.driver_id is distinct from d.id then raise exception 'Not your ride'; end if;
  if r.status <> 'in_progress' or r.started_at is null then
    raise exception 'La course n''est pas en cours.';
  end if;
  if r.completion_requested_at is not null then
    raise exception 'Le client a déjà demandé la fin de la course : acceptez sa demande.';
  end if;

  ev := public._ride_end_eval(r, d, actual_lat, actual_lng);
  v_near := (ev->>'near')::boolean;
  v_dist := (ev->>'dist_m')::int;
  v_price := (ev->>'price_fcfa')::int;

  v_reason := nullif(trim(coalesce(p_reason_code, '')), '');
  v_text := nullif(trim(coalesce(p_reason_text, '')), '');
  if v_reason is not null and v_reason not in ('client_asked_stop', 'client_left', 'vehicle_problem', 'safety', 'other') then
    v_reason := null;
  end if;
  if (ev->>'reason_required')::boolean then
    if v_reason is null then
      raise exception 'Vous êtes à % m de la destination et la durée estimée (% min) n''est pas atteinte : indiquez la raison de la fin.',
        v_dist, ev->>'expected_min';
    end if;
    if v_reason = 'other' and length(coalesce(v_text, '')) < 5 then
      raise exception 'Précisez la raison (5 caractères minimum).';
    end if;
  end if;

  -- Indicateurs : tout ce qui rend la fin discutable
  if not v_near then v_flags := array_append(v_flags, 'far_from_destination'); end if;
  if ev->>'gps_source' = 'reported' then v_flags := array_append(v_flags, 'gps_unverified'); end if;
  if ev->>'gps_gap_m' is not null and (ev->>'gps_gap_m')::int > 300 then v_flags := array_append(v_flags, 'gps_mismatch'); end if;
  if p_accuracy_m is not null and p_accuracy_m > 100 then v_flags := array_append(v_flags, 'gps_coarse'); end if;
  v_dispute := ('far_from_destination' = any (v_flags)) or ('gps_mismatch' = any (v_flags));

  -- Application : plein tarif près de la destination, prorata sinon
  if v_near then
    update public.rides
       set status = 'completed', ended_at = now(), updated_at = now()
     where id = r.id;
  else
    update public.rides
       set completion_requested_at = now(),
           completion_requested_lat = actual_lat,
           completion_requested_lng = actual_lng,
           completion_distance_from_dropoff_m = v_dist,
           completion_recomputed_price_fcfa = v_price,
           updated_at = now()
     where id = r.id;
    perform public._apply_completion(r.id);
  end if;

  -- Trace
  v_contest := greatest(public._program_rule('end_contest_min'), 1);
  insert into public.ride_end_reviews (
    ride_id, driver_id, ended_by_profile_id, end_lat, end_lng, gps_accuracy_m, gps_source, gps_gap_m,
    dist_to_dropoff_m, elapsed_min, expected_min, near, duration_reached, reason_code, reason_text,
    price_before_fcfa, price_after_fcfa, flags, status, contest_until
  ) values (
    r.id, d.id, auth.uid(), actual_lat, actual_lng, p_accuracy_m, ev->>'gps_source', (ev->>'gps_gap_m')::int,
    v_dist, (ev->>'elapsed_min')::numeric, (ev->>'expected_min')::int, v_near, (ev->>'duration_reached')::boolean,
    v_reason, v_text, r.price_total_fcfa, v_price, v_flags,
    case when v_dispute then 'dispute' else 'recorded' end,
    now() + make_interval(mins => v_contest)
  ) returning * into v_review;

  -- Le client est prévenu et peut contester
  v_body := case
    when v_near then 'Votre chauffeur a terminé la course à destination. Un souci ? Vous pouvez contester pendant ' || v_contest || ' min.'
    else 'Votre chauffeur a terminé la course à ' || v_dist || ' m de la destination ; le prix est ajusté à ' || v_price
         || ' F. Vous pouvez contester pendant ' || v_contest || ' min.'
  end;
  perform public._push_notify(r.client_id, 'Course terminée par votre chauffeur', v_body, '/ride/' || r.id::text, 'ride:' || r.id::text, true);

  -- Litige automatique + alertes admin
  select p.full_name into v_name from public.profiles p where p.id = auth.uid();
  v_label := case v_reason
    when 'client_asked_stop' then 'le client a demandé à s''arrêter'
    when 'client_left' then 'le client est descendu'
    when 'vehicle_problem' then 'panne ou accident'
    when 'safety' then 'sécurité'
    when 'other' then coalesce(v_text, 'autre')
    else null end;
  if v_dispute then
    perform public._admin_alert(
      'ride_end_dispute', 'normal', 'Fin de course à examiner',
      coalesce(v_name, 'Un chauffeur') || ' a terminé une course à ' || v_dist || ' m de la destination'
        || case when v_label is not null then ' (' || v_label || ')' else '' end || '.',
      '/admin/fins-de-course', v_review.id);
  end if;

  if not v_near then
    v_days := greatest(public._program_rule('end_alert_days'), 1);
    select count(*) into v_n
      from public.ride_end_reviews x
     where x.driver_id = d.id and not x.near
       and x.created_at > now() - make_interval(days => v_days);
    if v_n >= greatest(public._program_rule('end_alert_count'), 1)
       and not exists (
         select 1 from public.admin_alerts a
          where a.kind = 'driver_early_ends' and a.ref_id = d.id
            and a.created_at > now() - make_interval(days => v_days)) then
      perform public._admin_alert(
        'driver_early_ends', 'normal', 'Fins de course anticipées répétées',
        coalesce(v_name, 'Un chauffeur') || ' a terminé ' || v_n || ' courses loin de la destination en ' || v_days || ' jours.',
        '/admin/fins-de-course', d.id);
    end if;
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'near', v_near,
    'dispute', v_dispute,
    'dist_m', v_dist,
    'price_fcfa', v_price,
    'review_id', v_review.id
  );
end;
$fn$;
grant execute on function public.driver_finish_ride(uuid, double precision, double precision, int, text, text) to authenticated;

-- F. Ancienne fin de course du chauffeur : sans contrôle, neutralisée ---------
create or replace function public.driver_complete_ride(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $fn$
begin
  raise exception 'La fin de course par le chauffeur passe par driver_finish_ride (position, durée et raison contrôlées).';
end;
$fn$;
revoke execute on function public.driver_complete_ride(uuid) from public, anon, authenticated;

-- G. Information sur une fin (client, chauffeur, admin) ----------------------
create or replace function public.ride_end_info(p_ride_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  rv public.ride_end_reviews;
  r public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides rr where rr.id = p_ride_id;
  if r.id is null then return null; end if;
  if not (
    public.is_admin()
    or r.client_id = auth.uid()
    or r.driver_id in (select dd.id from public.drivers dd where dd.profile_id = auth.uid())
  ) then
    raise exception 'Not your ride';
  end if;
  select * into rv from public.ride_end_reviews x where x.ride_id = p_ride_id;
  if rv.id is null then return null; end if;
  return jsonb_build_object(
    'ended_by', 'driver',
    'ended_at', rv.ended_at,
    'near', rv.near,
    'dist_m', rv.dist_to_dropoff_m,
    'price_before_fcfa', rv.price_before_fcfa,
    'price_after_fcfa', rv.price_after_fcfa,
    'status', rv.status,
    'contest_until', rv.contest_until,
    'contested_at', rv.contested_at,
    'verdict', rv.verdict,
    'credit_fcfa', rv.credit_fcfa,
    'can_contest', (now() <= rv.contest_until and rv.contested_at is null and rv.status <> 'resolved' and r.client_id = auth.uid())
  );
end;
$fn$;
grant execute on function public.ride_end_info(uuid) to authenticated;

-- H. Contestation par le client ------------------------------------------------
create or replace function public.client_contest_ride_end(p_ride_id uuid, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  rv public.ride_end_reviews;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_name text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides rr where rr.id = p_ride_id;
  if r.id is null then raise exception 'Course introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  select * into rv from public.ride_end_reviews x where x.ride_id = p_ride_id for update;
  if rv.id is null then raise exception 'Cette course n''a pas été terminée par le chauffeur.'; end if;
  if rv.contested_at is not null then raise exception 'Vous avez déjà contesté cette fin de course.'; end if;
  if rv.status = 'resolved' then raise exception 'Cette fin de course a déjà été examinée.'; end if;
  if now() > rv.contest_until then raise exception 'Le délai de contestation est dépassé.'; end if;
  if v_note is null or length(v_note) < 3 then raise exception 'Expliquez brièvement ce qui ne va pas.'; end if;

  update public.ride_end_reviews
     set contested_at = now(), contest_note = left(v_note, 500), status = 'dispute'
   where id = rv.id;

  select p.full_name into v_name from public.profiles p where p.id = auth.uid();
  perform public._admin_alert(
    'ride_end_contest', 'normal', 'Fin de course contestée par le client',
    coalesce(v_name, 'Un client') || ' conteste la fin de sa course : ' || left(v_note, 140),
    '/admin/fins-de-course', rv.id);

  return jsonb_build_object('contested', true);
end;
$fn$;
grant execute on function public.client_contest_ride_end(uuid, text) to authenticated;

-- I. Admin : liste et décision ---------------------------------------------------
create or replace function public.admin_ride_end_reviews(p_filter text default 'open')
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc)
    from (
      select
        rv.id, rv.ride_id, rv.created_at, rv.ended_at, rv.status, rv.near, rv.dist_to_dropoff_m,
        rv.elapsed_min, rv.expected_min, rv.duration_reached, rv.reason_code, rv.reason_text, rv.flags,
        rv.gps_source, rv.gps_gap_m, rv.gps_accuracy_m, rv.end_lat, rv.end_lng,
        rv.price_before_fcfa, rv.price_after_fcfa, rv.contest_until, rv.contested_at, rv.contest_note,
        rv.verdict, rv.admin_note, rv.credit_fcfa, rv.resolved_at, rv.driver_id,
        dp.full_name as driver_name, dp.phone as driver_phone,
        cp.full_name as client_name, cp.phone as client_phone,
        r.pickup_address, r.dropoff_address
      from public.ride_end_reviews rv
      join public.rides r on r.id = rv.ride_id
      left join public.drivers dr on dr.id = rv.driver_id
      left join public.profiles dp on dp.id = dr.profile_id
      left join public.profiles cp on cp.id = r.client_id
      where case coalesce(p_filter, 'open')
              when 'open' then rv.status = 'dispute'
              when 'resolved' then rv.status = 'resolved'
              else true end
      order by rv.created_at desc
      limit 200
    ) t
  ), '[]'::jsonb);
end;
$fn$;
grant execute on function public.admin_ride_end_reviews(text) to authenticated;

create or replace function public.admin_resolve_ride_end(
  p_review_id uuid,
  p_verdict text,
  p_note text default null,
  p_credit_fcfa int default 0
)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  rv public.ride_end_reviews;
  r public.rides;
  v_credit int := coalesce(p_credit_fcfa, 0);
  v_wallet uuid;
  v_driver_profile uuid;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_verdict not in ('valid', 'driver_fault') then raise exception 'Décision inconnue'; end if;
  if v_credit < 0 or v_credit > 5000 then raise exception 'Le geste commercial est limité à 5 000 F.'; end if;

  select * into rv from public.ride_end_reviews x where x.id = p_review_id for update;
  if rv.id is null then raise exception 'Fin de course introuvable'; end if;
  if rv.status = 'resolved' then raise exception 'Déjà examinée'; end if;
  select * into r from public.rides rr where rr.id = rv.ride_id;

  if v_credit > 0 then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (r.client_id, 'tamcar_credit', 0)
      on conflict (profile_id, kind) do nothing;
    select w.id into v_wallet from public.wallets w where w.profile_id = r.client_id and w.kind = 'tamcar_credit';
    update public.wallets set balance_fcfa = balance_fcfa + v_credit, updated_at = now() where id = v_wallet;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
      values (v_wallet, 'goodwill_credit', v_credit, r.id, 'success');
  end if;

  if p_verdict = 'driver_fault' and rv.driver_id is not null then
    insert into public.driver_warnings (driver_id, level, reason, notes)
      values (rv.driver_id, 'warning', 'Fin de course abusive', nullif(trim(coalesce(p_note, '')), ''));
    select dr.profile_id into v_driver_profile from public.drivers dr where dr.id = rv.driver_id;
    if v_driver_profile is not null then
      perform public._push_notify(v_driver_profile, 'Avertissement',
        'Une de vos fins de course a été jugée abusive. Terminez la course à destination, ou indiquez la vraie raison.',
        '/', 'end-warning:' || rv.id::text, true);
    end if;
  end if;

  update public.ride_end_reviews
     set status = 'resolved', verdict = p_verdict, admin_note = nullif(trim(coalesce(p_note, '')), ''),
         credit_fcfa = v_credit, resolved_at = now(), resolved_by = auth.uid()
   where id = rv.id;

  if rv.contested_at is not null then
    perform public._push_notify(r.client_id, 'Contestation examinée',
      case when v_credit > 0 then 'Votre contestation a été examinée : ' || v_credit || ' F ont été crédités sur votre TamCar Crédit.'
           else 'Votre contestation a été examinée par l''équipe TamCar.' end,
      '/ride/' || r.id::text, 'ride:' || r.id::text, false);
  end if;

  return jsonb_build_object('resolved', true);
end;
$fn$;
grant execute on function public.admin_resolve_ride_end(uuid, text, text, int) to authenticated;

-- J. Pastille admin : fins de course à examiner -----------------------------------
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
    'tamassur',        (select count(*) from public.tamassur_withdrawals where status = 'pending'),
    'disputes',        0,
    'ride_ends',       (select count(*) from public.ride_end_reviews where status = 'dispute')
  );
end;
$fn$;
