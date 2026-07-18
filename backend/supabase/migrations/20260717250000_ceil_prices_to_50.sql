-- ============================================================
-- Arrondir tous les prix au 50 F par EXCÈS (ceiling).
--   1060 → 1100, 1050 → 1050, 1049 → 1050, 1001 → 1050, 1000 → 1000.
-- Propagation dans compute_price, add_ride_stop, remove_ride_stop,
-- swap_stop_and_dropoff, driver_depart_from_stop, client_request_completion.
-- ============================================================

create or replace function public.ceil_to_50(v int)
returns int language sql immutable as $$
  select case when v <= 0 then 0 else ((v + 49) / 50) * 50 end;
$$;

comment on function public.ceil_to_50 is
  'Arrondit au multiple de 50 supérieur (par excès). 1060→1100, 1050→1050.';

-- ------------------------------------------------------------
-- compute_price : arrondi juste avant le split
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fq
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'compute_price'
  loop
    execute format('drop function if exists %s cascade', r.fq);
  end loop;
end $$;

create or replace function public.compute_price(
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  distance_km numeric,
  duration_min int,
  p_category vehicle_category default 'essentiel',
  is_night boolean default false,
  with_ac boolean default false
)
returns table (
  price_total_fcfa int,
  driver_cash_fcfa int,
  driver_rachat_fcfa int,
  dealer_share_fcfa int,
  platform_share_fcfa int,
  is_corridor boolean,
  corridor_detail jsonb
)
language plpgsql stable security invoker as $$
declare
  tier public.pricing_tiers%rowtype;
  is_c boolean := false;
  corridor_json jsonb := null;
  total int;
  standard_price int;
  effective_km_price int;
  extra_km numeric;
  extra_min int;
  ac_fee int := 0;
  v_driver_cash int;
  v_driver_rachat int;
  v_dealer int;
  v_platform int;
  corridor_row record;
  pickup_cp record;
  dropoff_cp record;
begin
  select * into tier from public.pricing_tiers where category = p_category;
  if tier is null then raise exception 'Tarif inconnu pour catégorie %', p_category; end if;

  select cp.* into pickup_cp
   from public.corridor_checkpoints cp
   where st_dwithin(cp.center, st_point(pickup_lng, pickup_lat)::geography, cp.radius_m)
   order by st_distance(cp.center, st_point(pickup_lng, pickup_lat)::geography) asc
   limit 1;

  select cp.* into dropoff_cp
   from public.corridor_checkpoints cp
   where st_dwithin(cp.center, st_point(dropoff_lng, dropoff_lat)::geography, cp.radius_m)
   order by st_distance(cp.center, st_point(dropoff_lng, dropoff_lat)::geography) asc
   limit 1;

  if pickup_cp.id is not null and dropoff_cp.id is not null and pickup_cp.id <> dropoff_cp.id then
    select cf.* into corridor_row
     from public.corridor_fixed_prices cf
     where cf.category = p_category
       and ((cf.checkpoint_a_id = pickup_cp.id and cf.checkpoint_b_id = dropoff_cp.id)
         or (cf.checkpoint_b_id = pickup_cp.id and cf.checkpoint_a_id = dropoff_cp.id));
    if corridor_row.id is not null then
      is_c := true;
      total := case when is_night then corridor_row.price_night_fcfa else corridor_row.price_day_fcfa end;
      corridor_json := jsonb_build_object(
        'checkpoint_a', pickup_cp.name,
        'checkpoint_b', dropoff_cp.name,
        'day_price', corridor_row.price_day_fcfa,
        'night_price', corridor_row.price_night_fcfa
      );
    end if;
  end if;

  if not is_c then
    effective_km_price := case when distance_km > 5 then tier.km_corridor_fcfa else tier.km_city_fcfa end;
    extra_km := greatest(0, distance_km - tier.base_covers_km);
    extra_min := greatest(0, duration_min - tier.base_covers_min);
    standard_price := tier.base_fcfa + greatest(
      ceil(extra_km * effective_km_price)::int,
      extra_min * tier.min_fcfa
    );
    total := greatest(standard_price, tier.min_course_fcfa);
  end if;

  if with_ac and p_category = 'essentiel' then
    ac_fee := greatest(200, ceil(distance_km * 40)::int);
    total := total + ac_fee;
  end if;

  -- Arrondi au 50 F par excès (règle produit : montant client toujours multiple de 50)
  total := public.ceil_to_50(total);

  v_driver_cash   := floor(total * 0.40)::int;
  v_driver_rachat := floor(total * 0.10)::int;
  v_dealer        := floor(total * 0.30)::int;
  v_platform      := total - v_driver_cash - v_driver_rachat - v_dealer;

  return query select
    total, v_driver_cash, v_driver_rachat, v_dealer, v_platform, is_c, corridor_json;
end;
$$;

-- ------------------------------------------------------------
-- add_ride_stop : arrondi du nouveau total
-- ------------------------------------------------------------
create or replace function public.add_ride_stop(
  p_ride_id uuid,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_new_total_km numeric,
  p_new_total_min int,
  p_mode text default 'stopover'
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  v_category vehicle_category;
  km_price int;
  active_stops int;
  next_order int;
  extra_km numeric;
  extra_price int;
  result_stop public.ride_stops;
  new_total int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer int;
  new_platform int;
  driver_app_type driver_application_type;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_mode not in ('stopover', 'new_destination') then
    raise exception 'Invalid mode: %', p_mode;
  end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Cette course n''accepte plus de nouvel arrêt.';
  end if;

  select v.category into v_category from public.vehicles v where v.id = r.vehicle_id;
  select km_city_fcfa into km_price
    from public.pricing_tiers
    where category = coalesce(v_category, 'essentiel'::vehicle_category);
  km_price := coalesce(km_price, 90);

  extra_km := greatest(0, p_new_total_km - r.distance_km);
  extra_price := ceil(extra_km * km_price)::int;
  new_total := public.ceil_to_50(r.price_total_fcfa + extra_price);

  if r.driver_id is not null then
    select application_type into driver_app_type from public.drivers where id = r.driver_id;
  end if;
  if driver_app_type = 'proprietaire' then
    new_driver_cash := floor(new_total * 0.80)::int;
    new_driver_rachat := 0;
    new_dealer := 0;
    new_platform := new_total - new_driver_cash;
  else
    new_driver_cash := floor(new_total * 0.40)::int;
    new_driver_rachat := floor(new_total * 0.10)::int;
    new_dealer := floor(new_total * 0.30)::int;
    new_platform := new_total - new_driver_cash - new_driver_rachat - new_dealer;
  end if;

  if p_mode = 'new_destination' then
    update public.rides
    set dropoff_address = p_address,
        dropoff_location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        distance_km = p_new_total_km,
        duration_min = p_new_total_min,
        price_total_fcfa = new_total,
        driver_share_fcfa = new_driver_cash,
        driver_rachat_fcfa = new_driver_rachat,
        dealer_share_fcfa = new_dealer,
        platform_share_fcfa = new_platform,
        stops_extra_price_fcfa = stops_extra_price_fcfa + extra_price,
        updated_at = now()
    where id = p_ride_id;

    return jsonb_build_object(
      'mode', 'new_destination',
      'new_dropoff_address', p_address,
      'new_dropoff_lat', p_lat, 'new_dropoff_lng', p_lng,
      'extra_price_fcfa', extra_price, 'new_total_fcfa', new_total
    );
  end if;

  select count(*)::int into active_stops
   from public.ride_stops
   where ride_id = p_ride_id and status <> 'cancelled';
  if active_stops >= 2 then raise exception 'Maximum 2 arrêts autorisés.'; end if;
  next_order := active_stops + 1;

  insert into public.ride_stops (
    ride_id, order_idx, address, lat, lng, status, accepted_at,
    extra_km_added, extra_price_fcfa
  ) values (
    p_ride_id, next_order, p_address, p_lat, p_lng, 'accepted', now(),
    extra_km, extra_price
  ) returning * into result_stop;

  update public.rides
  set stops_count = stops_count + 1,
      stops_extra_price_fcfa = stops_extra_price_fcfa + extra_price,
      price_total_fcfa = new_total,
      driver_share_fcfa = new_driver_cash,
      driver_rachat_fcfa = new_driver_rachat,
      dealer_share_fcfa = new_dealer,
      platform_share_fcfa = new_platform,
      distance_km = p_new_total_km,
      duration_min = p_new_total_min,
      updated_at = now()
  where id = p_ride_id;

  return jsonb_build_object(
    'mode', 'stopover', 'stop_id', result_stop.id,
    'order_idx', result_stop.order_idx, 'address', result_stop.address,
    'lat', result_stop.lat, 'lng', result_stop.lng,
    'extra_price_fcfa', extra_price, 'new_total_fcfa', new_total
  );
end;
$$;

-- ------------------------------------------------------------
-- remove_ride_stop : arrondi du nouveau total
-- ------------------------------------------------------------
create or replace function public.remove_ride_stop(
  p_stop_id uuid, p_new_total_km numeric, p_new_total_min int
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.ride_stops;
  r public.rides;
  removed_price int;
  new_total int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer int;
  new_platform int;
  driver_app_type driver_application_type;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into s from public.ride_stops where id = p_stop_id;
  if s is null then raise exception 'Stop not found'; end if;
  select * into r from public.rides where id = s.ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if s.status not in ('pending', 'accepted') then
    raise exception 'Cet arrêt a déjà été atteint ou est annulé.';
  end if;

  removed_price := s.extra_price_fcfa;
  new_total := public.ceil_to_50(greatest(0, r.price_total_fcfa - removed_price));

  if r.driver_id is not null then
    select application_type into driver_app_type from public.drivers where id = r.driver_id;
  end if;
  if driver_app_type = 'proprietaire' then
    new_driver_cash := floor(new_total * 0.80)::int;
    new_driver_rachat := 0;
    new_dealer := 0;
    new_platform := new_total - new_driver_cash;
  else
    new_driver_cash := floor(new_total * 0.40)::int;
    new_driver_rachat := floor(new_total * 0.10)::int;
    new_dealer := floor(new_total * 0.30)::int;
    new_platform := new_total - new_driver_cash - new_driver_rachat - new_dealer;
  end if;

  update public.ride_stops set status = 'cancelled' where id = p_stop_id;

  update public.rides
  set stops_count = greatest(0, stops_count - 1),
      stops_extra_price_fcfa = greatest(0, stops_extra_price_fcfa - removed_price),
      price_total_fcfa = new_total,
      driver_share_fcfa = new_driver_cash,
      driver_rachat_fcfa = new_driver_rachat,
      dealer_share_fcfa = new_dealer,
      platform_share_fcfa = new_platform,
      distance_km = p_new_total_km,
      duration_min = p_new_total_min,
      updated_at = now()
  where id = r.id;

  return jsonb_build_object(
    'removed_stop_id', p_stop_id,
    'removed_price_fcfa', removed_price,
    'new_total_fcfa', new_total
  );
end;
$$;

-- ------------------------------------------------------------
-- swap_stop_and_dropoff : arrondi du nouveau total
-- ------------------------------------------------------------
create or replace function public.swap_stop_and_dropoff(
  p_stop_id uuid, p_new_total_km numeric, p_new_total_min int
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.ride_stops;
  r public.rides;
  old_dropoff_address text;
  old_dropoff_lat double precision;
  old_dropoff_lng double precision;
  new_stop_order int;
  extra_km numeric;
  extra_price int;
  km_price int;
  v_category vehicle_category;
  new_total int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer int;
  new_platform int;
  driver_app_type driver_application_type;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into s from public.ride_stops where id = p_stop_id;
  if s is null then raise exception 'Stop not found'; end if;
  select * into r from public.rides where id = s.ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if s.status not in ('pending','accepted') then
    raise exception 'Cet arrêt ne peut plus être promu en destination.';
  end if;
  if r.status not in ('matched','arrived','in_progress') then
    raise exception 'Cette course ne permet plus de modifier l''itinéraire.';
  end if;

  old_dropoff_address := r.dropoff_address;
  old_dropoff_lat := st_y(r.dropoff_location::geometry);
  old_dropoff_lng := st_x(r.dropoff_location::geometry);

  select v.category into v_category from public.vehicles v where v.id = r.vehicle_id;
  select km_city_fcfa into km_price
    from public.pricing_tiers
    where category = coalesce(v_category, 'essentiel'::vehicle_category);
  km_price := coalesce(km_price, 90);

  extra_km := greatest(0, p_new_total_km - r.distance_km);
  extra_price := ceil(extra_km * km_price)::int;
  new_total := public.ceil_to_50(r.price_total_fcfa + extra_price);

  if r.driver_id is not null then
    select application_type into driver_app_type from public.drivers where id = r.driver_id;
  end if;
  if driver_app_type = 'proprietaire' then
    new_driver_cash := floor(new_total * 0.80)::int;
    new_driver_rachat := 0;
    new_dealer := 0;
    new_platform := new_total - new_driver_cash;
  else
    new_driver_cash := floor(new_total * 0.40)::int;
    new_driver_rachat := floor(new_total * 0.10)::int;
    new_dealer := floor(new_total * 0.30)::int;
    new_platform := new_total - new_driver_cash - new_driver_rachat - new_dealer;
  end if;

  update public.ride_stops set order_idx = -order_idx where id = p_stop_id;
  select coalesce(max(order_idx), 0) + 1 into new_stop_order
    from public.ride_stops
    where ride_id = r.id and status <> 'cancelled' and id <> p_stop_id;

  update public.rides
    set dropoff_address = s.address,
        dropoff_location = st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography,
        distance_km = p_new_total_km,
        duration_min = p_new_total_min,
        price_total_fcfa = new_total,
        driver_share_fcfa = new_driver_cash,
        driver_rachat_fcfa = new_driver_rachat,
        dealer_share_fcfa = new_dealer,
        platform_share_fcfa = new_platform,
        stops_extra_price_fcfa = stops_extra_price_fcfa + extra_price,
        updated_at = now()
    where id = r.id;

  update public.ride_stops
    set address = old_dropoff_address, lat = old_dropoff_lat, lng = old_dropoff_lng,
        order_idx = new_stop_order, status = 'accepted',
        accepted_at = coalesce(accepted_at, now())
    where id = p_stop_id;

  return jsonb_build_object(
    'new_dropoff_address', s.address,
    'former_dropoff_address', old_dropoff_address,
    'stop_id_repurposed', p_stop_id,
    'new_total_fcfa', new_total,
    'extra_price_fcfa', extra_price
  );
end;
$$;

-- ------------------------------------------------------------
-- driver_depart_from_stop : arrondi quand des frais d'attente s'ajoutent
-- ------------------------------------------------------------
create or replace function public.driver_depart_from_stop(p_stop_id uuid)
returns public.ride_stops
language plpgsql security definer set search_path = public as $$
declare
  s public.ride_stops;
  waiting_s int;
  extra_min int;
  fee int := 0;
  new_total int;
  result public.ride_stops;
  driver_app_type driver_application_type;
  ride_row public.rides;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer int;
  new_platform int;
begin
  s := public._assert_stop_driver(p_stop_id);
  if s.status <> 'arrived' then raise exception 'Chauffeur pas encore arrivé'; end if;

  waiting_s := extract(epoch from (now() - s.arrived_at))::int;
  if waiting_s > 180 then
    extra_min := ceil((waiting_s - 180) / 60.0)::int;
    fee := extra_min * 40;
  end if;

  update public.ride_stops
  set status = 'departed', departed_at = now(),
      waiting_seconds = waiting_s, waiting_extra_fee_fcfa = fee
  where id = p_stop_id
  returning * into result;

  if fee > 0 then
    select * into ride_row from public.rides where id = s.ride_id;
    if ride_row.driver_id is not null then
      select application_type into driver_app_type from public.drivers where id = ride_row.driver_id;
    end if;
    new_total := public.ceil_to_50(ride_row.price_total_fcfa + fee);
    if driver_app_type = 'proprietaire' then
      new_driver_cash := floor(new_total * 0.80)::int;
      new_driver_rachat := 0;
      new_dealer := 0;
      new_platform := new_total - new_driver_cash;
    else
      new_driver_cash := floor(new_total * 0.40)::int;
      new_driver_rachat := floor(new_total * 0.10)::int;
      new_dealer := floor(new_total * 0.30)::int;
      new_platform := new_total - new_driver_cash - new_driver_rachat - new_dealer;
    end if;
    update public.rides
    set price_total_fcfa = new_total,
        stops_waiting_fee_fcfa = stops_waiting_fee_fcfa + fee,
        driver_share_fcfa = new_driver_cash,
        driver_rachat_fcfa = new_driver_rachat,
        dealer_share_fcfa = new_dealer,
        platform_share_fcfa = new_platform,
        updated_at = now()
    where id = s.ride_id;
  end if;

  return result;
end;
$$;

-- ------------------------------------------------------------
-- client_request_completion : arrondi du prix recomputé au prorata
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

  dist_to_dropoff_m := st_distance(
    st_makepoint(actual_lng, actual_lat)::geography,
    r.dropoff_location
  );

  if dist_to_dropoff_m <= 500 then
    update public.rides
    set status = 'completed', ended_at = now(), updated_at = now()
    where id = ride_id returning * into result;
    return result;
  end if;

  original_distance_km := r.distance_km;
  travelled_km := greatest(0, original_distance_km - (dist_to_dropoff_m / 1000.0));
  ratio := case when original_distance_km > 0 then travelled_km / original_distance_km else 0 end;
  price_floor := public.ceil_to_50(greatest(700, floor(r.price_total_fcfa * 0.30)::int));
  recomputed := public.ceil_to_50(greatest(price_floor, floor(r.price_total_fcfa * ratio)::int));

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
