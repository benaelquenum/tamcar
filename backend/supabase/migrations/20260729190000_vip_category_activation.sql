-- ============================================================
-- TamCar — Activation catégorie VIP (2026-07-29)
--
--   Décision Terence : réactiver la valeur d'enum dormante 'premium'
--   sous le nom commercial « VIP » (aucun changement d'enum — le nom
--   affiché est géré côté front). La grille pricing_tiers 'premium'
--   existe déjà (base 1500, 180 F/km ville, 350 F/km corridor,
--   min course 1500) ainsi que les prix corridor (9000 jour / 12000 nuit).
--
--   1. drivers_availability_by_category : expose la ligne premium.
--   2. pending_rides_for_driver : le chauffeur VIP voit aussi les courses
--      Confort et Essentiel (flag is_below_driver_category → confirmation
--      « tarif réduit » côté app, comme Confort→Essentiel).
--   3. preview_alternative_offers : demande VIP sans chauffeur → propose
--      Confort/Essentiel ; demande Confort → propose aussi VIP (upgrade).
-- ============================================================

-- 1. Disponibilité par catégorie : + premium ---------------------------
create or replace function public.drivers_availability_by_category(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 10.0
)
returns table (
  category vehicle_category,
  online_count int,
  nearest_driver_distance_m int,
  eta_min int
)
language sql stable security definer set search_path = public as $$
  with pickup as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as geo
  ),
  eligible as (
    select
      v.category,
      st_distance(d.current_location, (select geo from pickup)) as dist_m
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.is_online = true
      and d.status = 'active'
      and d.current_location is not null
      and st_dwithin(d.current_location, (select geo from pickup), p_radius_km * 1000)
  ),
  agg as (
    select
      category,
      count(*)::int as online_count,
      min(dist_m)::int as nearest_driver_distance_m
    from eligible
    group by category
  ),
  cats(category) as (
    values ('moto'::vehicle_category), ('tricycle'::vehicle_category),
           ('essentiel'::vehicle_category), ('confort'::vehicle_category),
           ('premium'::vehicle_category)
  )
  select
    c.category,
    coalesce(a.online_count, 0) as online_count,
    a.nearest_driver_distance_m,
    case
      when a.nearest_driver_distance_m is null then null
      when c.category in ('moto', 'tricycle')
        then ceil(a.nearest_driver_distance_m::numeric / 417.0)::int + 1
      else ceil(a.nearest_driver_distance_m::numeric / 367.0)::int + 1
    end as eta_min
  from cats c
  left join agg a on a.category = c.category;
$$;

-- 2. pending_rides_for_driver : VIP voit Confort + Essentiel -----------
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
language plpgsql stable security invoker as $fn_pending$
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

-- 3. Alternatives : VIP → Confort/Essentiel ; Confort → + VIP ----------
create or replace function public.preview_alternative_offers(p_ride_id uuid)
returns table (
  category vehicle_category,
  new_price_fcfa int,
  delta_fcfa int,
  drivers_online_nearby int
)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rides;
  pickup_g geography;
  cat vehicle_category;
  candidate_cats vehicle_category[];
  quote record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;

  pickup_g := r.pickup_location;

  if r.requested_category = 'essentiel' then
    candidate_cats := array['moto','tricycle','confort']::vehicle_category[];
  elsif r.requested_category = 'confort' then
    candidate_cats := array['moto','tricycle','essentiel','premium']::vehicle_category[];
  elsif r.requested_category = 'premium' then
    candidate_cats := array['confort','essentiel']::vehicle_category[];
  elsif r.requested_category = 'moto' then
    candidate_cats := array['tricycle','essentiel','confort']::vehicle_category[];
  elsif r.requested_category = 'tricycle' then
    candidate_cats := array['moto','essentiel','confort']::vehicle_category[];
  else
    candidate_cats := array[]::vehicle_category[];
  end if;

  foreach cat in array candidate_cats loop
    select * into quote from public.compute_price(
      st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
      st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
      r.distance_km, r.duration_min, cat, false, false
    ) limit 1;

    return query
    select
      cat,
      quote.price_total_fcfa,
      quote.price_total_fcfa - r.price_total_fcfa,
      (
        select count(*)::int from public.drivers d
        join public.vehicles v on v.id = d.current_vehicle_id
        where d.is_online = true
          and d.status = 'active'
          and v.category = cat
          and st_dwithin(d.current_location, pickup_g, 10000)
      );
  end loop;
end;
$$;
