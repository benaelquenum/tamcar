-- ============================================================
-- Course one-shot : recontacter un chauffeur déjà eu.
--
-- Flux :
--   1. Le client voit ses chauffeurs récents (my_recent_drivers), triés
--      par affinité (nb de courses ensemble, puis récence).
--   2. Il choisit un chauffeur + un trajet → request_driver_oneshot :
--      crée une demande 'pending' (fenêtre 10 min) + push au chauffeur.
--   3. Le chauffeur voit ses demandes (driver_oneshot_requests) et répond
--      (respond_driver_oneshot) : accepte → une course 'matched' est créée
--      directement avec lui ; refuse → le client est notifié.
--   4. Le client suit l'état (my_pending_oneshot) — auto-refresh côté UI.
--
-- Anti-contournement : la demande débouche TOUJOURS sur une course in-app
-- (prix, traçabilité, commission). Aucun numéro n'est divulgué.
-- ============================================================

create table if not exists public.driver_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  category vehicle_category not null,

  pickup_location geography(point, 4326) not null,
  pickup_address text not null,
  dropoff_location geography(point, 4326) not null,
  dropoff_address text not null,
  distance_km numeric(6,2),
  duration_min int,
  price_total_fcfa int,

  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  ride_id uuid references public.rides(id) on delete set null,

  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists driver_requests_driver_idx
  on public.driver_requests (driver_id, status);
create index if not exists driver_requests_client_idx
  on public.driver_requests (client_id, status);

alter table public.driver_requests enable row level security;
-- Aucune policy : tout passe par les RPC security definer ci-dessous.

-- ------------------------------------------------------------
-- 1. Chauffeurs récents du client (affinité)
-- ------------------------------------------------------------
create or replace function public.my_recent_drivers(p_limit int default 20)
returns table (
  driver_id uuid,
  driver_name text,
  driver_rating numeric,
  vehicle_category vehicle_category,
  vehicle_label text,
  is_online boolean,
  rides_count int,
  last_ride_at timestamptz
)
language sql stable security definer set search_path = public as $fn_recent$
  select
    d.id,
    pr.full_name,
    d.rating_avg,
    v.category,
    case when v.id is not null
         then v.brand || ' ' || v.model || ' · ' || v.plate_number
         else null end,
    d.is_online,
    count(r.id)::int,
    max(r.ended_at)
  from public.rides r
  join public.drivers d on d.id = r.driver_id
  join public.profiles pr on pr.id = d.profile_id
  left join public.vehicles v on v.id = d.current_vehicle_id
  where r.client_id = auth.uid()
    and r.status = 'completed'
    and d.status = 'active'
  group by d.id, pr.full_name, d.rating_avg, v.id, v.category,
           v.brand, v.model, v.plate_number, d.is_online
  order by count(r.id) desc, max(r.ended_at) desc
  limit p_limit;
$fn_recent$;

grant execute on function public.my_recent_drivers to authenticated;

-- ------------------------------------------------------------
-- 2. Demande de disponibilité (client → chauffeur)
-- ------------------------------------------------------------
create or replace function public.request_driver_oneshot(
  p_driver_id uuid,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_pickup_address text,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_dropoff_address text,
  p_distance_km numeric,
  p_duration_min int
)
returns public.driver_requests
language plpgsql security definer set search_path = public as $fn_req$
declare
  v_cat vehicle_category;
  v_quote record;
  v_req public.driver_requests;
  v_client_name text;
  v_drv_profile uuid;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select v.category, d.profile_id into v_cat, v_drv_profile
  from public.drivers d
  join public.vehicles v on v.id = d.current_vehicle_id
  where d.id = p_driver_id and d.status = 'active';
  if v_cat is null then
    raise exception 'Ce chauffeur n''est pas disponible actuellement';
  end if;

  if exists (
    select 1 from public.driver_requests
    where client_id = auth.uid() and driver_id = p_driver_id
      and status = 'pending' and expires_at > now()
  ) then
    raise exception 'Vous avez déjà une demande en cours avec ce chauffeur';
  end if;

  select * into v_quote from public.compute_price(
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
    p_distance_km, p_duration_min, v_cat, false, false
  ) limit 1;

  insert into public.driver_requests (
    client_id, driver_id, category,
    pickup_location, pickup_address, dropoff_location, dropoff_address,
    distance_km, duration_min, price_total_fcfa, expires_at
  ) values (
    auth.uid(), p_driver_id, v_cat,
    st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    p_pickup_address,
    st_setsrid(st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_dropoff_address,
    p_distance_km, p_duration_min,
    coalesce(v_quote.price_total_fcfa, 0),
    now() + interval '10 minutes'
  )
  returning * into v_req;

  select full_name into v_client_name from public.profiles where id = auth.uid();

  perform public._push_notify(
    v_drv_profile,
    '🙋 Demande de course directe',
    coalesce(split_part(v_client_name, ' ', 1), 'Un client') ||
      ' souhaite une course : ' || p_pickup_address || ' → ' || p_dropoff_address ||
      '. Répondez sous 10 min.',
    '/', 'oneshot:' || v_req.id::text, true
  );

  return v_req;
end;
$fn_req$;

grant execute on function public.request_driver_oneshot to authenticated;

-- ------------------------------------------------------------
-- 3. Demandes reçues par le chauffeur (+ expiration auto)
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
language plpgsql security definer set search_path = public as $fn_drvreq$
begin
  update public.driver_requests
  set status = 'expired'
  where status = 'pending' and expires_at <= now();

  return query
  select dr.id, split_part(coalesce(pr.full_name, 'Client'), ' ', 1),
         dr.pickup_address, dr.dropoff_address, dr.category,
         dr.distance_km, dr.duration_min, dr.price_total_fcfa, dr.expires_at
  from public.driver_requests dr
  join public.drivers d on d.id = dr.driver_id
  join public.profiles pr on pr.id = dr.client_id
  where d.profile_id = auth.uid()
    and dr.status = 'pending' and dr.expires_at > now()
  order by dr.created_at;
end;
$fn_drvreq$;

grant execute on function public.driver_oneshot_requests to authenticated;

-- ------------------------------------------------------------
-- 4. Réponse du chauffeur : accepte (crée la course) ou refuse
-- ------------------------------------------------------------
create or replace function public.respond_driver_oneshot(
  p_request_id uuid,
  p_accept boolean
)
returns public.driver_requests
language plpgsql security definer set search_path = public as $fn_resp$
declare
  v_req public.driver_requests;
  v_drv record;
  v_quote record;
  v_ride public.rides;
begin
  select dr.* into v_req
  from public.driver_requests dr
  join public.drivers d on d.id = dr.driver_id
  where dr.id = p_request_id and d.profile_id = auth.uid()
  for update;
  if not found then raise exception 'Demande introuvable'; end if;
  if v_req.status <> 'pending' or v_req.expires_at < now() then
    raise exception 'Demande expirée ou déjà traitée';
  end if;

  if not p_accept then
    update public.driver_requests
    set status = 'declined', responded_at = now()
    where id = v_req.id returning * into v_req;
    perform public._push_notify(
      v_req.client_id, 'Chauffeur indisponible',
      'Le chauffeur ne peut pas assurer cette course. Essayez-en un autre.',
      '/chauffeurs', 'oneshot-declined', true
    );
    return v_req;
  end if;

  select d.id, d.current_vehicle_id, v.dealer_partner_id
    into v_drv
  from public.drivers d
  join public.vehicles v on v.id = d.current_vehicle_id
  where d.profile_id = auth.uid() and d.status = 'active';
  if v_drv.id is null then
    raise exception 'Véhicule chauffeur introuvable';
  end if;

  select * into v_quote from public.compute_price(
    st_y(v_req.pickup_location::geometry), st_x(v_req.pickup_location::geometry),
    st_y(v_req.dropoff_location::geometry), st_x(v_req.dropoff_location::geometry),
    v_req.distance_km, v_req.duration_min, v_req.category, false, false
  ) limit 1;

  insert into public.rides (
    client_id, driver_id, vehicle_id, dealer_partner_id,
    pickup_location, pickup_address, dropoff_location, dropoff_address,
    distance_km, duration_min,
    price_total_fcfa, driver_share_fcfa, driver_rachat_fcfa,
    dealer_share_fcfa, platform_share_fcfa,
    status, requested_category, requested_at, matched_at
  ) values (
    v_req.client_id, v_drv.id, v_drv.current_vehicle_id, v_drv.dealer_partner_id,
    v_req.pickup_location, v_req.pickup_address, v_req.dropoff_location, v_req.dropoff_address,
    v_req.distance_km, v_req.duration_min,
    v_quote.price_total_fcfa, v_quote.driver_cash_fcfa, v_quote.driver_rachat_fcfa,
    v_quote.dealer_share_fcfa, v_quote.platform_share_fcfa,
    'matched', v_req.category, now(), now()
  )
  returning * into v_ride;

  update public.driver_requests
  set status = 'accepted', responded_at = now(), ride_id = v_ride.id
  where id = v_req.id returning * into v_req;

  perform public._push_notify(
    v_req.client_id, '🎉 Chauffeur disponible !',
    'Votre chauffeur a accepté votre course. Suivez-la en direct.',
    '/ride/' || v_ride.id::text, 'oneshot-accepted', true
  );

  return v_req;
end;
$fn_resp$;

grant execute on function public.respond_driver_oneshot to authenticated;

-- ------------------------------------------------------------
-- 5. Dernière demande du client (suivi d'état, + expiration auto)
-- ------------------------------------------------------------
create or replace function public.my_pending_oneshot()
returns table (
  request_id uuid,
  driver_name text,
  pickup_address text,
  dropoff_address text,
  price_total_fcfa int,
  status text,
  expires_at timestamptz,
  ride_id uuid
)
language plpgsql security definer set search_path = public as $fn_mine$
begin
  update public.driver_requests
  set status = 'expired'
  where client_id = auth.uid()
    and status = 'pending' and expires_at <= now();

  return query
  select dr.id, pr.full_name, dr.pickup_address, dr.dropoff_address,
         dr.price_total_fcfa, dr.status, dr.expires_at, dr.ride_id
  from public.driver_requests dr
  join public.drivers d on d.id = dr.driver_id
  join public.profiles pr on pr.id = d.profile_id
  where dr.client_id = auth.uid()
    and (dr.status = 'pending'
         or dr.responded_at > now() - interval '3 minutes')
  order by dr.created_at desc
  limit 1;
end;
$fn_mine$;

grant execute on function public.my_pending_oneshot to authenticated;

-- ------------------------------------------------------------
-- 6. Annulation d'une demande par le client (avant réponse)
-- ------------------------------------------------------------
create or replace function public.cancel_oneshot_request(p_request_id uuid)
returns public.driver_requests
language plpgsql security definer set search_path = public as $fn_can$
declare
  v_req public.driver_requests;
begin
  update public.driver_requests
  set status = 'cancelled', responded_at = now()
  where id = p_request_id and client_id = auth.uid() and status = 'pending'
  returning * into v_req;
  if v_req.id is null then raise exception 'Demande introuvable'; end if;
  return v_req;
end;
$fn_can$;

grant execute on function public.cancel_oneshot_request to authenticated;
