-- ============================================================
-- TamCar — Lien public de suivi de course (2026-07-30)
--
--   Le client (payeur) génère un lien « suis ma course en direct »
--   à partager (WhatsApp…). La page /suivi/<token> est publique :
--   aucun compte requis. Données volontairement LIMITÉES : ni
--   téléphones, ni prix — statut, trajet, prénom chauffeur, véhicule,
--   position live du chauffeur pendant la course.
--   Le lien meurt 6 h après la fin (ou l'annulation) de la course.
-- ============================================================

-- 1. Table des liens ---------------------------------------------------
create table if not exists public.ride_share_links (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  ride_id uuid not null references public.rides(id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists ride_share_links_ride_idx
  on public.ride_share_links (ride_id);

alter table public.ride_share_links enable row level security;
-- Aucune policy : l'accès passe exclusivement par les RPC security definer.

-- 2. Création (client propriétaire de la course, idempotent) -----------
create or replace function public.create_ride_share_link(p_ride_id uuid)
returns text
language plpgsql security definer set search_path = public as $fn$
declare
  v_ride public.rides;
  v_token text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if v_ride is null then raise exception 'Course introuvable'; end if;
  if v_ride.client_id <> auth.uid() then raise exception 'Not your ride'; end if;

  select token into v_token from public.ride_share_links
   where ride_id = p_ride_id
   limit 1;
  if v_token is not null then return v_token; end if;

  insert into public.ride_share_links (ride_id, created_by)
   values (p_ride_id, auth.uid())
   returning token into v_token;
  return v_token;
end;
$fn$;

revoke execute on function public.create_ride_share_link(uuid) from public, anon;
grant execute on function public.create_ride_share_link(uuid) to authenticated;

-- 3. Lecture publique (anon) — données limitées ------------------------
create or replace function public.public_ride_track(p_token text)
returns table (
  status ride_status,
  pickup_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_address text,
  dropoff_lat double precision,
  dropoff_lng double precision,
  distance_km numeric,
  duration_min int,
  requested_category vehicle_category,
  passenger_display text,
  driver_first_name text,
  driver_rating_avg numeric,
  vehicle_brand text,
  vehicle_model text,
  vehicle_plate text,
  vehicle_color text,
  driver_lat double precision,
  driver_lng double precision,
  matched_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz
)
language sql stable security definer set search_path = public as $fn$
  select
    r.status,
    r.pickup_address,
    st_y(r.pickup_location::geometry) as pickup_lat,
    st_x(r.pickup_location::geometry) as pickup_lng,
    r.dropoff_address,
    st_y(r.dropoff_location::geometry) as dropoff_lat,
    st_x(r.dropoff_location::geometry) as dropoff_lng,
    r.distance_km,
    r.duration_min,
    r.requested_category,
    coalesce(r.passenger_name, split_part(coalesce(cp.full_name, ''), ' ', 1)) as passenger_display,
    split_part(coalesce(dp.full_name, ''), ' ', 1) as driver_first_name,
    d.rating_avg as driver_rating_avg,
    v.brand as vehicle_brand,
    v.model as vehicle_model,
    v.plate_number as vehicle_plate,
    v.color as vehicle_color,
    -- Position live du chauffeur : uniquement pendant la course active
    case when r.status in ('matched', 'arrived', 'in_progress') and d.current_location is not null
         then st_y(d.current_location::geometry) end as driver_lat,
    case when r.status in ('matched', 'arrived', 'in_progress') and d.current_location is not null
         then st_x(d.current_location::geometry) end as driver_lng,
    r.matched_at, r.started_at, r.ended_at
  from public.ride_share_links l
  join public.rides r on r.id = l.ride_id
  left join public.profiles cp on cp.id = r.client_id
  left join public.drivers d on d.id = r.driver_id
  left join public.profiles dp on dp.id = d.profile_id
  left join public.vehicles v on v.id = r.vehicle_id
  where l.token = p_token
    and (r.ended_at is null or r.ended_at > now() - interval '6 hours')
    and (r.cancelled_at is null or r.cancelled_at > now() - interval '6 hours');
$fn$;

grant execute on function public.public_ride_track(text) to anon, authenticated;
