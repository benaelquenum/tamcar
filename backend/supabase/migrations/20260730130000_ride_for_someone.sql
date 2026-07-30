-- ============================================================
-- TamCar — Commander pour un proche (2026-07-30)
--
--   Le client peut commander une course pour quelqu'un d'autre (maman,
--   petit frère…) : il saisit le nom + téléphone du passager.
--   - rides.passenger_name / passenger_phone (NULL = le client voyage).
--   - create_ride v6 : 2 params optionnels.
--   - Côté chauffeur : le nom affiché et le bouton Appeler ciblent le
--     PASSAGER (le payeur reste le client du compte : wallet, notifs,
--     annulation, chat inchangés).
-- ============================================================

-- 1. Colonnes passager -------------------------------------------------
alter table public.rides add column if not exists passenger_name text;
alter table public.rides add column if not exists passenger_phone text;

-- 2. rides_view : expose les 2 colonnes (ajout EN FIN de vue) ----------
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
  r.arrived_at,
  r.arrival_distance_m,
  r.arrival_flagged,
  r.completion_requested_at,
  r.completion_requested_lat,
  r.completion_requested_lng,
  r.completion_distance_from_dropoff_m,
  r.completion_recomputed_price_fcfa,
  r.completion_auto_accept_at,
  r.stops_count,
  r.stops_extra_price_fcfa,
  r.stops_waiting_fee_fcfa,
  r.created_at,
  r.updated_at,
  r.passenger_name,
  r.passenger_phone
from public.rides r;

grant select on public.rides_view to authenticated, anon;

-- 3. create_ride v6 : + passager --------------------------------------
-- Drop de TOUTES les surcharges historiques (v1..v5 ont des signatures
-- différentes jamais droppées → "function name is not unique").
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fq
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_ride'
  loop
    execute format('drop function if exists %s cascade', r.fq);
  end loop;
end $$;

create function public.create_ride(
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
  p_payment_method payment_method default 'cash',
  p_promo_code text default null,
  p_passenger_name text default null,
  p_passenger_phone text default null
)
returns public.rides
language plpgsql security invoker as $fnr$
declare
  quote record;
  new_ride public.rides;
  v_status ride_status;
  v_promo record;
  v_final_price int;
  v_promo_code_norm text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
  v_discount int := 0;
  v_passenger_name text := nullif(trim(coalesce(p_passenger_name, '')), '');
  v_passenger_phone text := nullif(regexp_replace(coalesce(p_passenger_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  -- Course pour un proche : nom ET téléphone requis ensemble
  if v_passenger_name is not null and v_passenger_phone is null then
    raise exception 'Le téléphone du passager est requis.';
  end if;
  if v_passenger_phone is not null and v_passenger_name is null then
    raise exception 'Le nom du passager est requis.';
  end if;

  if not public._is_within_service_zone(p_pickup_lat, p_pickup_lng) then
    raise exception 'Point de départ hors zone de service.';
  end if;
  if not public._is_within_service_zone(p_dropoff_lat, p_dropoff_lng) then
    raise exception 'Destination hors zone de service.';
  end if;

  if p_scheduled_at is not null then
    if p_scheduled_at < now() + interval '15 minutes' then
      raise exception 'Réservation min 15 min à l''avance';
    end if;
    if p_scheduled_at > now() + interval '30 days' then
      raise exception 'Réservation max 30 jours à l''avance';
    end if;
    v_status := 'scheduled';
  else
    v_status := 'requested';
  end if;

  select * into quote from public.compute_price(
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
    p_distance_km, p_duration_min, p_category, p_is_night, p_with_ac
  ) limit 1;
  if quote is null or quote.price_total_fcfa is null then
    raise exception 'compute_price returned null';
  end if;

  v_final_price := quote.price_total_fcfa;

  if v_promo_code_norm is not null then
    select * into v_promo from public.preview_promo_code(v_promo_code_norm, quote.price_total_fcfa);
    if not v_promo.valid then
      raise exception 'Code promo invalide : %', v_promo.reason;
    end if;
    v_final_price := v_promo.final_price_fcfa;
    v_discount := v_promo.discount_fcfa;
  end if;

  insert into public.rides (
    client_id,
    pickup_location, pickup_address,
    dropoff_location, dropoff_address,
    distance_km, duration_min,
    price_total_fcfa,
    driver_share_fcfa, driver_rachat_fcfa, dealer_share_fcfa, platform_share_fcfa,
    status, payment_method, scheduled_at, requested_at,
    requested_category, with_ac,
    promo_code, promo_discount_fcfa,
    passenger_name, passenger_phone
  ) values (
    auth.uid(),
    st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    p_pickup_address,
    st_setsrid(st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_dropoff_address,
    p_distance_km, p_duration_min,
    v_final_price,
    quote.driver_cash_fcfa, quote.driver_rachat_fcfa,
    quote.dealer_share_fcfa, quote.platform_share_fcfa,
    v_status, p_payment_method, p_scheduled_at, now(),
    p_category, p_with_ac,
    v_promo_code_norm, v_discount,
    v_passenger_name, v_passenger_phone
  ) returning * into new_ride;

  if v_promo_code_norm is not null and v_discount > 0 then
    insert into public.promo_code_redemptions (code, profile_id, ride_id, discount_applied_fcfa)
      values (v_promo_code_norm, auth.uid(), new_ride.id, v_discount);
  end if;

  return new_ride;
end;
$fnr$;

grant execute on function public.create_ride(
  vehicle_category, double precision, double precision, text,
  double precision, double precision, text, numeric, int,
  boolean, boolean, timestamptz, payment_method, text, text, text
) to authenticated;

-- 4. ride_with_driver_details : + passager (drop : return type change) -
drop function if exists public.ride_with_driver_details(uuid);

create function public.ride_with_driver_details(ride_id uuid)
returns table (
  id uuid,
  client_id uuid,
  driver_id uuid,
  status ride_status,
  pickup_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_address text,
  dropoff_lat double precision,
  dropoff_lng double precision,
  distance_km numeric,
  duration_min int,
  price_total_fcfa int,
  driver_share_fcfa int,
  payment_method payment_method,
  requested_at timestamptz,
  requested_category vehicle_category,
  downgrade_accepted_at timestamptz,
  matched_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  driver_full_name text,
  driver_avatar_url text,
  driver_phone text,
  driver_rating_avg numeric,
  driver_rating_count int,
  driver_lat double precision,
  driver_lng double precision,
  vehicle_plate text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_color text,
  vehicle_category vehicle_category,
  passenger_name text,
  passenger_phone text
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.client_id, r.driver_id, r.status,
    r.pickup_address,
    st_y(r.pickup_location::geometry) as pickup_lat,
    st_x(r.pickup_location::geometry) as pickup_lng,
    r.dropoff_address,
    st_y(r.dropoff_location::geometry) as dropoff_lat,
    st_x(r.dropoff_location::geometry) as dropoff_lng,
    r.distance_km, r.duration_min, r.price_total_fcfa, r.driver_share_fcfa,
    r.payment_method, r.requested_at,
    r.requested_category, r.downgrade_accepted_at,
    r.matched_at, r.started_at, r.ended_at,
    p.full_name as driver_full_name,
    p.avatar_url as driver_avatar_url,
    p.phone as driver_phone,
    d.rating_avg as driver_rating_avg,
    d.rating_count as driver_rating_count,
    case when d.current_location is not null then st_y(d.current_location::geometry) end as driver_lat,
    case when d.current_location is not null then st_x(d.current_location::geometry) end as driver_lng,
    v.plate_number as vehicle_plate,
    v.brand as vehicle_brand,
    v.model as vehicle_model,
    v.color as vehicle_color,
    v.category as vehicle_category,
    r.passenger_name,
    r.passenger_phone
  from public.rides r
  left join public.drivers d on d.id = r.driver_id
  left join public.profiles p on p.id = d.profile_id
  left join public.vehicles v on v.id = r.vehicle_id
  where r.id = ride_id
    and (
      r.client_id = auth.uid()
      or exists (
        select 1 from public.drivers md
         where md.id = r.driver_id and md.profile_id = auth.uid()
      )
      or public.is_admin()
    );
$$;

grant execute on function public.ride_with_driver_details(uuid) to authenticated;
