-- ============================================================
-- Course programmée (Réserver à l'avance).
--
-- Flow :
--   1. Client réserve avec p_scheduled_at (ex : demain 8h)
--   2. Ride créée avec status='scheduled' (INVISIBLE aux chauffeurs)
--   3. À H-15 min, un batch la bascule en status='requested'
--      + push aux chauffeurs éligibles
--   4. Matching normal reprend
--
-- Le batch est appelé en piggy-back à chaque `pending_rides_for_driver`
-- (déjà spammée par les chauffeurs online) → pas besoin de pg_cron.
--
-- Client peut annuler gratuitement tant que status='scheduled'.
-- ============================================================

-- 1. Nouveau status 'scheduled'
alter type ride_status add value if not exists 'scheduled';

-- ------------------------------------------------------------
-- 2. create_ride v4 : status='scheduled' si scheduled_at > now()+15min
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
language plpgsql security invoker as $fn_ride$
declare
  quote record;
  new_ride public.rides;
  v_status ride_status;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  if not public._is_within_service_zone(p_pickup_lat, p_pickup_lng) then
    raise exception 'Point de départ hors zone de service. TamCar couvre actuellement Cotonou et Porto-Novo uniquement.';
  end if;
  if not public._is_within_service_zone(p_dropoff_lat, p_dropoff_lng) then
    raise exception 'Destination hors zone de service. TamCar couvre actuellement Cotonou et Porto-Novo uniquement.';
  end if;

  if p_scheduled_at is not null then
    if p_scheduled_at < now() + interval '15 minutes' then
      raise exception 'Une réservation doit être au moins 15 minutes dans le futur';
    end if;
    if p_scheduled_at > now() + interval '30 days' then
      raise exception 'Réservation possible jusqu''à 30 jours à l''avance';
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
    quote.price_total_fcfa,
    quote.driver_cash_fcfa, quote.driver_rachat_fcfa,
    quote.dealer_share_fcfa, quote.platform_share_fcfa,
    v_status, p_payment_method, p_scheduled_at, now(),
    p_category, p_with_ac
  ) returning * into new_ride;

  return new_ride;
end;
$fn_ride$;

-- ------------------------------------------------------------
-- 3. Helper : bascule les rides scheduled dues → requested
-- ------------------------------------------------------------
create or replace function public._release_due_scheduled_rides()
returns int
language plpgsql security definer set search_path = public as $fn_release$
declare
  v_count int;
begin
  update public.rides
    set status = 'requested',
        requested_at = now(),
        updated_at = now()
    where status = 'scheduled'
      and scheduled_at <= now() + interval '15 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn_release$;

-- ------------------------------------------------------------
-- 4. Trigger : quand status passe scheduled → requested,
--    notifie les chauffeurs compatibles
-- ------------------------------------------------------------
create or replace function public._on_ride_released_from_schedule()
returns trigger
language plpgsql security definer set search_path = public as $fn_rel_trg$
begin
  if old.status = 'scheduled' and new.status = 'requested' then
    perform public._notify_matching_drivers(new.id);
  end if;
  return new;
end;
$fn_rel_trg$;

drop trigger if exists trg_ride_released_push on public.rides;
create trigger trg_ride_released_push
  after update of status on public.rides
  for each row
  execute function public._on_ride_released_from_schedule();

-- ------------------------------------------------------------
-- 5. pending_rides_for_driver v6 : bascule les scheduled dues en début
-- ------------------------------------------------------------
drop function if exists public.pending_rides_for_driver(double precision);

create or replace function public.pending_rides_for_driver(
  radius_km double precision default 10.0
)
returns table (
  id uuid,
  pickup_address text,
  dropoff_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  distance_from_driver_m double precision,
  distance_km numeric,
  duration_min int,
  price_total_fcfa int,
  driver_share_fcfa int,
  requested_at timestamptz,
  requested_category vehicle_category,
  downgrade_accepted_at timestamptz,
  is_below_driver_category boolean
)
language plpgsql stable security invoker as $fn_pending$
#variable_conflict use_column
declare
  v_drv_id uuid;
  v_drv_loc geography;
  v_drv_category vehicle_category;
  v_active_dropoff geography;
  v_active_count int;
  v_search_origin geography;
  v_effective_radius double precision;
begin
  -- Piggy-back : libère les scheduled dues
  perform public._release_due_scheduled_rides();

  select d.id, d.current_location, v.category
    into v_drv_id, v_drv_loc, v_drv_category
  from public.drivers d
  left join public.vehicles v on v.id = d.current_vehicle_id
  where d.profile_id = auth.uid()
    and d.is_online = true
    and d.status = 'active'
  limit 1;

  if v_drv_id is null or v_drv_loc is null or v_drv_category is null then
    return;
  end if;

  select count(*)::int into v_active_count
   from public.rides r
   where r.driver_id = v_drv_id
     and r.status in ('matched', 'arrived', 'in_progress');
  if v_active_count >= 2 then return; end if;

  if v_active_count = 1 then
    select r.dropoff_location into v_active_dropoff
     from public.rides r
     where r.driver_id = v_drv_id
       and r.status in ('matched', 'arrived', 'in_progress')
     order by r.matched_at asc limit 1;
  end if;

  if v_active_dropoff is not null then
    v_search_origin := v_active_dropoff;
    v_effective_radius := 3.0;
  else
    v_search_origin := v_drv_loc;
    v_effective_radius := radius_km;
  end if;

  return query
  select
    r.id, r.pickup_address, r.dropoff_address,
    st_y(r.pickup_location::geometry) as pickup_lat,
    st_x(r.pickup_location::geometry) as pickup_lng,
    st_y(r.dropoff_location::geometry) as dropoff_lat,
    st_x(r.dropoff_location::geometry) as dropoff_lng,
    st_distance(r.pickup_location, v_search_origin) as distance_from_driver_m,
    r.distance_km, r.duration_min,
    r.price_total_fcfa, r.driver_share_fcfa,
    r.requested_at,
    r.requested_category, r.downgrade_accepted_at,
    (v_drv_category = 'confort' and r.requested_category = 'essentiel') as is_below_driver_category
  from public.rides r
  where r.status = 'requested'
    and r.driver_id is null
    and st_dwithin(r.pickup_location, v_search_origin, v_effective_radius * 1000)
    and (
      v_drv_category = r.requested_category
      or (v_drv_category = 'confort' and r.requested_category = 'essentiel')
    )
  order by st_distance(r.pickup_location, v_search_origin) asc
  limit 20;
end;
$fn_pending$;

-- ------------------------------------------------------------
-- 6. RPC : mes courses programmées
-- ------------------------------------------------------------
create or replace function public.my_scheduled_rides()
returns table (
  id uuid,
  pickup_address text,
  dropoff_address text,
  scheduled_at timestamptz,
  price_total_fcfa int,
  requested_category vehicle_category
)
language sql stable security invoker as $fn_sched$
  select
    r.id, r.pickup_address, r.dropoff_address,
    r.scheduled_at, r.price_total_fcfa, r.requested_category
  from public.rides r
  where r.client_id = auth.uid()
    and r.status = 'scheduled'
    and r.scheduled_at > now()
  order by r.scheduled_at asc;
$fn_sched$;

grant execute on function public.my_scheduled_rides to authenticated;

-- ------------------------------------------------------------
-- 7. RPC : annuler une course programmée (gratuit, pas encore matchée)
-- ------------------------------------------------------------
create or replace function public.cancel_scheduled_ride(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn_cancel_sched$
declare
  r public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status <> 'scheduled' then
    raise exception 'Course déjà libérée aux chauffeurs — utilise l''annulation standard';
  end if;

  update public.rides
    set status = 'cancelled_by_client',
        cancel_reason = 'free_scheduled',
        ended_at = now(),
        updated_at = now()
    where id = p_ride_id;
end;
$fn_cancel_sched$;

grant execute on function public.cancel_scheduled_ride to authenticated;
