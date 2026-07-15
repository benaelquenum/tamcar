-- ============================================================
-- TamCar — RPC create_ride (2026-07-15)
--
-- Helper "one-shot" qui :
--   1. Calcule le prix + revenue-share via compute_price
--   2. INSERT dans rides avec client_id = auth.uid()
--   3. Retourne la ride créée
--
-- Le client appelle supabase.rpc('create_ride', {...}) depuis un
-- server action, puis redirect vers /ride/{id}.
-- ============================================================

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
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  -- Compute prix + split revenue-share
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
    status, payment_method, scheduled_at, requested_at
  ) values (
    auth.uid(),
    st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    p_pickup_address,
    st_setsrid(st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_dropoff_address,
    p_distance_km, p_duration_min,
    price_row.price_total_fcfa,
    price_row.driver_cash_fcfa,
    price_row.driver_rachat_fcfa,
    price_row.dealer_share_fcfa,
    price_row.platform_share_fcfa,
    case when p_scheduled_at is not null then 'requested'::ride_status
         else 'requested'::ride_status end,
    p_payment_method,
    p_scheduled_at,
    now()
  ) returning * into new_ride;

  return new_ride;
end;
$$;

comment on function public.create_ride is
  'One-shot : calcule prix via compute_price puis INSERT ride. Retourne la ride créée.';

-- ------------------------------------------------------------
-- Vue confortable : rides côté client avec extraction lat/lng
-- (les pickup_location / dropoff_location sont en geography(point),
-- pas directement lisibles depuis le client — cette vue les expose
-- en (lng, lat) séparés)
-- ------------------------------------------------------------

create or replace view public.rides_view
with (security_invoker = true)
as
select
  r.id,
  r.client_id,
  r.driver_id,
  r.vehicle_id,
  r.dealer_partner_id,
  r.pickup_address,
  st_x(r.pickup_location::geometry) as pickup_lng,
  st_y(r.pickup_location::geometry) as pickup_lat,
  r.dropoff_address,
  st_x(r.dropoff_location::geometry) as dropoff_lng,
  st_y(r.dropoff_location::geometry) as dropoff_lat,
  r.distance_km,
  r.duration_min,
  r.price_total_fcfa,
  r.driver_share_fcfa,
  r.driver_rachat_fcfa,
  r.dealer_share_fcfa,
  r.platform_share_fcfa,
  r.status,
  r.payment_method,
  r.scheduled_at,
  r.requested_at,
  r.matched_at,
  r.started_at,
  r.ended_at,
  r.cancelled_at,
  r.cancel_reason,
  r.created_at,
  r.updated_at
from public.rides r;

comment on view public.rides_view is
  'Vue rides avec pickup/dropoff lat/lng séparés (pratique côté client). security_invoker respecte RLS de la table rides.';

grant select on public.rides_view to authenticated, anon;
