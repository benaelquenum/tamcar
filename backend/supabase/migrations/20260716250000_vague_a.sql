-- ============================================================
-- Vague A : Fin de course en 2 étapes + Multi-course chauffeur (2026-07-16)
--
-- Sujet 1 — Fin en 2 étapes :
--   • client_request_completion : le client demande à finir. Si proche du dropoff
--     (≤ 500 m), fin directe. Sinon, recalcul prix au prorata + attente 20 s
--     pour accept chauffeur ; passé ce délai, auto-accept.
--   • driver_accept_completion : le chauffeur valide manuellement avant le TO.
--   • auto_accept_completion : callable par le client une fois le TO expiré
--     (SECURITY DEFINER, garde-fou pour ne pas laisser une course bloquée).
--
-- Sujet 4 — Multi-course :
--   • accept_ride : retrait du blocage "course active" (max 1 course active + 1
--     course "prochaine" en queue).
--   • pending_rides_for_driver : si course active → pool centré sur le dropoff
--     de cette course (rayon 3 km) au lieu de la position actuelle du chauffeur.
--   • driver_active_ride_of : indique si le chauffeur d'une ride donnée est
--     encore engagé sur une autre course + ETA de disponibilité.
-- ============================================================

-- ------------------------------------------------------------
-- Colonnes ajoutées à rides pour la fin en 2 étapes
-- ------------------------------------------------------------
alter table public.rides
  add column if not exists completion_requested_at timestamptz,
  add column if not exists completion_requested_lat double precision,
  add column if not exists completion_requested_lng double precision,
  add column if not exists completion_distance_from_dropoff_m int,
  add column if not exists completion_recomputed_price_fcfa int,
  add column if not exists completion_auto_accept_at timestamptz;

-- ============================================================
-- SUJET 1 — Fin de course en 2 étapes
-- ============================================================

-- ------------------------------------------------------------
-- client_request_completion : le client (auth.uid) demande la fin
-- ------------------------------------------------------------
create or replace function public.client_request_completion(
  ride_id uuid,
  actual_lat double precision,
  actual_lng double precision
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  result public.rides;
  dist_to_dropoff_m double precision;
  original_distance_km numeric;
  travelled_km numeric;
  ratio numeric;
  recomputed int;
  price_floor int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status <> 'in_progress' then raise exception 'Course pas encore démarrée'; end if;

  -- Distance à vol d'oiseau position actuelle → dropoff via PostGIS geography
  dist_to_dropoff_m := st_distance(
    st_makepoint(actual_lng, actual_lat)::geography,
    r.dropoff_location
  );

  -- Cas 1 : proche du dropoff (≤ 500 m) → fin directe
  if dist_to_dropoff_m <= 500 then
    update public.rides
    set status = 'completed',
        ended_at = now(),
        updated_at = now()
    where id = ride_id
    returning * into result;
    return result;
  end if;

  -- Cas 2 : loin du dropoff → recalcul prix au prorata + attente chauffeur
  original_distance_km := r.distance_km;
  travelled_km := greatest(0, original_distance_km - (dist_to_dropoff_m / 1000.0));
  ratio := case when original_distance_km > 0 then travelled_km / original_distance_km else 0 end;
  price_floor := greatest(700, floor(r.price_total_fcfa * 0.30)::int); -- plancher 30% ou min course 700 F
  recomputed := greatest(price_floor, floor(r.price_total_fcfa * ratio)::int);

  update public.rides
  set completion_requested_at = now(),
      completion_requested_lat = actual_lat,
      completion_requested_lng = actual_lng,
      completion_distance_from_dropoff_m = round(dist_to_dropoff_m)::int,
      completion_recomputed_price_fcfa = recomputed,
      completion_auto_accept_at = now() + interval '20 seconds',
      updated_at = now()
  where id = ride_id
  returning * into result;

  return result;
end;
$$;

comment on function public.client_request_completion(uuid, double precision, double precision) is
  'Client demande la fin de course. Fin directe si ≤ 500 m du dropoff, sinon recalcul prix au prorata distance parcourue + attente 20 s du chauffeur.';

-- ------------------------------------------------------------
-- Applique effectivement la fin (utilisé par driver_accept + auto_accept)
-- ------------------------------------------------------------
create or replace function public._apply_completion(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  result public.rides;
  driver_app_type driver_application_type;
  dealer_id uuid;
  new_price int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer_share int;
  new_platform int;
begin
  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.status <> 'in_progress' then raise exception 'Statut invalide'; end if;
  if r.completion_requested_at is null then raise exception 'Aucune demande de fin en cours'; end if;

  -- Si un prix recomputé existe, on recalcule les shares selon la formule du driver
  if r.completion_recomputed_price_fcfa is not null then
    new_price := r.completion_recomputed_price_fcfa;

    if r.driver_id is not null then
      select application_type into driver_app_type from public.drivers where id = r.driver_id;
    end if;

    select dealer_partner_id into dealer_id
     from public.vehicles v join public.drivers d on d.current_vehicle_id = v.id
     where d.id = r.driver_id;

    if driver_app_type = 'proprietaire' then
      new_driver_cash := floor(new_price * 0.80)::int;
      new_driver_rachat := 0;
      new_dealer_share := 0;
      new_platform := new_price - new_driver_cash;
    else
      new_driver_cash := floor(new_price * 0.40)::int;
      new_driver_rachat := floor(new_price * 0.10)::int;
      new_dealer_share := floor(new_price * 0.30)::int;
      new_platform := new_price - new_driver_cash - new_driver_rachat - new_dealer_share;
    end if;

    update public.rides
    set price_total_fcfa = new_price,
        driver_share_fcfa = new_driver_cash,
        driver_rachat_fcfa = new_driver_rachat,
        dealer_share_fcfa = new_dealer_share,
        platform_share_fcfa = new_platform,
        status = 'completed',
        ended_at = now(),
        updated_at = now()
    where id = ride_id
    returning * into result;
  else
    update public.rides
    set status = 'completed',
        ended_at = now(),
        updated_at = now()
    where id = ride_id
    returning * into result;
  end if;

  return result;
end;
$$;

-- ------------------------------------------------------------
-- driver_accept_completion : le chauffeur accepte avant le TO
-- ------------------------------------------------------------
create or replace function public.driver_accept_completion(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  driver_row public.drivers;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;

  select * into driver_row from public.drivers where id = r.driver_id;
  if driver_row is null or driver_row.profile_id <> auth.uid() then
    raise exception 'Not the assigned driver';
  end if;

  return public._apply_completion(ride_id);
end;
$$;

-- ------------------------------------------------------------
-- auto_accept_completion : n'importe qui (client) peut forcer si TO passé
-- ------------------------------------------------------------
create or replace function public.auto_accept_completion(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.completion_auto_accept_at is null or now() < r.completion_auto_accept_at then
    raise exception 'Délai chauffeur pas encore écoulé';
  end if;

  return public._apply_completion(ride_id);
end;
$$;

-- ============================================================
-- SUJET 4 — Multi-course
-- ============================================================

-- ------------------------------------------------------------
-- accept_ride : retire le blocage 1-course, autorise 1 course en queue max
-- ------------------------------------------------------------
create or replace function public.accept_ride(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  driver_row public.drivers;
  dealer_id uuid;
  result public.rides;
  total int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer_share int;
  new_platform int;
  active_count int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into driver_row from public.drivers where profile_id = auth.uid();
  if driver_row is null then raise exception 'Not a driver'; end if;
  if driver_row.status <> 'active' or not driver_row.is_online then
    raise exception 'Driver not active or offline';
  end if;
  if driver_row.current_vehicle_id is null then
    raise exception 'No vehicle assigned';
  end if;

  -- Autorisation multi-course : max 1 course active + 1 course "prochaine" en queue
  -- (donc jusqu'à 2 rides non-completed en simultané)
  select count(*)::int into active_count
  from public.rides
  where driver_id = driver_row.id
    and status in ('matched', 'arrived', 'in_progress');

  if active_count >= 2 then
    raise exception 'File d''attente pleine — tu as déjà 1 course active + 1 en queue.';
  end if;

  select dealer_partner_id into dealer_id
   from public.vehicles where id = driver_row.current_vehicle_id;

  select price_total_fcfa into total from public.rides where id = ride_id;

  if driver_row.application_type = 'proprietaire' then
    new_driver_cash := floor(total * 0.80)::int;
    new_driver_rachat := 0;
    new_dealer_share := 0;
    new_platform := total - new_driver_cash;
  else
    new_driver_cash := floor(total * 0.40)::int;
    new_driver_rachat := floor(total * 0.10)::int;
    new_dealer_share := floor(total * 0.30)::int;
    new_platform := total - new_driver_cash - new_driver_rachat - new_dealer_share;
  end if;

  update public.rides
  set driver_id = driver_row.id,
      vehicle_id = driver_row.current_vehicle_id,
      dealer_partner_id = case
        when driver_row.application_type = 'proprietaire' then null
        else dealer_id
      end,
      driver_share_fcfa = new_driver_cash,
      driver_rachat_fcfa = new_driver_rachat,
      dealer_share_fcfa = new_dealer_share,
      platform_share_fcfa = new_platform,
      status = 'matched',
      matched_at = now(),
      updated_at = now()
  where id = ride_id
    and status = 'requested'
    and driver_id is null
  returning * into result;

  if result is null then raise exception 'Ride already taken or unavailable'; end if;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- pending_rides_for_driver v2 : matching intelligent selon dropoff si occupé
-- ------------------------------------------------------------
create or replace function public.pending_rides_for_driver(
  radius_km double precision default 5.0
)
returns table (
  id uuid,
  pickup_address text,
  dropoff_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  distance_from_driver_m double precision,
  distance_km numeric,
  duration_min int,
  price_total_fcfa int,
  driver_share_fcfa int,
  requested_at timestamptz
)
language plpgsql stable security invoker as $$
declare
  drv_id uuid;
  drv_veh uuid;
  drv_loc geography;
  drv_cat vehicle_category;
  active_ride record;
  search_origin geography;
  active_count int;
  effective_radius double precision;
begin
  select d.id, d.current_vehicle_id, d.current_location
    into drv_id, drv_veh, drv_loc
  from public.drivers d
  where d.profile_id = auth.uid()
    and d.is_online = true
    and d.status = 'active'
  limit 1;

  if drv_id is null or drv_loc is null then
    return;
  end if;

  select category into drv_cat from public.vehicles where id = drv_veh;

  -- Y a-t-il une course active ?
  select r.dropoff_location, r.status, count(*) over () as cnt
    into active_ride
  from public.rides r
  where r.driver_id = drv_id
    and r.status in ('matched', 'arrived', 'in_progress')
  order by r.matched_at asc
  limit 1;

  active_count := coalesce(active_ride.cnt, 0);

  -- Si déjà 2 courses actives, plus rien à proposer
  if active_count >= 2 then
    return;
  end if;

  -- Si une course active existe → pool centré sur son dropoff, rayon 3 km
  if active_count = 1 and active_ride.dropoff_location is not null then
    search_origin := active_ride.dropoff_location;
    effective_radius := 3.0;
  else
    search_origin := drv_loc;
    effective_radius := radius_km;
  end if;

  return query
  select
    r.id,
    r.pickup_address,
    r.dropoff_address,
    st_y(r.pickup_location::geometry) as pickup_lat,
    st_x(r.pickup_location::geometry) as pickup_lng,
    st_y(r.dropoff_location::geometry) as dropoff_lat,
    st_x(r.dropoff_location::geometry) as dropoff_lng,
    st_distance(r.pickup_location, search_origin) as distance_from_driver_m,
    r.distance_km,
    r.duration_min,
    r.price_total_fcfa,
    r.driver_share_fcfa,
    r.requested_at
  from public.rides r
  where r.status = 'requested'
    and r.driver_id is null
    and st_dwithin(r.pickup_location, search_origin, effective_radius * 1000)
  order by distance_from_driver_m asc
  limit 20;
end;
$$;

comment on function public.pending_rides_for_driver(double precision) is
  'v2 : si le chauffeur a une course active, le pool est centré sur le dropoff de cette course (rayon 3 km) — matching intelligent. Sinon rayon standard depuis sa position.';

-- ------------------------------------------------------------
-- driver_active_ride_of : le chauffeur assigné à cette ride est-il occupé ailleurs ?
-- Retourne { id, dropoff_address, duration_min_remaining, is_busy } ou vide.
-- ------------------------------------------------------------
create or replace function public.driver_active_ride_of(p_ride_id uuid)
returns table (
  other_ride_id uuid,
  other_dropoff_address text,
  other_status ride_status,
  other_matched_at timestamptz,
  other_duration_min int,
  is_busy boolean
)
language sql stable security invoker as $$
  select
    other.id as other_ride_id,
    other.dropoff_address as other_dropoff_address,
    other.status as other_status,
    other.matched_at as other_matched_at,
    other.duration_min as other_duration_min,
    true as is_busy
  from public.rides me
  join public.rides other on other.driver_id = me.driver_id
  where me.id = p_ride_id
    and me.driver_id is not null
    and other.id <> me.id
    and other.status in ('matched', 'arrived', 'in_progress')
    and other.matched_at < me.matched_at
  order by other.matched_at asc
  limit 1;
$$;

comment on function public.driver_active_ride_of(uuid) is
  'Retourne l''autre course sur laquelle le chauffeur est engagé, si elle est antérieure à celle passée en param. Utilisé côté client pour "chauffeur libre dans ~X min".';
