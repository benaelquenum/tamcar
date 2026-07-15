-- ============================================================
-- TamCar — Driver actions (2026-07-15)
--
-- RPCs qu'un chauffeur appelle depuis son app :
--   driver_go_online(lng, lat)      — bascule en ligne, set position
--   driver_go_offline()             — bascule hors ligne
--   driver_update_location(lng, lat) — heartbeat position
--   pending_rides_for_driver(radius) — pool des courses à accepter
--   accept_ride(ride_id)            — accept atomique (premier arrivé)
--
-- + Policy RLS pour que les drivers actifs voient le pool.
-- ============================================================

-- ------------------------------------------------------------
-- Policy : driver actif voit les rides en attente (pool public)
-- ------------------------------------------------------------
create policy rides_driver_pool_read on public.rides for select
  using (
    status = 'requested'
    and driver_id is null
    and exists (
      select 1 from public.drivers
      where profile_id = auth.uid()
        and is_online = true
        and status = 'active'
    )
  );

-- ------------------------------------------------------------
-- driver_go_online : le chauffeur passe en ligne + set position
-- ------------------------------------------------------------
create or replace function public.driver_go_online(
  current_lng double precision,
  current_lat double precision
)
returns public.drivers
language plpgsql security invoker as $$
declare
  result public.drivers;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

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

-- ------------------------------------------------------------
-- driver_go_offline
-- ------------------------------------------------------------
create or replace function public.driver_go_offline()
returns void
language plpgsql security invoker as $$
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  update public.drivers
  set is_online = false,
      last_seen_at = now(),
      updated_at = now()
  where profile_id = auth.uid();
end;
$$;

-- ------------------------------------------------------------
-- driver_update_location : heartbeat position (appelé toutes les X sec)
-- ------------------------------------------------------------
create or replace function public.driver_update_location(
  current_lng double precision,
  current_lat double precision
)
returns void
language plpgsql security invoker as $$
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  update public.drivers
  set current_location = st_setsrid(st_makepoint(current_lng, current_lat), 4326)::geography,
      last_seen_at = now()
  where profile_id = auth.uid()
    and is_online = true;
end;
$$;

-- ------------------------------------------------------------
-- pending_rides_for_driver : pool des courses à accepter
-- Triées par distance au chauffeur, filtré status=requested & non attribuée
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
language sql stable security invoker as $$
  with me as (
    select current_location, current_vehicle_id
    from public.drivers
    where profile_id = auth.uid()
      and is_online = true
      and status = 'active'
    limit 1
  ),
  vehicle_cat as (
    select category from public.vehicles v, me
    where v.id = me.current_vehicle_id
    limit 1
  )
  select
    r.id,
    r.pickup_address,
    r.dropoff_address,
    st_y(r.pickup_location::geometry) as pickup_lat,
    st_x(r.pickup_location::geometry) as pickup_lng,
    st_y(r.dropoff_location::geometry) as dropoff_lat,
    st_x(r.dropoff_location::geometry) as dropoff_lng,
    st_distance(r.pickup_location, m.current_location) as distance_from_driver_m,
    r.distance_km,
    r.duration_min,
    r.price_total_fcfa,
    r.driver_share_fcfa,
    r.requested_at
  from public.rides r, me m
  where r.status = 'requested'
    and r.driver_id is null
    and m.current_location is not null
    and st_dwithin(r.pickup_location, m.current_location, radius_km * 1000)
  order by distance_from_driver_m asc
  limit 20;
$$;

-- ------------------------------------------------------------
-- accept_ride : UPDATE atomique. Premier chauffeur qui l'appelle avec succès
-- gagne la ride (les autres reçoivent une exception).
-- ------------------------------------------------------------
create or replace function public.accept_ride(ride_id uuid)
returns public.rides
language plpgsql security invoker as $$
declare
  driver_row public.drivers;
  dealer_id uuid;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into driver_row
  from public.drivers
  where profile_id = auth.uid();

  if driver_row is null then
    raise exception 'Not a driver';
  end if;
  if driver_row.status <> 'active' or not driver_row.is_online then
    raise exception 'Driver not active or offline';
  end if;
  if driver_row.current_vehicle_id is null then
    raise exception 'No vehicle assigned';
  end if;

  -- Récupère le dealer_partner_id du véhicule
  select dealer_partner_id into dealer_id
  from public.vehicles
  where id = driver_row.current_vehicle_id;

  -- UPDATE atomique : seulement si toujours en pool
  update public.rides
  set driver_id = driver_row.id,
      vehicle_id = driver_row.current_vehicle_id,
      dealer_partner_id = dealer_id,
      status = 'matched',
      matched_at = now(),
      updated_at = now()
  where id = ride_id
    and status = 'requested'
    and driver_id is null
  returning * into result;

  if result is null then
    raise exception 'Ride already taken or unavailable';
  end if;

  return result;
end;
$$;

comment on function public.accept_ride is
  'Un chauffeur accepte une course. Premier arrivé, premier servi (UPDATE atomique sur status=requested + driver_id null). Set driver_id + vehicle_id + dealer_partner_id + status=matched.';
