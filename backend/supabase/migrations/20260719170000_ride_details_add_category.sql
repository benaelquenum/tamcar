-- Add requested_category + downgrade_accepted_at to ride_with_driver_details
-- output for downgrade modal on client side.

drop function if exists public.ride_with_driver_details(uuid);

create or replace function public.ride_with_driver_details(ride_id uuid)
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
  vehicle_category vehicle_category
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
    v.category as vehicle_category
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
