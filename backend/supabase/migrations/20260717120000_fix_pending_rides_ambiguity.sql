-- ============================================================
-- Fix pending_rides_for_driver : "column reference id is ambiguous"
--
-- Cause : le RETURNS TABLE définit une colonne `id`, or le SELECT final
-- fait `select r.id` — PL/pgSQL confond variable/colonne selon le contexte.
-- Fix : directive #variable_conflict use_column pour donner priorité aux
-- colonnes SQL. Et qualification explicite du CTE active_ride.
-- ============================================================

create or replace function public.pending_rides_for_driver(
  radius_km double precision default 10.0
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
#variable_conflict use_column
declare
  v_drv_id uuid;
  v_drv_veh uuid;
  v_drv_loc geography;
  v_active_dropoff geography;
  v_active_count int;
  v_search_origin geography;
  v_effective_radius double precision;
begin
  select d.id, d.current_vehicle_id, d.current_location
    into v_drv_id, v_drv_veh, v_drv_loc
  from public.drivers d
  where d.profile_id = auth.uid()
    and d.is_online = true
    and d.status = 'active'
  limit 1;

  if v_drv_id is null or v_drv_loc is null then
    return;
  end if;

  -- Compte les courses actives + attrape le dropoff de la plus ancienne
  select count(*)::int, min(r.dropoff_location) filter (
    where r.id = (
      select r2.id from public.rides r2
      where r2.driver_id = v_drv_id
        and r2.status in ('matched', 'arrived', 'in_progress')
      order by r2.matched_at asc
      limit 1
    )
  )
    into v_active_count, v_active_dropoff
  from public.rides r
  where r.driver_id = v_drv_id
    and r.status in ('matched', 'arrived', 'in_progress');

  v_active_count := coalesce(v_active_count, 0);

  -- Déjà 2 courses actives → plus rien à proposer
  if v_active_count >= 2 then
    return;
  end if;

  -- Si une course active → pool centré sur son dropoff, rayon 3 km
  if v_active_count = 1 and v_active_dropoff is not null then
    v_search_origin := v_active_dropoff;
    v_effective_radius := 3.0;
  else
    v_search_origin := v_drv_loc;
    v_effective_radius := radius_km;
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
    st_distance(r.pickup_location, v_search_origin) as distance_from_driver_m,
    r.distance_km,
    r.duration_min,
    r.price_total_fcfa,
    r.driver_share_fcfa,
    r.requested_at
  from public.rides r
  where r.status = 'requested'
    and r.driver_id is null
    and st_dwithin(r.pickup_location, v_search_origin, v_effective_radius * 1000)
  order by st_distance(r.pickup_location, v_search_origin) asc
  limit 20;
end;
$$;
