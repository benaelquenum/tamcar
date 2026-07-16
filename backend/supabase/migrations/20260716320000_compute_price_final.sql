-- ============================================================
-- Fix définitif compute_price — repart de la version 20260715131000
-- (celle qui fonctionnait) avec 2 seules modifications :
--   1. Split cession v3 : 40/10/30/20 au lieu de 52/5/28/15
--   2. Clim variable : max(200, 40 × distance_km) au lieu de tier.ac_extra_fcfa flat
--
-- Table pricing_tiers · checkpoints · corridor_prices — noms réels de la base
-- ============================================================

-- Purge agressive de tous les overloads via pg_catalog
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
language plpgsql stable as $$
declare
  tier public.pricing_tiers%rowtype;
  c1 record;
  c2 record;
  corridor_row record;
  pickup_point geography;
  dropoff_point geography;
  pre_km numeric := 0;
  post_km numeric := 0;
  pre_price int := 0;
  post_price int := 0;
  fixed_price int := 0;
  extra_km numeric;
  extra_min int;
  effective_km_price int;
  standard_price int;
  ac_fee int := 0;
  total int;
  v_driver_cash int;
  v_driver_rachat int;
  v_dealer int;
  v_platform int;
  is_c boolean := false;
  corridor_json jsonb := null;
  intercity_threshold_km constant numeric := 10.0;
begin
  select * into tier from public.pricing_tiers where category = p_category;
  if not found then
    raise exception 'Unknown vehicle_category: %', p_category;
  end if;

  pickup_point  := st_setsrid(st_makepoint(pickup_lng, pickup_lat), 4326)::geography;
  dropoff_point := st_setsrid(st_makepoint(dropoff_lng, dropoff_lat), 4326)::geography;

  -- Recherche checkpoints proches
  select id, code, name, location, radius_km into c1
  from public.checkpoints
  where st_dwithin(location, pickup_point, radius_km * 1000)
  order by st_distance(location, pickup_point)
  limit 1;

  select id, code, name, location, radius_km into c2
  from public.checkpoints
  where st_dwithin(location, dropoff_point, radius_km * 1000)
  order by st_distance(location, dropoff_point)
  limit 1;

  -- Corridor tarifé (priorité)
  if c1.id is not null and c2.id is not null and c1.id <> c2.id then
    select from_checkpoint_id, to_checkpoint_id, price_day_fcfa, price_night_fcfa
      into corridor_row
    from public.corridor_prices
    where from_checkpoint_id = c1.id
      and to_checkpoint_id   = c2.id
      and category           = p_category;

    if corridor_row.from_checkpoint_id is not null then
      is_c := true;
      fixed_price := case when is_night
                          then corridor_row.price_night_fcfa
                          else corridor_row.price_day_fcfa end;

      pre_km := round((st_distance(pickup_point, c1.location) / 1000.0)::numeric, 2);
      if pre_km > 0.1 then
        pre_price := ceil(pre_km * tier.km_city_fcfa)::int;
      end if;

      post_km := round((st_distance(dropoff_point, c2.location) / 1000.0)::numeric, 2);
      if post_km > 0.1 then
        post_price := ceil(post_km * tier.km_city_fcfa)::int;
      end if;

      total := pre_price + fixed_price + post_price;

      corridor_json := jsonb_build_object(
        'from_checkpoint',   c1.name,
        'to_checkpoint',     c2.name,
        'pre_km',            pre_km,
        'pre_price_fcfa',    pre_price,
        'fixed_price_fcfa',  fixed_price,
        'post_km',           post_km,
        'post_price_fcfa',   post_price,
        'is_night',          is_night
      );
    end if;
  end if;

  -- Fallback tarif standard
  if not is_c then
    if distance_km > intercity_threshold_km then
      effective_km_price := tier.km_corridor_fcfa;
    else
      effective_km_price := tier.km_city_fcfa;
    end if;

    extra_km  := greatest(0, distance_km - tier.base_covers_km);
    extra_min := greatest(0, duration_min - tier.base_covers_min);
    standard_price := tier.base_fcfa + greatest(
      ceil(extra_km * effective_km_price)::int,
      extra_min * tier.min_fcfa
    );
    total := greatest(standard_price, tier.min_course_fcfa);
  end if;

  -- Climatisation Essentiel : 40 F/km avec plancher 200 F (v4)
  if with_ac and p_category = 'essentiel' then
    ac_fee := greatest(200, ceil(distance_km * 40)::int);
    total  := total + ac_fee;
  end if;

  -- Split cession v3 : 40/10/30/20 (indicatif — le vrai split est appliqué à accept_ride)
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
