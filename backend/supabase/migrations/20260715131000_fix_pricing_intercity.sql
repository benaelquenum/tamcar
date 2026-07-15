-- ============================================================
-- TamCar — Fix pricing intercity (2026-07-15, correctif)
--
-- Le MIN(standard, corridor) introduit dans 20260715130000 cassait le
-- modèle corridor car le tarif standard utilisait km_city (90 F/km) même
-- sur des longs trajets intercity. Sur 30 km : standard = 3 130 F vs
-- corridor = 4 500 F → MIN prenait toujours standard → corridor mort.
--
-- Fix en 2 temps :
--   1. ROLLBACK du MIN : le corridor reprend sa priorité s'il est détecté
--      (comportement du fichier 20260715120100_pricing_and_ops.sql)
--   2. AJOUT switch km_city → km_corridor si distance > 10 km : le tarif
--      standard devient économiquement cohérent sur les longs trajets
--      (rémunère correctement le chauffeur qui absorbe le retour à vide)
--
-- Résultats attendus après fix :
--   - Corridor exact 30 km Essentiel : 4 500 F (corridor priority)   ✓
--   - Urbain 5 km : 1 100 F (km_city, distance < 10 km)               ✓
--   - Long trajet 35 km hors checkpoint : ~5 820 F (km_corridor)     ✓
-- ============================================================

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

  -- Corridor tarifé disponible ? (priorité)
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

      -- Rabattement pré-checkpoint (toujours en tarif urbain, courtes distances)
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

  -- Fallback tarif standard si pas de corridor tarifé
  -- Switch km_city → km_corridor pour les trajets intercity (> 10 km)
  -- afin de rémunérer correctement le chauffeur (retour à vide, vitesse route).
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

  -- Climatisation optionnelle (Essentiel uniquement)
  if with_ac and p_category = 'essentiel' then
    ac_fee := tier.ac_extra_fcfa;
    total  := total + ac_fee;
  end if;

  -- Split revenue-share avec cession (52/5/28/15)
  v_driver_cash   := floor(total * 0.52)::int;
  v_driver_rachat := floor(total * 0.05)::int;
  v_dealer        := floor(total * 0.28)::int;
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
