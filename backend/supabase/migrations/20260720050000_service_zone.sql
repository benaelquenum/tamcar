-- ============================================================
-- Zone de service TamCar : Cotonou + Porto-Novo (corridor inclus).
-- 2 cercles de 15 km qui se chevauchent → couvre les 2 villes
-- + toute la route Cotonou-Porto-Novo entre.
--
-- Empêche la création de courses dont pickup OU dropoff est hors
-- zone (évite les courses fantômes sans chauffeur possible).
-- ============================================================

create or replace function public._is_within_service_zone(
  p_lat double precision,
  p_lng double precision
)
returns boolean
language sql stable security invoker as $$
  select st_dwithin(
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    st_setsrid(st_makepoint(2.435, 6.365), 4326)::geography,  -- Cotonou centre
    15000
  ) or st_dwithin(
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    st_setsrid(st_makepoint(2.605, 6.497), 4326)::geography,  -- Porto-Novo centre
    15000
  );
$$;

comment on function public._is_within_service_zone is
  'Zone de service : 15 km autour de Cotonou (2.435, 6.365) + 15 km autour de Porto-Novo (2.605, 6.497). Les 2 cercles se chevauchent → corridor couvert.';

grant execute on function public._is_within_service_zone to authenticated;

-- ------------------------------------------------------------
-- create_ride v3 : validation zone avant insertion
-- ------------------------------------------------------------
create or replace function public.create_ride(
  p_category vehicle_category,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_pickup_address text,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_dropoff_address text,
  p_distance_km numeric,
  p_duration_min int,
  p_is_night boolean default false,
  p_with_ac boolean default false,
  p_scheduled_at timestamptz default null,
  p_payment_method payment_method default 'cash'
)
returns public.rides
language plpgsql security invoker as $$
declare
  price_row record;
  new_ride public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  -- Contrôle zone de service (Cotonou + Porto-Novo)
  if not public._is_within_service_zone(p_pickup_lat, p_pickup_lng) then
    raise exception 'Point de départ hors zone de service. TamCar couvre actuellement Cotonou et Porto-Novo uniquement.';
  end if;
  if not public._is_within_service_zone(p_dropoff_lat, p_dropoff_lng) then
    raise exception 'Destination hors zone de service. TamCar couvre actuellement Cotonou et Porto-Novo uniquement.';
  end if;

  select * into price_row from public.compute_price(
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
    p_distance_km, p_duration_min, p_category, p_is_night, p_with_ac
  ) limit 1;
  if price_row is null or price_row.price_total_fcfa is null then
    raise exception 'compute_price returned null';
  end if;

  insert into public.rides (
    client_id,
    pickup_location, pickup_address,
    dropoff_location, dropoff_address,
    distance_km, duration_min,
    price_total_fcfa,
    driver_share_fcfa, driver_rachat_fcfa, dealer_share_fcfa, platform_share_fcfa,
    status, payment_method, scheduled_at, requested_at,
    requested_category, with_ac
  ) values (
    auth.uid(),
    st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    p_pickup_address,
    st_setsrid(st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_dropoff_address,
    p_distance_km, p_duration_min,
    price_row.price_total_fcfa,
    price_row.driver_cash_fcfa, price_row.driver_rachat_fcfa,
    price_row.dealer_share_fcfa, price_row.platform_share_fcfa,
    'requested', p_payment_method, p_scheduled_at, now(),
    p_category, p_with_ac
  ) returning * into new_ride;

  return new_ride;
end;
$$;
