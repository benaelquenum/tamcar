-- ============================================================
-- Purge agressive de tous les overloads de compute_price
-- (via pg_catalog pour les débusquer tous), puis on remet la v5
-- avec le bon nom de table (public.pricing_tiers).
--
-- Fixe aussi add_ride_stop qui référençait category_pricing_tiers.
-- ============================================================

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

-- Recréé — version unique v5.1
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
    effective_km_price := case
      when distance_km > 5 then tier.km_corridor_fcfa
      else tier.km_city_fcfa
    end;

    extra_km  := greatest(0, distance_km - tier.base_covers_km);
    extra_min := greatest(0, duration_min - tier.base_covers_min);
    standard_price := tier.base_fcfa + greatest(
      ceil(extra_km * effective_km_price)::int,
      extra_min * tier.min_fcfa
    );
    total := greatest(standard_price, tier.min_course_fcfa);
  end if;

  if with_ac and p_category = 'essentiel' then
    ac_fee := greatest(200, ceil(distance_km * 40)::int);
    total  := total + ac_fee;
  end if;

  v_driver_cash   := floor(total * 0.40)::int;
  v_driver_rachat := floor(total * 0.10)::int;
  v_dealer        := floor(total * 0.30)::int;
  v_platform      := total - v_driver_cash - v_driver_rachat - v_dealer;

  return query select
    total,
    v_driver_cash,
    v_driver_rachat,
    v_dealer,
    v_platform,
    is_c,
    corridor_json;
end;
$$;

-- ------------------------------------------------------------
-- Fix add_ride_stop (Vague B) — même nom de table
-- ------------------------------------------------------------
create or replace function public.add_ride_stop(
  p_ride_id uuid,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_new_total_km numeric,
  p_new_total_min int
)
returns public.ride_stops
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  v_category vehicle_category;
  km_price int;
  active_stops int;
  next_order int;
  extra_km numeric;
  extra_price int;
  result public.ride_stops;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer int;
  new_platform int;
  driver_app_type driver_application_type;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Cette course n''accepte plus de nouvel arrêt.';
  end if;

  select count(*)::int into active_stops
   from public.ride_stops
   where ride_id = p_ride_id
     and status <> 'cancelled';
  if active_stops >= 2 then raise exception 'Maximum 2 arrêts autorisés.'; end if;

  next_order := active_stops + 1;
  extra_km := greatest(0, p_new_total_km - r.distance_km);

  select v.category into v_category
    from public.vehicles v where v.id = r.vehicle_id;
  select km_city_fcfa into km_price
    from public.pricing_tiers
    where category = coalesce(v_category, 'essentiel'::vehicle_category);

  extra_price := ceil(extra_km * coalesce(km_price, 90))::int;

  insert into public.ride_stops (
    ride_id, order_idx, address, lat, lng, extra_km_added, extra_price_fcfa
  ) values (
    p_ride_id, next_order, p_address, p_lat, p_lng, extra_km, extra_price
  ) returning * into result;

  if r.driver_id is not null then
    select application_type into driver_app_type
     from public.drivers where id = r.driver_id;
  end if;

  declare new_total int := r.price_total_fcfa + extra_price;
  begin
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
  end;

  return result;
end;
$$;
