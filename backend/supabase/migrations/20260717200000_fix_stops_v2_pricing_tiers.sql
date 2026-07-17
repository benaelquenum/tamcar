-- ============================================================
-- Fix : les RPCs add_ride_stop v2, remove_ride_stop, swap_stop_and_dropoff
-- référencent public.category_pricing_tiers qui n'existe pas.
-- La vraie table est public.pricing_tiers (voir 20260716300000_fix_compute_price_table_name.sql).
-- ============================================================

-- 1. add_ride_stop v2 corrigé
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

  select v.category into v_category
    from public.vehicles v where v.id = r.vehicle_id;
  select km_city_fcfa into km_price
    from public.pricing_tiers
    where category = coalesce(v_category, 'essentiel'::vehicle_category);
  km_price := coalesce(km_price, 90);

  extra_km := greatest(0, p_new_total_km - r.distance_km);
  extra_price := ceil(extra_km * km_price)::int;
  new_total := r.price_total_fcfa + extra_price;

  if r.driver_id is not null then
    select application_type into driver_app_type
     from public.drivers where id = r.driver_id;
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
      'new_dropoff_lat', p_lat,
      'new_dropoff_lng', p_lng,
      'extra_price_fcfa', extra_price,
      'new_total_fcfa', new_total
    );
  end if;

  select count(*)::int into active_stops
   from public.ride_stops
   where ride_id = p_ride_id
     and status <> 'cancelled';
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
    'mode', 'stopover',
    'stop_id', result_stop.id,
    'order_idx', result_stop.order_idx,
    'address', result_stop.address,
    'lat', result_stop.lat,
    'lng', result_stop.lng,
    'extra_price_fcfa', extra_price,
    'new_total_fcfa', new_total
  );
end;
$$;

-- 2. swap_stop_and_dropoff corrigé (même bug : category_pricing_tiers → pricing_tiers)
create or replace function public.swap_stop_and_dropoff(
  p_stop_id uuid,
  p_new_total_km numeric,
  p_new_total_min int
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

  select v.category into v_category
    from public.vehicles v where v.id = r.vehicle_id;
  select km_city_fcfa into km_price
    from public.pricing_tiers
    where category = coalesce(v_category, 'essentiel'::vehicle_category);
  km_price := coalesce(km_price, 90);

  extra_km := greatest(0, p_new_total_km - r.distance_km);
  extra_price := ceil(extra_km * km_price)::int;
  new_total := r.price_total_fcfa + extra_price;

  if r.driver_id is not null then
    select application_type into driver_app_type
     from public.drivers where id = r.driver_id;
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

  update public.ride_stops
    set order_idx = -order_idx
    where id = p_stop_id;

  select coalesce(max(order_idx), 0) + 1
    into new_stop_order
    from public.ride_stops
    where ride_id = r.id
      and status <> 'cancelled'
      and id <> p_stop_id;

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
    set address = old_dropoff_address,
        lat = old_dropoff_lat,
        lng = old_dropoff_lng,
        order_idx = new_stop_order,
        status = 'accepted',
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
