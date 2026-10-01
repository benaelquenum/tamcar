-- ============================================================
-- TamCar — Arrêts et changements d'itinéraire : prix recalculé comme à la
-- commande, chauffeur prévenu de tout (2026-10-01)
--
-- Audit de add_ride_stop / remove_ride_stop / reorder_ride_stops /
-- swap_stop_and_dropoff (v2) :
--   • le prix était recalculé à part du moteur tarifaire : km supplémentaires
--     × tarif ville seulement, sans minutes, sans tarif corridor, sans arrondi
--     au 50 F ni minimum de course ; retirer un arrêt soustrayait le surcoût
--     d'origine (des approximations qui s'additionnent) ;
--   • réordonner les arrêts changeait la distance mais « laissait le prix
--     inchangé » ;
--   • les parts chauffeur / rachat / partenaire / plateforme étaient
--     recalculées avec des pourcentages recopiés dans chaque fonction ;
--   • aucun contrôle de zone de service sur un arrêt ;
--   • le chauffeur recevait une notification à CHAQUE changement de statut
--     d'un arrêt, y compris ses propres « arrivé / reparti » (trigger
--     trg_ride_stops_change), jamais le détail du prix ni de sa part.
--
-- Maintenant :
--   • _ride_reprice : nouveau prix = ancien prix + (compute_price(nouvel
--     itinéraire) − compute_price(ancien itinéraire)). Même moteur que la
--     commande (base, km, minutes, corridor, arrondi 50 F) ; une remise
--     promo reste acquise ; sur un trajet à prix fixe corridor, le détour est
--     facturé au tarif km corridor ;
--   • _ride_shares : UNE règle de répartition (propriétaire 80/20 ; sinon
--     40/10/30/20, comme accept_ride) ;
--   • quote_ride_route_change : le client voit le nouveau prix AVANT de
--     confirmer ;
--   • chaque modification notifie le chauffeur (arrêt, nouveau prix, sa part,
--     part TamCar) et l'écran du chauffeur se met à jour en temps réel ;
--   • jusqu'à 5 arrêts par course.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Répartition d'un prix entre les acteurs
-- ------------------------------------------------------------
create or replace function public._ride_shares(p_total int, p_driver_id uuid)
returns table (driver_cash int, rachat int, dealer int, platform int)
language plpgsql stable security definer set search_path = public as $fn_sh$
declare
  v_type driver_application_type;
begin
  if p_driver_id is not null then
    select application_type into v_type from public.drivers where id = p_driver_id;
  end if;
  if v_type = 'proprietaire' then
    driver_cash := floor(p_total * 0.80)::int;
    rachat := 0;
    dealer := 0;
    platform := p_total - driver_cash;
  else
    driver_cash := floor(p_total * 0.40)::int;
    rachat := floor(p_total * 0.10)::int;
    dealer := floor(p_total * 0.30)::int;
    platform := p_total - driver_cash - rachat - dealer;
  end if;
  return next;
end;
$fn_sh$;

revoke all on function public._ride_shares(int, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Nouveau prix d'une course dont l'itinéraire change
-- ------------------------------------------------------------
create or replace function public._ride_reprice(
  p_ride_id uuid,
  p_new_km numeric,
  p_new_min int,
  p_new_dropoff_lat double precision default null,
  p_new_dropoff_lng double precision default null
)
returns table (
  old_total int,
  new_total int,
  delta int,
  driver_cash int,
  rachat int,
  dealer int,
  platform int
)
language plpgsql stable security definer set search_path = public as $fn_rp$
declare
  r public.rides;
  v_cat vehicle_category;
  q_old record;
  q_new record;
  v_new_lat double precision;
  v_new_lng double precision;
  v_rate int;
  v_km_diff numeric;
  sh record;
begin
  select * into r from public.rides where id = p_ride_id;
  if r.id is null then raise exception 'Ride not found'; end if;
  if p_new_km is null or p_new_km <= 0 or p_new_min is null or p_new_min <= 0 then
    raise exception 'Itinéraire invalide.';
  end if;

  v_cat := coalesce(r.requested_category, 'essentiel'::vehicle_category);
  v_new_lat := coalesce(p_new_dropoff_lat, st_y(r.dropoff_location::geometry));
  v_new_lng := coalesce(p_new_dropoff_lng, st_x(r.dropoff_location::geometry));

  select * into q_old from public.compute_price(
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    r.distance_km, r.duration_min, v_cat, false, coalesce(r.with_ac, false)
  ) limit 1;
  select * into q_new from public.compute_price(
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    v_new_lat, v_new_lng,
    p_new_km, p_new_min, v_cat, false, coalesce(r.with_ac, false)
  ) limit 1;
  if q_old is null or q_new is null then raise exception 'compute_price returned null'; end if;

  v_km_diff := p_new_km - coalesce(r.distance_km, p_new_km);

  if q_old.is_corridor and q_new.is_corridor then
    -- Prix fixe corridor : le détour (ou le raccourci) est facturé au km.
    select km_corridor_fcfa into v_rate from public.pricing_tiers where category = v_cat;
    delta := public.ceil_to_50(ceil(abs(v_km_diff) * coalesce(v_rate, 160))::int);
    if v_km_diff < 0 then delta := -delta; end if;
  else
    delta := q_new.price_total_fcfa - q_old.price_total_fcfa;
  end if;

  old_total := r.price_total_fcfa;
  new_total := greatest(0, r.price_total_fcfa + delta);
  delta := new_total - old_total;

  select * into sh from public._ride_shares(new_total, r.driver_id);
  driver_cash := sh.driver_cash;
  rachat := sh.rachat;
  dealer := sh.dealer;
  platform := sh.platform;
  return next;
end;
$fn_rp$;

revoke all on function public._ride_reprice(uuid, numeric, int, double precision, double precision) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Le client voit le nouveau prix avant de confirmer
-- ------------------------------------------------------------
create or replace function public.quote_ride_route_change(
  p_ride_id uuid,
  p_new_total_km numeric,
  p_new_total_min int,
  p_new_dropoff_lat double precision default null,
  p_new_dropoff_lng double precision default null
)
returns table (
  current_total_fcfa int,
  new_total_fcfa int,
  delta_fcfa int,
  driver_share_fcfa int
)
language plpgsql stable security definer set search_path = public as $fn_q$
declare
  r public.rides;
  q record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r.id is null or r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;

  select * into q from public._ride_reprice(p_ride_id, p_new_total_km, p_new_total_min, p_new_dropoff_lat, p_new_dropoff_lng);
  current_total_fcfa := q.old_total;
  new_total_fcfa := q.new_total;
  delta_fcfa := q.delta;
  driver_share_fcfa := q.driver_cash;
  return next;
end;
$fn_q$;

grant execute on function public.quote_ride_route_change(uuid, numeric, int, double precision, double precision) to authenticated;

-- ------------------------------------------------------------
-- 4. Le chauffeur est prévenu, avec tout ce qui change pour lui
-- ------------------------------------------------------------
create or replace function public._notify_driver_route_change(p_ride_id uuid, p_what text)
returns void
language plpgsql security definer set search_path = public as $fn_nd$
declare
  r public.rides;
  v_profile uuid;
begin
  select * into r from public.rides where id = p_ride_id;
  if r.id is null or r.driver_id is null then return; end if;
  select profile_id into v_profile from public.drivers where id = r.driver_id;
  if v_profile is null then return; end if;

  perform public._push_notify(
    v_profile,
    'Itinéraire modifié',
    p_what || ' · Course : ' || r.price_total_fcfa::text || ' F · vous gagnez '
      || r.driver_share_fcfa::text || ' F · part TamCar '
      || (r.price_total_fcfa - r.driver_share_fcfa)::text || ' F · '
      || to_char(coalesce(r.distance_km, 0), 'FM999990.0') || ' km',
    '/ride/' || r.id::text,
    'ride:' || r.id::text,
    true
  );
end;
$fn_nd$;

revoke all on function public._notify_driver_route_change(uuid, text) from public, anon, authenticated;

-- Ancien trigger : notifiait le chauffeur de SES PROPRES passages aux arrêts
-- et jamais du détail. Remplacé par les appels ci-dessous.
drop trigger if exists trg_ride_stops_change on public.ride_stops;

-- ------------------------------------------------------------
-- 5. add_ride_stop : escale ou nouvelle destination
-- ------------------------------------------------------------
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
language plpgsql security definer set search_path = public as $fn_add$
declare
  r public.rides;
  q record;
  active_stops int;
  result_stop public.ride_stops;
  c_max_stops constant int := 5;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_mode not in ('stopover', 'new_destination') then
    raise exception 'Invalid mode: %', p_mode;
  end if;
  if nullif(trim(coalesce(p_address, '')), '') is null then
    raise exception 'Adresse manquante.';
  end if;

  select * into r from public.rides where id = p_ride_id for update;
  if r.id is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Cette course n''accepte plus de nouvel arrêt.';
  end if;
  if not public._is_within_service_zone(p_lat, p_lng) then
    raise exception 'Ce lieu est hors zone de service.';
  end if;

  if p_mode = 'new_destination' then
    select * into q from public._ride_reprice(p_ride_id, p_new_total_km, p_new_total_min, p_lat, p_lng);

    update public.rides
       set dropoff_address = p_address,
           dropoff_location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
           distance_km = p_new_total_km,
           duration_min = p_new_total_min,
           price_total_fcfa = q.new_total,
           driver_share_fcfa = q.driver_cash,
           driver_rachat_fcfa = q.rachat,
           dealer_share_fcfa = q.dealer,
           platform_share_fcfa = q.platform,
           stops_extra_price_fcfa = stops_extra_price_fcfa + q.delta,
           updated_at = now()
     where id = p_ride_id;

    perform public._notify_driver_route_change(p_ride_id, 'Nouvelle destination : ' || left(p_address, 60));

    return jsonb_build_object(
      'mode', 'new_destination',
      'new_dropoff_address', p_address,
      'new_dropoff_lat', p_lat,
      'new_dropoff_lng', p_lng,
      'extra_price_fcfa', q.delta,
      'new_total_fcfa', q.new_total,
      'driver_share_fcfa', q.driver_cash
    );
  end if;

  select count(*)::int into active_stops
    from public.ride_stops
   where ride_id = p_ride_id and status <> 'cancelled';
  if active_stops >= c_max_stops then
    raise exception 'Maximum % arrêts autorisés.', c_max_stops;
  end if;

  select * into q from public._ride_reprice(p_ride_id, p_new_total_km, p_new_total_min);

  -- order_idx = max + 1 (et non count + 1) : un arrêt annulé garde sa place.
  insert into public.ride_stops (
    ride_id, order_idx, address, lat, lng, status, accepted_at,
    extra_km_added, extra_price_fcfa
  ) values (
    p_ride_id,
    (select coalesce(max(order_idx), 0) + 1 from public.ride_stops where ride_id = p_ride_id),
    p_address, p_lat, p_lng, 'accepted', now(),
    greatest(0, p_new_total_km - coalesce(r.distance_km, p_new_total_km)), q.delta
  ) returning * into result_stop;

  update public.rides
     set stops_count = stops_count + 1,
         stops_extra_price_fcfa = stops_extra_price_fcfa + q.delta,
         price_total_fcfa = q.new_total,
         driver_share_fcfa = q.driver_cash,
         driver_rachat_fcfa = q.rachat,
         dealer_share_fcfa = q.dealer,
         platform_share_fcfa = q.platform,
         distance_km = p_new_total_km,
         duration_min = p_new_total_min,
         updated_at = now()
   where id = p_ride_id;

  perform public._notify_driver_route_change(p_ride_id, 'Nouvel arrêt : ' || left(p_address, 60));

  return jsonb_build_object(
    'mode', 'stopover',
    'stop_id', result_stop.id,
    'order_idx', result_stop.order_idx,
    'address', result_stop.address,
    'lat', result_stop.lat,
    'lng', result_stop.lng,
    'extra_price_fcfa', q.delta,
    'new_total_fcfa', q.new_total,
    'driver_share_fcfa', q.driver_cash
  );
end;
$fn_add$;

comment on function public.add_ride_stop is
  'v3 : escale (auto-acceptée, 5 max) ou nouvelle destination. Prix = ancien + écart du moteur tarifaire ; parts via _ride_shares ; chauffeur notifié.';

-- ------------------------------------------------------------
-- 6. remove_ride_stop
-- ------------------------------------------------------------
create or replace function public.remove_ride_stop(
  p_stop_id uuid,
  p_new_total_km numeric,
  p_new_total_min int
)
returns jsonb
language plpgsql security definer set search_path = public as $fn_rm$
declare
  s public.ride_stops;
  r public.rides;
  q record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into s from public.ride_stops where id = p_stop_id;
  if s.id is null then raise exception 'Stop not found'; end if;

  select * into r from public.rides where id = s.ride_id for update;
  if r.id is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;

  if s.status not in ('pending', 'accepted') then
    raise exception 'Cet arrêt a déjà été atteint ou est annulé.';
  end if;
  if r.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Cette course ne permet plus de modifier l''itinéraire.';
  end if;

  select * into q from public._ride_reprice(r.id, p_new_total_km, p_new_total_min);

  update public.ride_stops set status = 'cancelled' where id = p_stop_id;

  update public.rides
     set stops_count = greatest(0, stops_count - 1),
         stops_extra_price_fcfa = stops_extra_price_fcfa + q.delta,
         price_total_fcfa = q.new_total,
         driver_share_fcfa = q.driver_cash,
         driver_rachat_fcfa = q.rachat,
         dealer_share_fcfa = q.dealer,
         platform_share_fcfa = q.platform,
         distance_km = p_new_total_km,
         duration_min = p_new_total_min,
         updated_at = now()
   where id = r.id;

  perform public._notify_driver_route_change(r.id, 'Arrêt retiré : ' || left(s.address, 60));

  return jsonb_build_object(
    'removed_stop_id', p_stop_id,
    'removed_price_fcfa', -q.delta,
    'new_total_fcfa', q.new_total,
    'driver_share_fcfa', q.driver_cash
  );
end;
$fn_rm$;

-- ------------------------------------------------------------
-- 7. reorder_ride_stops : l'ordre change la distance, donc le prix
-- ------------------------------------------------------------
create or replace function public.reorder_ride_stops(
  p_ride_id uuid,
  p_ordered_stop_ids uuid[],
  p_new_total_km numeric,
  p_new_total_min int
)
returns jsonb
language plpgsql security definer set search_path = public as $fn_ro$
declare
  r public.rides;
  s public.ride_stops;
  q record;
  i int;
  n_provided int;
  n_active int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id for update;
  if r.id is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Cette course ne permet plus de modifier l''itinéraire.';
  end if;

  n_provided := coalesce(array_length(p_ordered_stop_ids, 1), 0);

  select count(*)::int into n_active
    from public.ride_stops
   where ride_id = p_ride_id and status in ('pending', 'accepted');

  if n_provided <> n_active then
    raise exception 'La liste ne couvre pas tous les arrêts modifiables (% attendus).', n_active;
  end if;

  for i in 1 .. n_provided loop
    select * into s from public.ride_stops
     where id = p_ordered_stop_ids[i] and ride_id = p_ride_id;
    if s.id is null then
      raise exception 'Stop % introuvable dans cette course.', p_ordered_stop_ids[i];
    end if;
    if s.status not in ('pending', 'accepted') then
      raise exception 'Stop % non réordonnable.', p_ordered_stop_ids[i];
    end if;
  end loop;

  select * into q from public._ride_reprice(p_ride_id, p_new_total_km, p_new_total_min);

  -- Les arrêts déjà visités gardent leur rang ; les autres passent après eux.
  update public.ride_stops
     set order_idx = -order_idx
   where ride_id = p_ride_id and status in ('pending', 'accepted');

  for i in 1 .. n_provided loop
    update public.ride_stops
       set order_idx = (select coalesce(max(order_idx), 0) from public.ride_stops
                         where ride_id = p_ride_id and status not in ('pending', 'accepted') and order_idx > 0) + i
     where id = p_ordered_stop_ids[i];
  end loop;

  update public.rides
     set stops_extra_price_fcfa = stops_extra_price_fcfa + q.delta,
         price_total_fcfa = q.new_total,
         driver_share_fcfa = q.driver_cash,
         driver_rachat_fcfa = q.rachat,
         dealer_share_fcfa = q.dealer,
         platform_share_fcfa = q.platform,
         distance_km = p_new_total_km,
         duration_min = p_new_total_min,
         updated_at = now()
   where id = r.id;

  perform public._notify_driver_route_change(r.id, 'Ordre des arrêts modifié');

  return jsonb_build_object(
    'ride_id', p_ride_id,
    'reordered_count', n_provided,
    'new_distance_km', p_new_total_km,
    'new_duration_min', p_new_total_min,
    'new_total_fcfa', q.new_total,
    'driver_share_fcfa', q.driver_cash
  );
end;
$fn_ro$;

comment on function public.reorder_ride_stops is
  'v3 : réordonne les arrêts encore modifiables ; distance, durée ET prix sont recalculés ; chauffeur notifié.';

-- ------------------------------------------------------------
-- 8. swap_stop_and_dropoff : un arrêt devient la destination finale
-- ------------------------------------------------------------
create or replace function public.swap_stop_and_dropoff(
  p_stop_id uuid,
  p_new_total_km numeric,
  p_new_total_min int
)
returns jsonb
language plpgsql security definer set search_path = public as $fn_sw$
declare
  s public.ride_stops;
  r public.rides;
  q record;
  old_dropoff_address text;
  old_dropoff_lat double precision;
  old_dropoff_lng double precision;
  new_stop_order int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into s from public.ride_stops where id = p_stop_id;
  if s.id is null then raise exception 'Stop not found'; end if;

  select * into r from public.rides where id = s.ride_id for update;
  if r.id is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;

  if s.status not in ('pending', 'accepted') then
    raise exception 'Cet arrêt ne peut plus être promu en destination.';
  end if;
  if r.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Cette course ne permet plus de modifier l''itinéraire.';
  end if;

  old_dropoff_address := r.dropoff_address;
  old_dropoff_lat := st_y(r.dropoff_location::geometry);
  old_dropoff_lng := st_x(r.dropoff_location::geometry);

  select * into q from public._ride_reprice(r.id, p_new_total_km, p_new_total_min, s.lat, s.lng);

  update public.ride_stops set order_idx = -order_idx where id = p_stop_id;

  select coalesce(max(order_idx), 0) + 1
    into new_stop_order
    from public.ride_stops
   where ride_id = r.id and status <> 'cancelled' and id <> p_stop_id;

  update public.rides
     set dropoff_address = s.address,
         dropoff_location = st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography,
         distance_km = p_new_total_km,
         duration_min = p_new_total_min,
         price_total_fcfa = q.new_total,
         driver_share_fcfa = q.driver_cash,
         driver_rachat_fcfa = q.rachat,
         dealer_share_fcfa = q.dealer,
         platform_share_fcfa = q.platform,
         stops_extra_price_fcfa = stops_extra_price_fcfa + q.delta,
         updated_at = now()
   where id = r.id;

  update public.ride_stops
     set address = old_dropoff_address,
         lat = old_dropoff_lat,
         lng = old_dropoff_lng,
         order_idx = new_stop_order,
         status = 'accepted',
         accepted_at = coalesce(accepted_at, now())
   where id = p_stop_id;

  perform public._notify_driver_route_change(r.id, 'Nouvelle destination : ' || left(s.address, 60));

  return jsonb_build_object(
    'new_dropoff_address', s.address,
    'former_dropoff_address', old_dropoff_address,
    'stop_id_repurposed', p_stop_id,
    'new_total_fcfa', q.new_total,
    'extra_price_fcfa', q.delta,
    'driver_share_fcfa', q.driver_cash
  );
end;
$fn_sw$;

grant execute on function public.add_ride_stop(uuid, text, double precision, double precision, numeric, int, text) to authenticated;
grant execute on function public.remove_ride_stop(uuid, numeric, int) to authenticated;
grant execute on function public.reorder_ride_stops(uuid, uuid[], numeric, int) to authenticated;
grant execute on function public.swap_stop_and_dropoff(uuid, numeric, int) to authenticated;
