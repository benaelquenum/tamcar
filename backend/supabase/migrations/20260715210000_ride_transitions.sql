-- ============================================================
-- TamCar — Ride transitions + wallet crédit (2026-07-15)
--
-- Boucle course en cours :
--   accept_ride          matched
--   driver_arrived       arrived
--   driver_start_ride    in_progress
--   driver_complete_ride completed (déclenche crédit wallets via trigger)
--
-- + ride_with_driver_details : RPC pour fetch les infos chauffeur+véhicule
--   assignés depuis le client
-- + trigger credit_wallets_on_ride_complete : crédite tamcar_revenus
--   du chauffeur (52%), tamcar_rachat (5%), tamcar_revenus du concess. (28%)
-- + Guard accept_ride : refuse si le chauffeur a déjà une course active
-- ============================================================

-- ------------------------------------------------------------
-- Patch accept_ride : refuser si driver a déjà une ride active
-- ------------------------------------------------------------
create or replace function public.accept_ride(ride_id uuid)
returns public.rides
language plpgsql security invoker as $$
declare
  driver_row public.drivers;
  dealer_id uuid;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into driver_row
  from public.drivers
  where profile_id = auth.uid();

  if driver_row is null then raise exception 'Not a driver'; end if;
  if driver_row.status <> 'active' or not driver_row.is_online then
    raise exception 'Driver not active or offline';
  end if;
  if driver_row.current_vehicle_id is null then
    raise exception 'No vehicle assigned';
  end if;

  -- Guard : pas de course déjà active
  if exists (
    select 1 from public.rides
    where driver_id = driver_row.id
      and status in ('matched', 'arrived', 'in_progress')
  ) then
    raise exception 'Course active déjà en cours — termine-la avant d''en prendre une autre.';
  end if;

  select dealer_partner_id into dealer_id
  from public.vehicles where id = driver_row.current_vehicle_id;

  update public.rides
  set driver_id = driver_row.id,
      vehicle_id = driver_row.current_vehicle_id,
      dealer_partner_id = dealer_id,
      status = 'matched',
      matched_at = now(),
      updated_at = now()
  where id = ride_id
    and status = 'requested'
    and driver_id is null
  returning * into result;

  if result is null then raise exception 'Ride already taken or unavailable'; end if;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- Helper : vérifie que auth.uid() est le driver assigné à la ride
-- ------------------------------------------------------------
create or replace function public._assert_ride_driver(p_ride_id uuid, expected_status ride_status[])
returns public.rides
language plpgsql security invoker as $$
declare
  r public.rides;
  d public.drivers;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into d from public.drivers where profile_id = auth.uid();
  if d is null then raise exception 'Not a driver'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.driver_id is null or r.driver_id <> d.id then
    raise exception 'Not your ride';
  end if;
  if not (r.status = any(expected_status)) then
    raise exception 'Invalid status transition (current: %)', r.status;
  end if;
  return r;
end;
$$;

-- ------------------------------------------------------------
-- Transitions status côté chauffeur
-- ------------------------------------------------------------
create or replace function public.driver_arrived(ride_id uuid)
returns public.rides
language plpgsql security invoker as $$
declare
  result public.rides;
begin
  perform public._assert_ride_driver(ride_id, array['matched']::ride_status[]);
  update public.rides
  set status = 'arrived', updated_at = now()
  where id = ride_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.driver_start_ride(ride_id uuid)
returns public.rides
language plpgsql security invoker as $$
declare
  result public.rides;
begin
  perform public._assert_ride_driver(ride_id, array['arrived', 'matched']::ride_status[]);
  update public.rides
  set status = 'in_progress', started_at = now(), updated_at = now()
  where id = ride_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.driver_complete_ride(ride_id uuid)
returns public.rides
language plpgsql security invoker as $$
declare
  result public.rides;
begin
  perform public._assert_ride_driver(ride_id, array['in_progress']::ride_status[]);
  update public.rides
  set status = 'completed', ended_at = now(), updated_at = now()
  where id = ride_id
  returning * into result;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- Trigger : à ride.status = 'completed', crédite les wallets
-- ------------------------------------------------------------
create or replace function public.credit_wallets_on_ride_complete()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  w_id uuid;
  driver_profile_id uuid;
  dealer_profile_id uuid;
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then

    -- Chauffeur cash → tamcar_revenus
    if new.driver_id is not null and new.driver_share_fcfa > 0 then
      select profile_id into driver_profile_id from public.drivers where id = new.driver_id;
      select id into w_id from public.wallets
        where profile_id = driver_profile_id and kind = 'tamcar_revenus';
      if w_id is not null then
        update public.wallets set balance_fcfa = balance_fcfa + new.driver_share_fcfa where id = w_id;
        insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
        values (w_id, 'revenue_share_credit', new.driver_share_fcfa, new.id, 'success');
      end if;

      -- Chauffeur rachat → tamcar_rachat (fonds cession échelonnée)
      if new.driver_rachat_fcfa > 0 then
        select id into w_id from public.wallets
          where profile_id = driver_profile_id and kind = 'tamcar_rachat';
        if w_id is not null then
          update public.wallets set balance_fcfa = balance_fcfa + new.driver_rachat_fcfa where id = w_id;
          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
          values (w_id, 'rachat_credit', new.driver_rachat_fcfa, new.id, 'success');
        end if;
      end if;
    end if;

    -- Concessionnaire → tamcar_revenus
    if new.dealer_partner_id is not null and new.dealer_share_fcfa > 0 then
      select profile_id into dealer_profile_id from public.dealer_partners where id = new.dealer_partner_id;
      select id into w_id from public.wallets
        where profile_id = dealer_profile_id and kind = 'tamcar_revenus';
      if w_id is not null then
        update public.wallets set balance_fcfa = balance_fcfa + new.dealer_share_fcfa where id = w_id;
        insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
        values (w_id, 'revenue_share_credit', new.dealer_share_fcfa, new.id, 'success');
      end if;
    end if;

  end if;
  return new;
end;
$$;

drop trigger if exists rides_credit_wallets on public.rides;
create trigger rides_credit_wallets
  after update on public.rides
  for each row execute function public.credit_wallets_on_ride_complete();

-- ------------------------------------------------------------
-- ride_with_driver_details : RPC pour le client, retourne ride + chauffeur + véhicule
-- ------------------------------------------------------------
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
  matched_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  driver_full_name text,
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
language sql stable security invoker as $$
  select
    r.id, r.client_id, r.driver_id, r.status,
    r.pickup_address,
    st_y(r.pickup_location::geometry) as pickup_lat,
    st_x(r.pickup_location::geometry) as pickup_lng,
    r.dropoff_address,
    st_y(r.dropoff_location::geometry) as dropoff_lat,
    st_x(r.dropoff_location::geometry) as dropoff_lng,
    r.distance_km, r.duration_min, r.price_total_fcfa, r.driver_share_fcfa,
    r.payment_method, r.requested_at, r.matched_at, r.started_at, r.ended_at,
    p.full_name as driver_full_name,
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
  where r.id = ride_id;
$$;
