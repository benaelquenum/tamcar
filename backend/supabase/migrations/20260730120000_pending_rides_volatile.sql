-- ============================================================
-- TamCar — Fix pool chauffeur : volatilité de pending_rides_for_driver
-- (2026-07-30)
--
--   La fonction était déclarée STABLE alors qu'elle exécute
--   _release_due_scheduled_rides() (UPDATE de rides). PostgREST route
--   les RPC stable en transaction lecture seule → « cannot execute
--   UPDATE in a read-only transaction » (+ 405) → le pool de courses du
--   chauffeur ne charge plus. On la recrée VOLATILE (défaut), corps
--   identique (règles VIP incluses).
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
  requested_at timestamptz,
  requested_category vehicle_category,
  downgrade_accepted_at timestamptz,
  is_below_driver_category boolean
)
language plpgsql security invoker as $fn_pending$
#variable_conflict use_column
declare
  v_drv_id uuid;
  v_drv_loc geography;
  v_drv_category vehicle_category;
  v_active_dropoff geography;
  v_active_count int;
  v_search_origin geography;
  v_effective_radius double precision;
begin
  -- Piggy-back : libère les scheduled dues
  perform public._release_due_scheduled_rides();

  select d.id, d.current_location, v.category
    into v_drv_id, v_drv_loc, v_drv_category
  from public.drivers d
  left join public.vehicles v on v.id = d.current_vehicle_id
  where d.profile_id = auth.uid()
    and d.is_online = true
    and d.status = 'active'
  limit 1;

  if v_drv_id is null or v_drv_loc is null or v_drv_category is null then
    return;
  end if;

  select count(*)::int into v_active_count
   from public.rides r
   where r.driver_id = v_drv_id
     and r.status in ('matched', 'arrived', 'in_progress');
  if v_active_count >= 2 then return; end if;

  if v_active_count = 1 then
    select r.dropoff_location into v_active_dropoff
     from public.rides r
     where r.driver_id = v_drv_id
       and r.status in ('matched', 'arrived', 'in_progress')
     order by r.matched_at asc limit 1;
  end if;

  if v_active_dropoff is not null then
    v_search_origin := v_active_dropoff;
    v_effective_radius := 3.0;
  else
    v_search_origin := v_drv_loc;
    v_effective_radius := radius_km;
  end if;

  return query
  select
    r.id, r.pickup_address, r.dropoff_address,
    st_y(r.pickup_location::geometry) as pickup_lat,
    st_x(r.pickup_location::geometry) as pickup_lng,
    st_y(r.dropoff_location::geometry) as dropoff_lat,
    st_x(r.dropoff_location::geometry) as dropoff_lng,
    st_distance(r.pickup_location, v_search_origin) as distance_from_driver_m,
    r.distance_km, r.duration_min,
    r.price_total_fcfa, r.driver_share_fcfa,
    r.requested_at,
    r.requested_category, r.downgrade_accepted_at,
    (
      (v_drv_category = 'confort' and r.requested_category = 'essentiel')
      or (v_drv_category = 'premium' and r.requested_category in ('confort', 'essentiel'))
    ) as is_below_driver_category
  from public.rides r
  where r.status = 'requested'
    and r.driver_id is null
    and st_dwithin(r.pickup_location, v_search_origin, v_effective_radius * 1000)
    and (
      v_drv_category = r.requested_category
      or (v_drv_category = 'confort' and r.requested_category = 'essentiel')
      or (v_drv_category = 'premium' and r.requested_category in ('confort', 'essentiel'))
    )
  order by st_distance(r.pickup_location, v_search_origin) asc
  limit 20;
end;
$fn_pending$;
