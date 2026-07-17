-- ============================================================
-- Vague B v2 : refonte gestion itinéraire (2026-07-17)
--
-- Changements :
--   1. add_ride_stop :
--      - Auto-accept (insère en 'accepted' au lieu de 'pending')
--      - Nouveau paramètre p_mode ('stopover' | 'new_destination')
--        En mode 'new_destination' : le point devient le nouveau dropoff
--        de la ride (pas d'insertion dans ride_stops)
--   2. remove_ride_stop : le client retire un stop pas encore visité
--   3. reorder_ride_stops : le client réordonne les stops encore modifiables
--
-- Le client fournit systématiquement p_new_total_km / p_new_total_min
-- recalculés via Mapbox Directions. Le serveur ajuste price_total_fcfa
-- et les shares selon le split (proprietaire vs cession).
-- ============================================================

-- ------------------------------------------------------------
-- 1. add_ride_stop v2 : auto-accept + mode
-- ------------------------------------------------------------
drop function if exists public.add_ride_stop(
  uuid, text, double precision, double precision, numeric, int
);

create or replace function public.add_ride_stop(
  p_ride_id uuid,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_new_total_km numeric,
  p_new_total_min int,
  p_mode text default 'stopover'
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  v_category vehicle_category;
  km_price int;
  active_stops int;
  next_order int;
  extra_km numeric;
  extra_price int;
  result_stop public.ride_stops;
  new_total int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer int;
  new_platform int;
  driver_app_type driver_application_type;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_mode not in ('stopover', 'new_destination') then
    raise exception 'Invalid mode: %', p_mode;
  end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Cette course n''accepte plus de nouvel arrêt.';
  end if;

  -- Tarif km selon la catégorie du véhicule (ou fallback essentiel)
  select v.category into v_category
    from public.vehicles v where v.id = r.vehicle_id;
  select km_city_fcfa into km_price
    from public.category_pricing_tiers
    where category = coalesce(v_category, 'essentiel'::vehicle_category);
  km_price := coalesce(km_price, 90);

  extra_km := greatest(0, p_new_total_km - r.distance_km);
  extra_price := ceil(extra_km * km_price)::int;
  new_total := r.price_total_fcfa + extra_price;

  -- Recalcul shares selon le type de driver
  if r.driver_id is not null then
    select application_type into driver_app_type
     from public.drivers where id = r.driver_id;
  end if;
  if driver_app_type = 'proprietaire' then
    new_driver_cash := floor(new_total * 0.80)::int;
    new_driver_rachat := 0;
    new_dealer := 0;
    new_platform := new_total - new_driver_cash;
  else
    new_driver_cash := floor(new_total * 0.40)::int;
    new_driver_rachat := floor(new_total * 0.10)::int;
    new_dealer := floor(new_total * 0.30)::int;
    new_platform := new_total - new_driver_cash - new_driver_rachat - new_dealer;
  end if;

  if p_mode = 'new_destination' then
    -- Remplace la destination finale, pas d'insertion de stop
    update public.rides
    set dropoff_address = p_address,
        dropoff_location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        distance_km = p_new_total_km,
        duration_min = p_new_total_min,
        price_total_fcfa = new_total,
        driver_share_fcfa = new_driver_cash,
        driver_rachat_fcfa = new_driver_rachat,
        dealer_share_fcfa = new_dealer,
        platform_share_fcfa = new_platform,
        stops_extra_price_fcfa = stops_extra_price_fcfa + extra_price,
        updated_at = now()
    where id = p_ride_id;

    return jsonb_build_object(
      'mode', 'new_destination',
      'new_dropoff_address', p_address,
      'new_dropoff_lat', p_lat,
      'new_dropoff_lng', p_lng,
      'extra_price_fcfa', extra_price,
      'new_total_fcfa', new_total
    );
  end if;

  -- Mode stopover : compte les stops actifs, insère en 'accepted'
  select count(*)::int into active_stops
   from public.ride_stops
   where ride_id = p_ride_id
     and status <> 'cancelled';
  if active_stops >= 2 then raise exception 'Maximum 2 arrêts autorisés.'; end if;

  next_order := active_stops + 1;

  insert into public.ride_stops (
    ride_id, order_idx, address, lat, lng, status, accepted_at,
    extra_km_added, extra_price_fcfa
  ) values (
    p_ride_id, next_order, p_address, p_lat, p_lng, 'accepted', now(),
    extra_km, extra_price
  ) returning * into result_stop;

  update public.rides
  set stops_count = stops_count + 1,
      stops_extra_price_fcfa = stops_extra_price_fcfa + extra_price,
      price_total_fcfa = new_total,
      driver_share_fcfa = new_driver_cash,
      driver_rachat_fcfa = new_driver_rachat,
      dealer_share_fcfa = new_dealer,
      platform_share_fcfa = new_platform,
      distance_km = p_new_total_km,
      duration_min = p_new_total_min,
      updated_at = now()
  where id = p_ride_id;

  return jsonb_build_object(
    'mode', 'stopover',
    'stop_id', result_stop.id,
    'order_idx', result_stop.order_idx,
    'address', result_stop.address,
    'lat', result_stop.lat,
    'lng', result_stop.lng,
    'extra_price_fcfa', extra_price,
    'new_total_fcfa', new_total
  );
end;
$$;

comment on function public.add_ride_stop is
  'v2 : le client ajoute un arrêt (stopover, auto-accepté) OU redéfinit la destination finale (new_destination). Recalcule prix + shares.';

-- ------------------------------------------------------------
-- 2. remove_ride_stop : le client annule un stop non encore visité
-- ------------------------------------------------------------
create or replace function public.remove_ride_stop(
  p_stop_id uuid,
  p_new_total_km numeric,
  p_new_total_min int
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.ride_stops;
  r public.rides;
  removed_price int;
  new_total int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer int;
  new_platform int;
  driver_app_type driver_application_type;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into s from public.ride_stops where id = p_stop_id;
  if s is null then raise exception 'Stop not found'; end if;

  select * into r from public.rides where id = s.ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;

  if s.status not in ('pending', 'accepted') then
    raise exception 'Cet arrêt a déjà été atteint ou est annulé.';
  end if;

  removed_price := s.extra_price_fcfa;
  new_total := greatest(0, r.price_total_fcfa - removed_price);

  if r.driver_id is not null then
    select application_type into driver_app_type
     from public.drivers where id = r.driver_id;
  end if;
  if driver_app_type = 'proprietaire' then
    new_driver_cash := floor(new_total * 0.80)::int;
    new_driver_rachat := 0;
    new_dealer := 0;
    new_platform := new_total - new_driver_cash;
  else
    new_driver_cash := floor(new_total * 0.40)::int;
    new_driver_rachat := floor(new_total * 0.10)::int;
    new_dealer := floor(new_total * 0.30)::int;
    new_platform := new_total - new_driver_cash - new_driver_rachat - new_dealer;
  end if;

  update public.ride_stops
  set status = 'cancelled'
  where id = p_stop_id;

  update public.rides
  set stops_count = greatest(0, stops_count - 1),
      stops_extra_price_fcfa = greatest(0, stops_extra_price_fcfa - removed_price),
      price_total_fcfa = new_total,
      driver_share_fcfa = new_driver_cash,
      driver_rachat_fcfa = new_driver_rachat,
      dealer_share_fcfa = new_dealer,
      platform_share_fcfa = new_platform,
      distance_km = p_new_total_km,
      duration_min = p_new_total_min,
      updated_at = now()
  where id = r.id;

  return jsonb_build_object(
    'removed_stop_id', p_stop_id,
    'removed_price_fcfa', removed_price,
    'new_total_fcfa', new_total
  );
end;
$$;

comment on function public.remove_ride_stop is
  'v2 : le client retire un stop encore modifiable (pending/accepted). Le prix + shares sont recalculés.';

-- ------------------------------------------------------------
-- 3. reorder_ride_stops : le client réordonne les stops
-- ------------------------------------------------------------
create or replace function public.reorder_ride_stops(
  p_ride_id uuid,
  p_ordered_stop_ids uuid[],
  p_new_total_km numeric,
  p_new_total_min int
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  s public.ride_stops;
  i int;
  n_provided int;
  n_active int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;

  n_provided := coalesce(array_length(p_ordered_stop_ids, 1), 0);

  select count(*)::int into n_active
   from public.ride_stops
   where ride_id = p_ride_id
     and status in ('pending', 'accepted');

  if n_provided <> n_active then
    raise exception 'La liste ne couvre pas tous les arrêts modifiables (% attendus).', n_active;
  end if;

  -- Vérifie que chaque stop appartient à la ride et est modifiable
  for i in 1 .. n_provided loop
    select * into s from public.ride_stops
     where id = p_ordered_stop_ids[i] and ride_id = p_ride_id;
    if s is null then
      raise exception 'Stop % introuvable dans cette course.', p_ordered_stop_ids[i];
    end if;
    if s.status not in ('pending', 'accepted') then
      raise exception 'Stop % non réordonnable.', p_ordered_stop_ids[i];
    end if;
  end loop;

  -- Passe 1 : déplace tous les order_idx concernés vers une plage négative
  -- pour éviter la contrainte unique (ride_id, order_idx)
  update public.ride_stops
    set order_idx = -order_idx
    where ride_id = p_ride_id and status in ('pending', 'accepted');

  -- Passe 2 : assigne les positions finales (les stops arrived/departed gardent
  -- leur order_idx d'origine — normalement ils sont < aux nouveaux)
  for i in 1 .. n_provided loop
    update public.ride_stops
      set order_idx = i
      where id = p_ordered_stop_ids[i];
  end loop;

  update public.rides
    set distance_km = p_new_total_km,
        duration_min = p_new_total_min,
        updated_at = now()
    where id = r.id;

  return jsonb_build_object(
    'ride_id', p_ride_id,
    'reordered_count', n_provided,
    'new_distance_km', p_new_total_km,
    'new_duration_min', p_new_total_min
  );
end;
$$;

comment on function public.reorder_ride_stops is
  'v2 : le client réordonne les stops encore modifiables (pending/accepted). Le prix reste inchangé, seule la distance/durée est mise à jour.';

-- ------------------------------------------------------------
-- 4. rides.dropoff_location : s'assurer que la RLS + realtime propagent les updates
--    (la publication supabase_realtime couvre déjà 'rides' et 'ride_stops')
-- ------------------------------------------------------------

grant execute on function public.add_ride_stop(uuid, text, double precision, double precision, numeric, int, text) to authenticated;
grant execute on function public.remove_ride_stop(uuid, numeric, int) to authenticated;
grant execute on function public.reorder_ride_stops(uuid, uuid[], numeric, int) to authenticated;

-- ------------------------------------------------------------
-- 5. Rétro-compat : passe les stops legacy 'pending' en 'accepted'
--    (la nouvelle logique auto-accepte, donc 'pending' ne doit plus exister)
-- ------------------------------------------------------------
update public.ride_stops
   set status = 'accepted',
       accepted_at = coalesce(accepted_at, now())
 where status = 'pending';

-- Autorise driver_arrive_at_stop à agir aussi sur un stop pending
-- (au cas où un ancien client appelle add_ride_stop sans le p_mode).
create or replace function public.driver_arrive_at_stop(p_stop_id uuid)
returns public.ride_stops
language plpgsql security definer set search_path = public as $$
declare
  s public.ride_stops;
  result public.ride_stops;
begin
  s := public._assert_stop_driver(p_stop_id);
  if s.status not in ('pending', 'accepted') then
    raise exception 'Stop non accessible (status: %)', s.status;
  end if;

  update public.ride_stops
  set status = 'arrived',
      arrived_at = now(),
      accepted_at = coalesce(accepted_at, now())
  where id = p_stop_id
  returning * into result;
  return result;
end;
$$;
