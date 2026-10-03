-- ============================================================
-- Admin : carte en direct des chauffeurs connectés (2026-10-03)
-- ============================================================
-- Deux fonctions réservées à l'équipe TamCar (is_admin) :
--   admin_live_drivers()                 tous les chauffeurs connectés (is_online), avec leur
--                                        position, leur véhicule et leur course en cours ;
--   admin_live_driver_detail(driver_id)  la fiche d'un chauffeur : profil, véhicule, chiffres du
--                                        jour, course en cours (client, adresses, arrêts, prix),
--                                        dernières courses, soldes des portefeuilles.
-- La position vient de drivers.current_location, mise à jour par driver_update_location ; la
-- fraîcheur se lit sur last_seen_at (à défaut updated_at). Une course « en cours » = matched,
-- arrived ou in_progress.

create or replace function public.admin_live_drivers()
returns table (
  driver_id uuid,
  profile_id uuid,
  full_name text,
  phone text,
  avatar_url text,
  lat double precision,
  lng double precision,
  seen_seconds int,
  rating_avg numeric,
  driver_status text,
  category text,
  vehicle_color text,
  vehicle_label text,
  plate_number text,
  ride_id uuid,
  ride_status text,
  ride_pickup text,
  ride_dropoff text,
  ride_price_fcfa int,
  ride_client_name text
)
language plpgsql stable security definer set search_path = public as $fn_ald$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''équipe TamCar.';
  end if;

  return query
  select d.id,
         d.profile_id,
         p.full_name,
         p.phone,
         p.avatar_url,
         case when d.current_location is null then null else st_y(d.current_location::geometry) end,
         case when d.current_location is null then null else st_x(d.current_location::geometry) end,
         greatest(0, extract(epoch from (now() - coalesce(d.last_seen_at, d.updated_at)))::int),
         d.rating_avg,
         d.status::text,
         v.category::text,
         v.color,
         nullif(trim(coalesce(v.brand, '') || ' ' || coalesce(v.model, '')), ''),
         v.plate_number,
         r.id,
         r.status::text,
         r.pickup_address,
         r.dropoff_address,
         r.price_total_fcfa,
         cp.full_name
    from public.drivers d
    join public.profiles p on p.id = d.profile_id
    left join public.vehicles v on v.id = d.current_vehicle_id
    left join lateral (
      select rr.id, rr.status, rr.pickup_address, rr.dropoff_address, rr.price_total_fcfa, rr.client_id
        from public.rides rr
       where rr.driver_id = d.id
         and rr.status in ('matched', 'arrived', 'in_progress')
       order by coalesce(rr.matched_at, rr.requested_at) desc
       limit 1
    ) r on true
    left join public.profiles cp on cp.id = r.client_id
   where d.is_online = true
   order by p.full_name;
end;
$fn_ald$;

create or replace function public.admin_live_driver_detail(p_driver_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn_aldd$
declare
  v_d public.drivers;
  v_p public.profiles;
  v_v public.vehicles;
  v_r public.rides;
  v_cp public.profiles;
  v_day timestamptz := (date_trunc('day', now() at time zone 'Africa/Porto-Novo')) at time zone 'Africa/Porto-Novo';
  v_done int;
  v_volume bigint;
  v_cancel int;
  v_ride jsonb := null;
  v_recent jsonb;
  v_rev bigint;
  v_epa bigint;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''équipe TamCar.';
  end if;

  select * into v_d from public.drivers where id = p_driver_id;
  if not found then
    return null;
  end if;
  select * into v_p from public.profiles where id = v_d.profile_id;
  select * into v_v from public.vehicles where id = v_d.current_vehicle_id;

  select * into v_r
    from public.rides
   where driver_id = v_d.id and status in ('matched', 'arrived', 'in_progress')
   order by coalesce(matched_at, requested_at) desc
   limit 1;

  if v_r.id is not null then
    select * into v_cp from public.profiles where id = v_r.client_id;
    v_ride := jsonb_build_object(
      'id', v_r.id,
      'status', v_r.status::text,
      'requested_at', v_r.requested_at,
      'matched_at', v_r.matched_at,
      'arrived_at', v_r.arrived_at,
      'started_at', v_r.started_at,
      'pickup_address', v_r.pickup_address,
      'pickup_lat', st_y(v_r.pickup_location::geometry),
      'pickup_lng', st_x(v_r.pickup_location::geometry),
      'dropoff_address', v_r.dropoff_address,
      'dropoff_lat', st_y(v_r.dropoff_location::geometry),
      'dropoff_lng', st_x(v_r.dropoff_location::geometry),
      'distance_km', v_r.distance_km,
      'duration_min', v_r.duration_min,
      'price_total_fcfa', v_r.price_total_fcfa,
      'payment_method', v_r.payment_method::text,
      'category', v_r.requested_category::text,
      'with_ac', v_r.with_ac,
      'has_luggage', v_r.has_luggage,
      'stops_count', v_r.stops_count,
      'passenger_name', v_r.passenger_name,
      'passenger_phone', v_r.passenger_phone,
      'driver_distance_at_match_m', v_r.driver_distance_at_match_m,
      'client_name', v_cp.full_name,
      'client_phone', v_cp.phone,
      'stops', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'order', s.order_idx, 'address', s.address, 'lat', s.lat, 'lng', s.lng, 'status', s.status::text)
               order by s.order_idx)
          from public.ride_stops s
         where s.ride_id = v_r.id
      ), '[]'::jsonb)
    );
  end if;

  select count(*), coalesce(sum(price_total_fcfa), 0)
    into v_done, v_volume
    from public.rides
   where driver_id = v_d.id and status = 'completed' and ended_at >= v_day;

  select count(*) into v_cancel
    from public.rides
   where driver_id = v_d.id and status = 'cancelled_by_driver' and cancelled_at >= v_day;

  select coalesce(jsonb_agg(x order by x_at desc), '[]'::jsonb)
    into v_recent
    from (
      select jsonb_build_object(
               'id', rr.id, 'status', rr.status::text, 'pickup_address', rr.pickup_address,
               'dropoff_address', rr.dropoff_address, 'price_total_fcfa', rr.price_total_fcfa,
               'at', coalesce(rr.ended_at, rr.cancelled_at, rr.requested_at)) as x,
             coalesce(rr.ended_at, rr.cancelled_at, rr.requested_at) as x_at
        from public.rides rr
       where rr.driver_id = v_d.id and rr.status not in ('matched', 'arrived', 'in_progress')
       order by coalesce(rr.ended_at, rr.cancelled_at, rr.requested_at) desc
       limit 5
    ) t;

  select balance_fcfa into v_rev from public.wallets where profile_id = v_d.profile_id and kind = 'tamcar_revenus';
  select balance_fcfa into v_epa from public.wallets where profile_id = v_d.profile_id and kind = 'tamcar_epargne';

  return jsonb_build_object(
    'driver', jsonb_build_object(
      'id', v_d.id,
      'profile_id', v_d.profile_id,
      'full_name', v_p.full_name,
      'phone', v_p.phone,
      'avatar_url', v_p.avatar_url,
      'status', v_d.status::text,
      'kyc_status', v_d.kyc_status::text,
      'is_online', v_d.is_online,
      'rating_avg', v_d.rating_avg,
      'rating_count', v_d.rating_count,
      'application_type', v_d.application_type::text,
      'registered_at', v_d.created_at,
      'last_seen_at', coalesce(v_d.last_seen_at, v_d.updated_at),
      'lat', case when v_d.current_location is null then null else st_y(v_d.current_location::geometry) end,
      'lng', case when v_d.current_location is null then null else st_x(v_d.current_location::geometry) end
    ),
    'vehicle', case when v_v.id is null then null else jsonb_build_object(
      'id', v_v.id, 'plate_number', v_v.plate_number, 'brand', v_v.brand, 'model', v_v.model,
      'year', v_v.year, 'color', v_v.color, 'category', v_v.category::text, 'seats', v_v.seats
    ) end,
    'today', jsonb_build_object('rides_completed', v_done, 'volume_fcfa', v_volume, 'cancelled_by_driver', v_cancel),
    'ride', v_ride,
    'recent', v_recent,
    'wallets', jsonb_build_object('revenus_fcfa', coalesce(v_rev, 0), 'epargne_fcfa', coalesce(v_epa, 0))
  );
end;
$fn_aldd$;

-- Appelables seulement par un compte connecté ; le contrôle is_admin() est dans les fonctions.
revoke all on function public.admin_live_drivers() from public, anon;
revoke all on function public.admin_live_driver_detail(uuid) from public, anon;
grant execute on function public.admin_live_drivers() to authenticated;
grant execute on function public.admin_live_driver_detail(uuid) to authenticated;
