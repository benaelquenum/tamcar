-- ============================================================
-- Fix : plusieurs overloads de compute_price coexistaient en base,
-- avec des noms de colonnes retour différents (driver_cash_fcfa vs driver_share_fcfa)
-- et des ordres de paramètres inversés. Le pricing.ts côté client attendait
-- l'ancien nom → prix indéfini côté /commande.
--
-- On drop TOUS les overloads connus et on recrée une signature unique,
-- alignée sur pricing.ts (retour driver_cash_fcfa + corridor_detail).
-- ============================================================

-- Drop de tous les overloads connus (signatures multiples historiques)
drop function if exists public.compute_price(
  double precision, double precision, double precision, double precision,
  numeric, int, vehicle_category, boolean, boolean
);
drop function if exists public.compute_price(
  double precision, double precision, double precision, double precision,
  numeric, int, vehicle_category, boolean
);
drop function if exists public.compute_price(
  double precision, double precision, double precision, double precision,
  numeric, int, vehicle_category
);
drop function if exists public.compute_price(
  vehicle_category, double precision, double precision, double precision, double precision,
  numeric, int, boolean, boolean
);
drop function if exists public.compute_price(
  vehicle_category, double precision, double precision, double precision, double precision,
  numeric, int, boolean
);
drop function if exists public.compute_price(
  vehicle_category, double precision, double precision, double precision, double precision,
  numeric, int
);

-- Version unique v5 : signature "ancienne" (compatible pricing.ts),
-- retour aligné sur les noms attendus côté client, split v3 40/10/30/20,
-- clim variable 40 F/km avec plancher 200 F sur Essentiel.
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
  tier record;
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
  select * into tier from public.category_pricing_tiers where category = p_category;
  if tier is null then raise exception 'Tarif inconnu pour catégorie %', p_category; end if;

  -- Corridor check via checkpoints
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

  -- Climatisation Essentiel : 40 F/km avec plancher 200 F
  if with_ac and p_category = 'essentiel' then
    ac_fee := greatest(200, ceil(distance_km * 40)::int);
    total  := total + ac_fee;
  end if;

  -- Split cession v3 40/10/30/20 (indicatif — le vrai split est appliqué à accept_ride)
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

comment on function public.compute_price(
  double precision, double precision, double precision, double precision,
  numeric, int, vehicle_category, boolean, boolean
) is 'v5 : signature unique, retour driver_cash_fcfa (compat client), split 40/10/30/20, clim 40 F/km min 200 F.';
