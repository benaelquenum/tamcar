-- ============================================================
-- TamCar — Course directe à un chauffeur : un VRAI parcours de course
-- (2026-10-01)
--
-- Avant : « Mes chauffeurs » créait une demande à part (driver_requests,
-- fenêtre de 10 min) hors du circuit des courses : le client restait sur la
-- liste, la course n'existait pas avant l'acceptation, et rien ne permettait
-- de relancer ou de basculer vers une commande ordinaire.
--
-- Maintenant : la course directe est une course ORDINAIRE (create_ride) qui
-- porte un chauffeur visé.
--   • rides.requested_driver_id : seul ce chauffeur la voit et peut
--     l'accepter (carte « Demandes directes » de son accueil) ;
--   • le client est tout de suite sur la page de recherche (/ride/<id>) ;
--   • sans réponse après 2 minutes, le client RELANCE la demande
--     (client_relaunch_search) ou bascule en COMMANDE ORDINAIRE
--     (client_release_direct : la course s'ouvre à tous les chauffeurs de
--     la catégorie) ;
--   • accepté : la course suit son cours normal (matched → arrived →
--     in_progress → completed), paiement, commission, notation.
--
-- Au passage :
--   • create_ride accepte une liste d'arrêts (p_stops) dès la commande ;
--   • une course sans chauffeur expire côté serveur au bout de 10 min
--     (avant : elle restait « requested » à jamais, visible des chauffeurs) ;
--   • un code promo n'est plus consommé par une course annulée ou expirée ;
--   • la relance d'une recherche prévient de nouveau les chauffeurs
--     (avant : un simple UPDATE de requested_at, sans notification).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colonnes
-- ------------------------------------------------------------
alter table public.rides
  add column if not exists requested_driver_id uuid references public.drivers(id) on delete set null,
  add column if not exists direct_declined_at timestamptz;

create index if not exists rides_requested_driver_idx
  on public.rides (requested_driver_id)
  where requested_driver_id is not null and status = 'requested';

-- ------------------------------------------------------------
-- 2. create_ride : chauffeur visé + arrêts dès la commande
--    (security definer : l'insertion des arrêts et des colonnes réservées
--     ne passe plus par les droits du client — voir 20261001220000)
-- ------------------------------------------------------------
drop function if exists public.create_ride(
  vehicle_category, double precision, double precision, text,
  double precision, double precision, text, numeric, int,
  boolean, boolean, timestamptz, payment_method, text, text, text
);

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
  p_payment_method payment_method default 'cash',
  p_promo_code text default null,
  p_passenger_name text default null,
  p_passenger_phone text default null,
  p_target_driver_id uuid default null,
  p_stops jsonb default null
)
returns public.rides
language plpgsql security definer set search_path = public as $fnr$
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
  v_target_profile uuid;
  v_target_cat vehicle_category;
  v_balance int;
  v_engaged int;
  v_n_stops int := 0;
  v_stop jsonb;
  v_idx int;
  v_s_lat double precision;
  v_s_lng double precision;
  v_s_addr text;
  c_max_stops constant int := 3;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

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
    -- 28 min côté serveur pour 30 min affichées : marge de saisie.
    if p_scheduled_at < now() + interval '28 minutes' then
      raise exception 'Réservation à 30 min minimum. Pour partir plus tôt, commandez une course immédiate.';
    end if;
    if p_scheduled_at > now() + interval '30 days' then
      raise exception 'Réservation max 30 jours à l''avance';
    end if;
    v_status := 'scheduled';
  else
    v_status := 'requested';
  end if;

  -- Course directe : un chauffeur que le client a déjà eu, dans SA catégorie.
  if p_target_driver_id is not null then
    if p_scheduled_at is not null then
      raise exception 'Une course directe ne peut pas être programmée.';
    end if;
    select d.profile_id, v.category into v_target_profile, v_target_cat
      from public.drivers d
      join public.vehicles v on v.id = d.current_vehicle_id
     where d.id = p_target_driver_id and d.status = 'active';
    if v_target_profile is null then
      raise exception 'Ce chauffeur n''est pas disponible actuellement.';
    end if;
    if v_target_profile = auth.uid() then
      raise exception 'Vous ne pouvez pas vous commander à vous-même.';
    end if;
    if v_target_cat <> p_category then
      raise exception 'Ce chauffeur conduit un véhicule de catégorie %.', v_target_cat;
    end if;
    if not exists (
      select 1 from public.rides
       where client_id = auth.uid() and driver_id = p_target_driver_id and status = 'completed'
    ) then
      raise exception 'Vous n''avez encore jamais roulé avec ce chauffeur.';
    end if;
  end if;

  -- Arrêts : jusqu'à 3, tous dans la zone de service.
  if p_stops is not null and jsonb_typeof(p_stops) = 'array' then
    v_n_stops := jsonb_array_length(p_stops);
    if v_n_stops > c_max_stops then
      raise exception 'Maximum % arrêts par course.', c_max_stops;
    end if;
    for v_idx in 0 .. v_n_stops - 1 loop
      v_stop := p_stops -> v_idx;
      v_s_addr := nullif(trim(coalesce(v_stop ->> 'address', '')), '');
      v_s_lat := (v_stop ->> 'lat')::double precision;
      v_s_lng := (v_stop ->> 'lng')::double precision;
      if v_s_addr is null or v_s_lat is null or v_s_lng is null then
        raise exception 'Arrêt % incomplet.', v_idx + 1;
      end if;
      if not public._is_within_service_zone(v_s_lat, v_s_lng) then
        raise exception 'L''arrêt % est hors zone de service.', v_idx + 1;
      end if;
    end loop;
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

  -- Une seule recherche de chauffeur à la fois par compte (évite d'inonder
  -- les chauffeurs d'alertes avec des demandes en double).
  if v_status = 'requested' and exists (
    select 1 from public.rides where client_id = auth.uid() and status = 'requested'
  ) then
    raise exception 'Une recherche de chauffeur est déjà en cours pour votre compte. Annulez-la avant d''en lancer une autre.';
  end if;

  -- Paiement TamCar Crédit : le solde doit couvrir cette course ET celles déjà
  -- engagées en crédit (le portefeuille n'est débité qu'à la fin de course ;
  -- avant, seul l'écran grisait l'option — le serveur ne vérifiait rien).
  if p_payment_method = 'tamcar_credit' then
    select coalesce(balance_fcfa, 0) into v_balance
      from public.wallets where profile_id = auth.uid() and kind = 'tamcar_credit';
    select coalesce(sum(price_total_fcfa), 0) into v_engaged
      from public.rides
     where client_id = auth.uid() and payment_method = 'tamcar_credit'
       and status in ('requested', 'scheduled', 'matched', 'arrived', 'in_progress');
    if coalesce(v_balance, 0) - v_engaged < v_final_price then
      raise exception 'Solde TamCar Crédit insuffisant pour cette course.';
    end if;
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
    passenger_name, passenger_phone,
    requested_driver_id, stops_count
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
    v_passenger_name, v_passenger_phone,
    p_target_driver_id, v_n_stops
  ) returning * into new_ride;

  -- Les arrêts sont déjà dans la distance et la durée totales passées par
  -- le client (itinéraire calculé avec les étapes) : ils n'ajoutent rien au
  -- prix. Le chauffeur les voit dès l'acceptation.
  for v_idx in 0 .. v_n_stops - 1 loop
    v_stop := p_stops -> v_idx;
    insert into public.ride_stops (
      ride_id, order_idx, address, lat, lng, status, accepted_at,
      extra_km_added, extra_price_fcfa
    ) values (
      new_ride.id, v_idx + 1,
      trim(v_stop ->> 'address'),
      (v_stop ->> 'lat')::double precision,
      (v_stop ->> 'lng')::double precision,
      'accepted', now(), 0, 0
    );
  end loop;

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
  boolean, boolean, timestamptz, payment_method, text, text, text,
  uuid, jsonb
) to authenticated;

-- ------------------------------------------------------------
-- 3. Alertes : un chauffeur visé reçoit SA demande, personne d'autre
-- ------------------------------------------------------------
create or replace function public._notify_direct_driver(p_ride_id uuid, p_relaunch boolean default false)
returns void
language plpgsql security definer set search_path = public as $fn_ndd$
declare
  r public.rides;
  v_profile uuid;
  v_client text;
begin
  select * into r from public.rides where id = p_ride_id;
  if r is null or r.status <> 'requested' or r.driver_id is not null or r.requested_driver_id is null then
    return;
  end if;
  select d.profile_id into v_profile from public.drivers d where d.id = r.requested_driver_id;
  if v_profile is null then return; end if;
  select split_part(coalesce(full_name, 'Un client'), ' ', 1) into v_client
    from public.profiles where id = r.client_id;

  perform public._push_notify(
    v_profile,
    case when p_relaunch then '🙋 Relance : course directe' else '🙋 Course directe pour vous' end,
    coalesce(v_client, 'Un client') || ' vous demande : ' ||
      left(r.pickup_address, 40) || ' → ' || left(r.dropoff_address, 40) ||
      ' · ' || r.price_total_fcfa::text || ' F. Répondez vite.',
    '/',
    'direct:' || r.id::text,
    true
  );
end;
$fn_ndd$;

revoke all on function public._notify_direct_driver(uuid, boolean) from public, anon, authenticated;

create or replace function public._notify_matching_drivers(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn_nmd$
declare
  r public.rides;
  drv record;
  is_below boolean;
  category_label text;
begin
  select * into r from public.rides where id = p_ride_id;
  if r is null or r.status <> 'requested' then return; end if;
  -- Course directe : jamais en alerte générale.
  if r.requested_driver_id is not null then return; end if;

  category_label := case r.requested_category
    when 'moto'      then 'Moto'
    when 'tricycle'  then 'Tricycle'
    when 'essentiel' then 'Essentiel'
    when 'confort'   then 'Confort'
    when 'premium'   then 'VIP'
    else initcap(r.requested_category::text)
  end;

  for drv in
    select d.profile_id, v.category as drv_cat
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.is_online = true
      and d.status = 'active'
      and (
        v.category = r.requested_category
        or (v.category = 'confort' and r.requested_category = 'essentiel')
        or (v.category = 'premium' and r.requested_category in ('confort', 'essentiel'))
      )
      -- Position inconnue = notifié quand même (il jugera lui-même)
      and (d.current_location is null
           or st_dwithin(d.current_location, r.pickup_location, 10000))
  loop
    is_below := (
      (drv.drv_cat = 'confort' and r.requested_category = 'essentiel')
      or (drv.drv_cat = 'premium' and r.requested_category in ('confort', 'essentiel'))
    );
    perform public._push_notify(
      drv.profile_id,
      case when is_below
        then '🚗 Course ' || category_label || ' — tarif réduit'
        else '🚗 Nouvelle course ' || category_label
      end,
      case when is_below
        then 'Un client attend un ' || category_label || ' près de vous. Tarif au client, à vous de voir.'
        else 'Un client attend près de vous. Ouvrez TamCar pour accepter.'
      end,
      '/',
      'new-ride:' || p_ride_id::text,
      true
    );
  end loop;
end;
$fn_nmd$;

create or replace function public._on_ride_created()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'requested' and new.driver_id is null then
    if new.requested_driver_id is not null then
      perform public._notify_direct_driver(new.id);
    else
      perform public._notify_matching_drivers(new.id);
    end if;
  elsif new.status = 'scheduled' and new.driver_id is null then
    perform public._notify_scheduled_booking(new.id);
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4. Pool des chauffeurs : une course directe n'y figure jamais
-- ------------------------------------------------------------
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
language plpgsql security invoker as $fn_pending$
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
    (
      (v_drv_category = 'confort' and r.requested_category = 'essentiel')
      or (v_drv_category = 'premium' and r.requested_category in ('confort', 'essentiel'))
    ) as is_below_driver_category
  from public.rides r
  where r.status = 'requested'
    and r.driver_id is null
    and r.requested_driver_id is null
    and st_dwithin(r.pickup_location, v_search_origin, v_effective_radius * 1000)
    and (
      v_drv_category = r.requested_category
      or (v_drv_category = 'confort' and r.requested_category = 'essentiel')
      or (v_drv_category = 'premium' and r.requested_category in ('confort', 'essentiel'))
    )
  order by st_distance(r.pickup_location, v_search_origin) asc
  limit 20;
end;
$fn_pending$;

-- ------------------------------------------------------------
-- 5. accept_ride : une course directe n'est acceptable que par son chauffeur
-- ------------------------------------------------------------
create or replace function public.accept_ride(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  driver_row public.drivers;
  dealer_id uuid;
  result public.rides;
  total int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer_share int;
  new_platform int;
  v_pickup geography;
  v_dist_m int;
  v_target uuid;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into driver_row
  from public.drivers where profile_id = auth.uid();

  if driver_row is null then raise exception 'Not a driver'; end if;
  if driver_row.status <> 'active' or not driver_row.is_online then
    raise exception 'Driver not active or offline';
  end if;
  if driver_row.current_vehicle_id is null then
    raise exception 'No vehicle assigned';
  end if;

  if exists (
    select 1 from public.rides
    where driver_id = driver_row.id
      and status in ('matched', 'arrived', 'in_progress')
  ) then
    raise exception 'Course active déjà en cours — termine-la avant.';
  end if;

  select dealer_partner_id into dealer_id
   from public.vehicles where id = driver_row.current_vehicle_id;

  select price_total_fcfa, pickup_location, requested_driver_id
    into total, v_pickup, v_target
   from public.rides where id = ride_id;

  if total is null then raise exception 'Ride introuvable'; end if;

  -- Course directe : réservée au chauffeur visé tant qu'elle est directe.
  if v_target is not null and v_target <> driver_row.id then
    raise exception 'Cette course est réservée à un autre chauffeur.';
  end if;

  v_dist_m := coalesce(
    st_distance(driver_row.current_location, v_pickup)::int,
    0
  );

  if driver_row.application_type = 'proprietaire' then
    new_driver_cash := floor(total * 0.80)::int;
    new_driver_rachat := 0;
    new_dealer_share := 0;
    new_platform := total - new_driver_cash;
  else
    new_driver_cash := floor(total * 0.40)::int;
    new_driver_rachat := floor(total * 0.10)::int;
    new_dealer_share := floor(total * 0.30)::int;
    new_platform := total - new_driver_cash - new_driver_rachat - new_dealer_share;
  end if;

  update public.rides
  set driver_id = driver_row.id,
      vehicle_id = driver_row.current_vehicle_id,
      dealer_partner_id = case
        when driver_row.application_type = 'proprietaire' then null
        else dealer_id
      end,
      driver_share_fcfa = new_driver_cash,
      driver_rachat_fcfa = new_driver_rachat,
      dealer_share_fcfa = new_dealer_share,
      platform_share_fcfa = new_platform,
      driver_location_at_match = driver_row.current_location,
      driver_distance_at_match_m = v_dist_m,
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
-- 6. Côté chauffeur : « Demandes directes » (mêmes noms de RPC qu'avant,
--    le portail chauffeur n'a pas à changer)
-- ------------------------------------------------------------
create or replace function public.driver_oneshot_requests()
returns table (
  request_id uuid,
  client_first_name text,
  pickup_address text,
  dropoff_address text,
  category vehicle_category,
  distance_km numeric,
  duration_min int,
  price_total_fcfa int,
  expires_at timestamptz
)
language sql stable security definer set search_path = public as $fn_drvreq$
  select r.id,
         split_part(coalesce(case when r.passenger_name is not null then r.passenger_name else pr.full_name end, 'Client'), ' ', 1),
         r.pickup_address, r.dropoff_address, r.requested_category,
         r.distance_km, r.duration_min, r.price_total_fcfa,
         r.requested_at + interval '10 minutes'
    from public.rides r
    join public.drivers d on d.id = r.requested_driver_id
    join public.profiles pr on pr.id = r.client_id
   where d.profile_id = auth.uid()
     and r.status = 'requested'
     and r.driver_id is null
     and r.direct_declined_at is null
     and r.requested_at > now() - interval '10 minutes'
   order by r.requested_at;
$fn_drvreq$;

grant execute on function public.driver_oneshot_requests() to authenticated;

drop function if exists public.respond_driver_oneshot(uuid, boolean);

create or replace function public.respond_driver_oneshot(
  p_request_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql security definer set search_path = public as $fn_resp$
declare
  v_ride public.rides;
  v_drv public.drivers;
  v_name text;
begin
  select d.* into v_drv from public.drivers d where d.profile_id = auth.uid();
  if v_drv.id is null then raise exception 'Not a driver'; end if;

  select r.* into v_ride
    from public.rides r
   where r.id = p_request_id and r.requested_driver_id = v_drv.id
   for update;
  if not found then raise exception 'Demande introuvable'; end if;
  if v_ride.status <> 'requested' or v_ride.driver_id is not null then
    raise exception 'Demande expirée ou déjà traitée';
  end if;

  if p_accept then
    perform public.accept_ride(v_ride.id);
    return jsonb_build_object('ride_id', v_ride.id, 'status', 'matched');
  end if;

  update public.rides
     set direct_declined_at = now(), updated_at = now()
   where id = v_ride.id;

  select split_part(coalesce(full_name, 'Votre chauffeur'), ' ', 1) into v_name
    from public.profiles where id = v_drv.profile_id;
  perform public._push_notify(
    v_ride.client_id, 'Chauffeur indisponible',
    coalesce(v_name, 'Le chauffeur') || ' ne peut pas assurer cette course. Relancez ou commandez une course ordinaire.',
    '/ride/' || v_ride.id::text, 'direct-declined:' || v_ride.id::text, true
  );
  return jsonb_build_object('ride_id', v_ride.id, 'status', 'declined');
end;
$fn_resp$;

grant execute on function public.respond_driver_oneshot(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 7. Côté client : relancer, ou basculer en commande ordinaire
-- ------------------------------------------------------------
create or replace function public.client_relaunch_search(p_ride_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $fn_rel$
declare
  r public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id for update;
  if r.id is null or r.client_id <> auth.uid() then raise exception 'Course introuvable'; end if;
  if r.status <> 'requested' or r.driver_id is not null then
    raise exception 'Cette recherche n''est plus en cours.';
  end if;

  update public.rides
     set requested_at = now(),
         direct_declined_at = null,
         updated_at = now()
   where id = r.id;

  if r.requested_driver_id is not null then
    perform public._notify_direct_driver(r.id, true);
    return jsonb_build_object('mode', 'direct');
  end if;

  perform public._notify_matching_drivers(r.id);
  return jsonb_build_object('mode', 'ordinary');
end;
$fn_rel$;

grant execute on function public.client_relaunch_search(uuid) to authenticated;

create or replace function public.client_release_direct(p_ride_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $fn_rd$
declare
  r public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id for update;
  if r.id is null or r.client_id <> auth.uid() then raise exception 'Course introuvable'; end if;
  if r.status <> 'requested' or r.driver_id is not null then
    raise exception 'Cette recherche n''est plus en cours.';
  end if;
  if r.requested_driver_id is null then
    raise exception 'Cette course est déjà ouverte à tous les chauffeurs.';
  end if;

  update public.rides
     set requested_driver_id = null,
         direct_declined_at = null,
         requested_at = now(),
         updated_at = now()
   where id = r.id;

  perform public._notify_matching_drivers(r.id);
  return jsonb_build_object('mode', 'ordinary');
end;
$fn_rd$;

grant execute on function public.client_release_direct(uuid) to authenticated;

-- ------------------------------------------------------------
-- 8. Détails de course : chauffeur visé, refus, arrêts
--    (drop obligatoire : le type de retour change)
-- ------------------------------------------------------------
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
  passenger_phone text,
  requested_driver_id uuid,
  requested_driver_name text,
  direct_declined_at timestamptz,
  stops_count int
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
    r.passenger_phone,
    r.requested_driver_id,
    rp.full_name as requested_driver_name,
    r.direct_declined_at,
    r.stops_count
  from public.rides r
  left join public.drivers d on d.id = r.driver_id
  left join public.profiles p on p.id = d.profile_id
  left join public.vehicles v on v.id = r.vehicle_id
  left join public.drivers rd on rd.id = r.requested_driver_id
  left join public.profiles rp on rp.id = rd.profile_id
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

-- ------------------------------------------------------------
-- 9. Une course sans chauffeur expire côté serveur (10 min)
-- ------------------------------------------------------------
create or replace function public._expire_stale_requests()
returns int
language plpgsql security definer set search_path = public as $fn_exp$
declare
  r record;
  n int := 0;
begin
  for r in
    update public.rides
       set status = 'expired',
           cancel_reason = 'no_driver_found',
           ended_at = now(),
           updated_at = now()
     where status = 'requested'
       and driver_id is null
       and requested_at < now() - interval '10 minutes'
    returning id, client_id, requested_driver_id
  loop
    n := n + 1;
    perform public._push_notify(
      r.client_id,
      'Aucun chauffeur disponible',
      case when r.requested_driver_id is not null
        then 'Votre chauffeur n''a pas répondu. Vous pouvez commander une course ordinaire.'
        else 'Aucun chauffeur n''a pris votre course. Réessayez dans quelques minutes.'
      end,
      '/', 'ride-expired:' || r.id::text, false
    );
  end loop;
  return n;
end;
$fn_exp$;

revoke all on function public._expire_stale_requests() from public, anon, authenticated;

select cron.schedule(
  'expire-stale-requests',
  '* * * * *',
  $$select public._expire_stale_requests()$$
);

-- ------------------------------------------------------------
-- 10. Un code promo n'est consommé que par une course menée à son terme
-- ------------------------------------------------------------
create or replace function public._release_promo_on_ride_end()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('cancelled_by_client', 'cancelled_by_driver', 'cancelled_by_admin', 'expired')
     and old.status is distinct from new.status then
    delete from public.promo_code_redemptions where ride_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public._release_promo_on_ride_end() from public, anon, authenticated;

drop trigger if exists trg_release_promo_on_ride_end on public.rides;
create trigger trg_release_promo_on_ride_end
  after update of status on public.rides
  for each row
  execute function public._release_promo_on_ride_end();

-- Rattrapage : les courses déjà annulées / expirées libèrent leur code.
delete from public.promo_code_redemptions pr
 using public.rides r
 where r.id = pr.ride_id
   and r.status in ('cancelled_by_client', 'cancelled_by_driver', 'cancelled_by_admin', 'expired');

-- Rattrapage : les courses « requested » abandonnées avant ce correctif.
select public._expire_stale_requests();
