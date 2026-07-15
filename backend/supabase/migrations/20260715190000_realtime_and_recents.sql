-- ============================================================
-- TamCar — Realtime rides + recent_addresses (2026-07-15)
--
-- 1. Active Supabase Realtime sur la table rides (nécessaire pour
--    l'écoute UPDATE côté client sur /ride/[id])
-- 2. RPC recent_addresses_for_user() : les derniers lieux utilisés
--    par le client, pour remplacer BENIN_POPULAR_PLACES par des
--    raccourcis pertinents dans l'autocomplete
-- ============================================================

-- ------------------------------------------------------------
-- 1. Activer Realtime sur rides + drivers
-- ------------------------------------------------------------

-- La publication supabase_realtime existe par défaut sur les projets
-- Supabase mais aucune table n'y est incluse tant qu'on ne l'ajoute pas.
alter publication supabase_realtime add table public.rides;

-- Pour la position live du chauffeur assigné (session suivante) :
alter publication supabase_realtime add table public.drivers;

-- ------------------------------------------------------------
-- 2. RPC recent_addresses_for_user()
--
-- Union pickup + dropoff des dernières rides du user, dedupé sur
-- l'adresse, retourne les X plus récentes.
-- ------------------------------------------------------------

create or replace function public.recent_addresses_for_user(
  limit_count int default 8
)
returns table (
  address text,
  lat double precision,
  lng double precision,
  last_used_at timestamptz,
  usage_count bigint
)
language sql stable security invoker as $$
  with all_addresses as (
    select
      pickup_address as address,
      st_y(pickup_location::geometry) as lat,
      st_x(pickup_location::geometry) as lng,
      requested_at as used_at
    from public.rides
    where client_id = auth.uid()
    union all
    select
      dropoff_address as address,
      st_y(dropoff_location::geometry) as lat,
      st_x(dropoff_location::geometry) as lng,
      requested_at as used_at
    from public.rides
    where client_id = auth.uid()
  ),
  aggregated as (
    select
      address,
      avg(lat)::double precision as lat,
      avg(lng)::double precision as lng,
      max(used_at) as last_used_at,
      count(*) as usage_count
    from all_addresses
    where address is not null and length(trim(address)) > 0
    group by address
  )
  select address, lat, lng, last_used_at, usage_count
  from aggregated
  order by last_used_at desc
  limit greatest(limit_count, 1);
$$;

comment on function public.recent_addresses_for_user is
  'Derniers lieux (pickup + dropoff) utilisés par le user connecté. Dédupé par adresse, trié par last_used_at desc.';
