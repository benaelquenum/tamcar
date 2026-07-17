-- ============================================================
-- RPC swap_stop_and_dropoff : le client promeut un stop en destination
-- finale. L'ancienne destination redevient un stop (dernière position
-- des stops actifs).
--
-- Exemple : trajet Ménontin → Fidjrossè avec escale à Sainte Rita.
-- Le client décide d'aller finalement à Sainte Rita et de passer par
-- Fidjrossè comme escale. Ce RPC swap l'ancien dropoff (Fidjrossè)
-- avec le stop (Sainte Rita).
-- ============================================================

create or replace function public.swap_stop_and_dropoff(
  p_stop_id uuid,
  p_new_total_km numeric,
  p_new_total_min int
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.ride_stops;
  r public.rides;
  old_dropoff_address text;
  old_dropoff_lat double precision;
  old_dropoff_lng double precision;
  new_stop_order int;
  extra_km numeric;
  extra_price int;
  km_price int;
  v_category vehicle_category;
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

  if s.status not in ('pending','accepted') then
    raise exception 'Cet arrêt ne peut plus être promu en destination.';
  end if;
  if r.status not in ('matched','arrived','in_progress') then
    raise exception 'Cette course ne permet plus de modifier l''itinéraire.';
  end if;

  -- Sauvegarde de l'ancien dropoff
  old_dropoff_address := r.dropoff_address;
  old_dropoff_lat := st_y(r.dropoff_location::geometry);
  old_dropoff_lng := st_x(r.dropoff_location::geometry);

  -- Tarif km + recalcul du prix
  select v.category into v_category
    from public.vehicles v where v.id = r.vehicle_id;
  select km_city_fcfa into km_price
    from public.category_pricing_tiers
    where category = coalesce(v_category, 'essentiel'::vehicle_category);
  km_price := coalesce(km_price, 90);

  extra_km := greatest(0, p_new_total_km - r.distance_km);
  extra_price := ceil(extra_km * km_price)::int;
  new_total := r.price_total_fcfa + extra_price;

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

  -- Passe le stop en position "après tout le reste" pour éviter les conflits
  -- de contrainte unique (ride_id, order_idx) pendant le swap
  update public.ride_stops
    set order_idx = -order_idx
    where id = p_stop_id;

  select coalesce(max(order_idx), 0) + 1
    into new_stop_order
    from public.ride_stops
    where ride_id = r.id
      and status <> 'cancelled'
      and id <> p_stop_id;

  -- Update rides : nouveau dropoff = le stop promu
  update public.rides
    set dropoff_address = s.address,
        dropoff_location = st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography,
        distance_km = p_new_total_km,
        duration_min = p_new_total_min,
        price_total_fcfa = new_total,
        driver_share_fcfa = new_driver_cash,
        driver_rachat_fcfa = new_driver_rachat,
        dealer_share_fcfa = new_dealer,
        platform_share_fcfa = new_platform,
        stops_extra_price_fcfa = stops_extra_price_fcfa + extra_price,
        updated_at = now()
    where id = r.id;

  -- Recycle le stop : devient l'ancien dropoff, placé en dernière position
  update public.ride_stops
    set address = old_dropoff_address,
        lat = old_dropoff_lat,
        lng = old_dropoff_lng,
        order_idx = new_stop_order,
        status = 'accepted',
        accepted_at = coalesce(accepted_at, now())
    where id = p_stop_id;

  return jsonb_build_object(
    'new_dropoff_address', s.address,
    'former_dropoff_address', old_dropoff_address,
    'stop_id_repurposed', p_stop_id,
    'new_total_fcfa', new_total,
    'extra_price_fcfa', extra_price
  );
end;
$$;

comment on function public.swap_stop_and_dropoff is
  'Le client promeut un stop existant en destination finale. L''ancienne destination devient un stop en dernière position.';

grant execute on function public.swap_stop_and_dropoff(uuid, numeric, int) to authenticated;
