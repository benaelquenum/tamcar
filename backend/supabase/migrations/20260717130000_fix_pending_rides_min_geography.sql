-- ============================================================
-- Fix pending_rides_for_driver : min(geography) does not exist
-- On sépare le comptage et la récupération du dropoff active en 2 requêtes,
-- plus simples et sans agrégation sur geography.
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
  v_drv_loc geography;
  v_active_dropoff geography;
  v_active_count int;
  v_search_origin geography;
  v_effective_radius double precision;
begin
  -- 1. Récupère le chauffeur online
  select d.id, d.current_location
    into v_drv_id, v_drv_loc
  from public.drivers d
  where d.profile_id = auth.uid()
    and d.is_online = true
    and d.status = 'active'
  limit 1;

  if v_drv_id is null or v_drv_loc is null then
    return;
  end if;

  -- 2. Compte les courses actives
  select count(*)::int
    into v_active_count
  from public.rides r
  where r.driver_id = v_drv_id
    and r.status in ('matched', 'arrived', 'in_progress');

  -- 3. Déjà 2 courses → plus rien à proposer
  if v_active_count >= 2 then
    return;
  end if;

  -- 4. Si une course active → capture son dropoff pour centrer le pool
  if v_active_count = 1 then
    select r.dropoff_location
      into v_active_dropoff
    from public.rides r
    where r.driver_id = v_drv_id
      and r.status in ('matched', 'arrived', 'in_progress')
    order by r.matched_at asc
    limit 1;
  end if;

  -- 5. Choix de l'origine de recherche
  if v_active_dropoff is not null then
    v_search_origin := v_active_dropoff;
    v_effective_radius := 3.0;
  else
    v_search_origin := v_drv_loc;
    v_effective_radius := radius_km;
  end if;

  -- 6. Retourne les courses disponibles dans le rayon
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
