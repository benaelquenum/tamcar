-- ============================================================
-- Réservation en avance avec ENGAGEMENT IMMÉDIAT du chauffeur.
-- Décision Terence 2026-07-28.
--
-- Modèle :
--  1. Le client réserve (départ+destination+heure) → course 'scheduled',
--     driver_id null. Offerte tout de suite aux chauffeurs éligibles.
--  2. Un chauffeur l'ACCEPTE → driver_id set, statut reste 'scheduled'
--     (= « réservation confirmée » côté client). Zone = où sont les
--     chauffeurs MAINTENANT (proximité à la réservation).
--  3. À H-15 min : si un chauffeur est engagé ET actif → 'matched' (il
--     part vers le client) ; sinon → 'requested' (pool normal = FILET).
--  4. Rappel push au chauffeur engagé à H-30.
--  5. Le chauffeur peut se désister → re-pool. Le client annule
--     gratuitement tant que 'scheduled' (RPC existant cancel_scheduled_ride).
-- ============================================================

alter table public.rides
  add column if not exists booking_reminder_sent_at timestamptz;

-- ------------------------------------------------------------
-- 1. Chauffeur : liste des réservations à venir qu'il peut accepter
-- ------------------------------------------------------------
create or replace function public.pending_scheduled_rides_for_driver(
  radius_km double precision default 12.0
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
  scheduled_at timestamptz,
  requested_category vehicle_category
)
language plpgsql stable security invoker as $$
declare
  v_drv_id uuid;
  v_drv_loc geography;
  v_drv_category vehicle_category;
begin
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

  return query
  select
    r.id, r.pickup_address, r.dropoff_address,
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    st_distance(r.pickup_location, v_drv_loc),
    r.distance_km, r.duration_min, r.price_total_fcfa, r.driver_share_fcfa,
    r.scheduled_at, r.requested_category
  from public.rides r
  where r.status = 'scheduled'
    and r.driver_id is null
    and r.scheduled_at > now()
    and st_dwithin(r.pickup_location, v_drv_loc, radius_km * 1000)
    and (
      v_drv_category = r.requested_category
      or (v_drv_category = 'confort' and r.requested_category = 'essentiel')
    )
  order by r.scheduled_at asc
  limit 20;
end;
$$;
grant execute on function public.pending_scheduled_rides_for_driver(double precision) to authenticated;

-- ------------------------------------------------------------
-- 2. Chauffeur : accepter (s'engager sur) une réservation
--    FOR UPDATE + double garde → pas de double attribution (course).
-- ------------------------------------------------------------
create or replace function public.accept_scheduled_ride(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  v_drv_id uuid;
  v_drv_category vehicle_category;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select d.id, v.category into v_drv_id, v_drv_category
  from public.drivers d
  left join public.vehicles v on v.id = d.current_vehicle_id
  where d.profile_id = auth.uid() and d.status = 'active'
  limit 1;
  if v_drv_id is null then raise exception 'Chauffeur non actif'; end if;
  if v_drv_category is null then raise exception 'Aucun véhicule courant'; end if;

  select * into r from public.rides where id = p_ride_id for update;
  if r is null then raise exception 'Réservation introuvable'; end if;
  if r.status <> 'scheduled' then raise exception 'Réservation non disponible'; end if;
  if r.driver_id is not null then raise exception 'Déjà prise par un autre chauffeur'; end if;
  if not (v_drv_category = r.requested_category
          or (v_drv_category = 'confort' and r.requested_category = 'essentiel')) then
    raise exception 'Catégorie de véhicule incompatible';
  end if;

  update public.rides
    set driver_id = v_drv_id, updated_at = now()
    where id = p_ride_id and status = 'scheduled' and driver_id is null
    returning * into result;
  if result.id is null then raise exception 'Déjà prise'; end if;

  perform public._push_notify(
    result.client_id,
    'Réservation confirmée',
    'Un chauffeur est engagé pour votre course programmée.',
    '/ride/' || result.id::text,
    'booking-accepted:' || result.id::text,
    false
  );
  return result;
end;
$$;
grant execute on function public.accept_scheduled_ride(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. Chauffeur : se désister d'une réservation (re-pool, FILET)
-- ------------------------------------------------------------
create or replace function public.cancel_scheduled_by_driver(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  v_drv_id uuid;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_drv_id from public.drivers where profile_id = auth.uid() limit 1;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Réservation introuvable'; end if;
  if r.status <> 'scheduled' or r.driver_id is distinct from v_drv_id then
    raise exception 'Pas votre réservation';
  end if;

  update public.rides
    set driver_id = null, booking_reminder_sent_at = null, updated_at = now()
    where id = p_ride_id
    returning * into result;

  perform public._notify_matching_drivers(p_ride_id);
  perform public._push_notify(
    result.client_id,
    'Chauffeur indisponible',
    'Votre chauffeur s''est désisté — on réengage un autre chauffeur.',
    '/ride/' || result.id::text,
    'booking-released:' || result.id::text,
    true
  );
  return result;
end;
$$;
grant execute on function public.cancel_scheduled_by_driver(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Chauffeur : mes réservations acceptées (à venir)
-- ------------------------------------------------------------
create or replace function public.my_accepted_scheduled_rides()
returns table (
  id uuid,
  pickup_address text,
  dropoff_address text,
  scheduled_at timestamptz,
  price_total_fcfa int,
  requested_category vehicle_category,
  client_first_name text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.pickup_address, r.dropoff_address, r.scheduled_at,
         r.price_total_fcfa, r.requested_category,
         split_part(coalesce(cp.full_name, 'Client'), ' ', 1)
  from public.rides r
  join public.drivers d on d.id = r.driver_id
  left join public.profiles cp on cp.id = r.client_id
  where d.profile_id = auth.uid()
    and r.status = 'scheduled'
    and r.scheduled_at > now()
  order by r.scheduled_at asc;
$$;
grant execute on function public.my_accepted_scheduled_rides to authenticated;

-- ------------------------------------------------------------
-- 5. Client : mes réservations v2 — inclut le chauffeur engagé
-- ------------------------------------------------------------
create or replace function public.my_scheduled_rides()
returns table (
  id uuid,
  pickup_address text,
  dropoff_address text,
  scheduled_at timestamptz,
  price_total_fcfa int,
  requested_category vehicle_category,
  driver_full_name text,
  driver_confirmed boolean
)
language sql stable security invoker as $$
  select
    r.id, r.pickup_address, r.dropoff_address,
    r.scheduled_at, r.price_total_fcfa, r.requested_category,
    dp.full_name as driver_full_name,
    (r.driver_id is not null) as driver_confirmed
  from public.rides r
  left join public.drivers d on d.id = r.driver_id
  left join public.profiles dp on dp.id = d.profile_id
  where r.client_id = auth.uid()
    and r.status = 'scheduled'
    and r.scheduled_at > now()
  order by r.scheduled_at asc;
$$;
grant execute on function public.my_scheduled_rides to authenticated;

-- ------------------------------------------------------------
-- 6. Rappel H-30 aux chauffeurs engagés (idempotent via flag)
-- ------------------------------------------------------------
create or replace function public._remind_upcoming_bookings()
returns void
language plpgsql security definer set search_path = public as $$
declare rec record;
begin
  for rec in
    select r.id, d.profile_id
    from public.rides r
    join public.drivers d on d.id = r.driver_id
    where r.status = 'scheduled'
      and r.driver_id is not null
      and r.booking_reminder_sent_at is null
      and r.scheduled_at > now()
      and r.scheduled_at <= now() + interval '30 minutes'
  loop
    perform public._push_notify(
      rec.profile_id,
      'Course programmée bientôt',
      'Ta réservation approche — prépare-toi à partir vers le client.',
      '/ride/' || rec.id::text,
      'booking-reminder:' || rec.id::text,
      true
    );
    update public.rides set booking_reminder_sent_at = now() where id = rec.id;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 7. Release v2 : engagée→matched, sinon→requested (filet) + rappel
-- ------------------------------------------------------------
create or replace function public._release_due_scheduled_rides()
returns int
language plpgsql security definer set search_path = public as $$
declare v_a int; v_b int;
begin
  perform public._remind_upcoming_bookings();

  -- Engagée avec chauffeur actif → matched (il part vers le client)
  update public.rides r
    set status = 'matched', matched_at = now(), requested_at = now(), updated_at = now()
    where r.status = 'scheduled'
      and r.scheduled_at <= now() + interval '15 minutes'
      and r.driver_id is not null
      and exists (select 1 from public.drivers d where d.id = r.driver_id and d.status = 'active');
  get diagnostics v_a = row_count;

  -- Non engagée OU chauffeur devenu inactif → pool (filet)
  update public.rides r
    set status = 'requested', driver_id = null, requested_at = now(), updated_at = now()
    where r.status = 'scheduled'
      and r.scheduled_at <= now() + interval '15 minutes'
      and (r.driver_id is null
           or not exists (select 1 from public.drivers d where d.id = r.driver_id and d.status = 'active'));
  get diagnostics v_b = row_count;

  return v_a + v_b;
end;
$$;

-- ------------------------------------------------------------
-- 8. Trigger v2 : notifie le chauffeur engagé quand scheduled→matched
-- ------------------------------------------------------------
create or replace function public._on_ride_released_from_schedule()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'scheduled' and new.status = 'requested' then
    perform public._notify_matching_drivers(new.id);
  elsif old.status = 'scheduled' and new.status = 'matched' and new.driver_id is not null then
    perform public._push_notify(
      (select profile_id from public.drivers where id = new.driver_id),
      'Départ maintenant',
      'Ta course programmée démarre — va chercher le client.',
      '/ride/' || new.id::text,
      'booking-start:' || new.id::text,
      true
    );
  end if;
  return new;
end;
$$;
