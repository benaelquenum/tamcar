-- ============================================================
-- TamCar — Table places pour POI enrichis (Option D — 2026-07-15)
--
-- Base propriétaire de POI Bénin :
--   - Bootstrap depuis OSM Overpass API (~500-1000 POI Cotonou + PN)
--   - Enrichissement admin
--   - Crowd-sourcing user (v1.5)
--
-- Consommé par la fonction search_places(query, proximity) qui remplace
-- le geocoding Mapbox en priorité côté client.
-- ============================================================

-- ------------------------------------------------------------
-- Extensions (avant la table car generated column dépend de unaccent)
-- ------------------------------------------------------------
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- Wrapper IMMUTABLE de unaccent (unaccent n'est pas IMMUTABLE par défaut,
-- requis pour être utilisé dans une colonne generated stored).
create or replace function public.f_unaccent(text)
returns text language sql immutable strict parallel safe as $$
  select public.unaccent('public.unaccent', $1);
$$;

-- ------------------------------------------------------------
-- Enum source des données
-- ------------------------------------------------------------
create type place_source as enum (
  'osm',              -- importé OpenStreetMap via Overpass API
  'popular_seed',     -- seed initial hardcodé (checkpoints, quartiers phares)
  'user_submitted',   -- proposé par un user via app (à modérer)
  'admin'             -- ajouté/curé par l'équipe TamCar
);

-- ------------------------------------------------------------
-- Table places
-- ------------------------------------------------------------
create table public.places (
  id uuid primary key default gen_random_uuid(),

  -- Nom d'affichage et normalisation pour recherche
  name text not null,
  name_normalized text generated always as (
    lower(public.f_unaccent(name))
  ) stored,

  -- Catégorisation
  category text,             -- OSM amenity/shop/tourism/etc. valeur brute
  category_group text,       -- regroupement métier : 'restaurant', 'transport', 'commerce', 'santé', 'école', 'hôtel', 'quartier', 'autre'

  -- Localisation
  city text not null,        -- Cotonou / Porto-Novo / Abomey-Calavi / Sèmè-Kpodji / Ouidah / ...
  district text,             -- quartier / arrondissement si connu
  location geography(point, 4326) not null,
  address text,              -- adresse complète si disponible

  -- Traçabilité + curation
  source place_source not null default 'osm',
  osm_id bigint unique,      -- pour idempotence lors des ré-imports
  osm_type text,             -- node / way / relation
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  submitted_by uuid references public.profiles(id) on delete set null,

  -- Meta
  tags jsonb not null default '{}',   -- tous les tags OSM bruts pour debug/reprise
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index places_location_gix on public.places using gist(location);
create index places_city_idx on public.places(city);
create index places_category_group_idx on public.places(category_group);
create index places_source_idx on public.places(source);
create index places_name_normalized_trgm_idx on public.places using gin (name_normalized gin_trgm_ops);

-- Trigger updated_at
create trigger places_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS : SELECT public, écriture admin uniquement
-- ------------------------------------------------------------
alter table public.places enable row level security;

create policy places_public_read on public.places for select using (true);

create policy places_admin_insert on public.places for insert
  with check (public.is_admin());
create policy places_admin_update on public.places for update
  using (public.is_admin()) with check (public.is_admin());
create policy places_admin_delete on public.places for delete
  using (public.is_admin());

-- (v1.5) Ajouter policy user_submitted_insert plus tard :
--   INSERT with check (auth.uid() = submitted_by AND source = 'user_submitted')

-- ------------------------------------------------------------
-- Fonction search_places(query, proximity, limit)
--
-- Full-text tolérant aux accents + géo-tri (si proximity fourni).
-- Utilisée par AddressAutocomplete côté client en priorité, avant fallback Mapbox.
-- ------------------------------------------------------------

create or replace function public.search_places(
  query text,
  proximity_lng double precision default null,
  proximity_lat double precision default null,
  limit_count int default 8
)
returns table (
  id uuid,
  name text,
  city text,
  district text,
  category_group text,
  lng double precision,
  lat double precision,
  distance_m double precision,
  source place_source,
  verified boolean,
  score real
)
language sql stable as $$
  with q as (
    select lower(public.f_unaccent(query)) as needle,
           case
             when proximity_lng is not null and proximity_lat is not null
             then st_setsrid(st_makepoint(proximity_lng, proximity_lat), 4326)::geography
             else null
           end as proximity
  ),
  scored as (
    select
      p.id,
      p.name,
      p.city,
      p.district,
      p.category_group,
      st_x(p.location::geometry) as lng,
      st_y(p.location::geometry) as lat,
      case
        when q.proximity is not null then st_distance(p.location, q.proximity)
        else null
      end as distance_m,
      p.source,
      p.verified,
      -- Similarité trigram (0..1)
      similarity(p.name_normalized, q.needle) as sim
    from public.places p, q
    where q.needle = '' or p.name_normalized % q.needle
    order by
      -- Verified d'abord, puis similarité, puis distance
      p.verified desc,
      sim desc,
      case when q.proximity is not null
           then st_distance(p.location, q.proximity)
           else 0 end asc
    limit greatest(limit_count, 1)
  )
  select
    id,
    name,
    city,
    district,
    category_group,
    lng,
    lat,
    distance_m,
    source,
    verified,
    sim as score
  from scored;
$$;

comment on function public.search_places is
  'Recherche full-text tolérante aux accents dans places, triée par verified + similarité + distance (si proximity fourni).';

-- ------------------------------------------------------------
-- Seed initial : les 15 lieux populaires déjà en dur côté client
-- (BENIN_POPULAR_PLACES dans lib/mapbox.ts).
-- On les marque verified=true, source=popular_seed.
-- ------------------------------------------------------------

insert into public.places (name, category_group, city, location, source, verified, verified_at) values
  ('Aéroport Cadjèhoun', 'transport', 'Cotonou', st_setsrid(st_makepoint(2.3844, 6.3573), 4326)::geography, 'popular_seed', true, now()),
  ('Marché Dantokpa (Tokpa)', 'commerce', 'Cotonou', st_setsrid(st_makepoint(2.4258, 6.3654), 4326)::geography, 'popular_seed', true, now()),
  ('Étoile Rouge', 'quartier', 'Cotonou', st_setsrid(st_makepoint(2.4183, 6.3708), 4326)::geography, 'popular_seed', true, now()),
  ('Gare routière de Jonquet', 'transport', 'Cotonou', st_setsrid(st_makepoint(2.4102, 6.3644), 4326)::geography, 'popular_seed', true, now()),
  ('Plage de Fidjrossè', 'quartier', 'Cotonou', st_setsrid(st_makepoint(2.3775, 6.3608), 4326)::geography, 'popular_seed', true, now()),
  ('Cadjèhoun', 'quartier', 'Cotonou', st_setsrid(st_makepoint(2.3892, 6.3565), 4326)::geography, 'popular_seed', true, now()),
  ('Akpakpa', 'quartier', 'Cotonou', st_setsrid(st_makepoint(2.4440, 6.3628), 4326)::geography, 'popular_seed', true, now()),
  ('Zone Erevan', 'quartier', 'Cotonou', st_setsrid(st_makepoint(2.4152, 6.3617), 4326)::geography, 'popular_seed', true, now()),
  ('Ancien siège Assemblée nationale', 'autre', 'Porto-Novo', st_setsrid(st_makepoint(2.6030, 6.4970), 4326)::geography, 'popular_seed', true, now()),
  ('Marché Ouando', 'commerce', 'Porto-Novo', st_setsrid(st_makepoint(2.6165, 6.4830), 4326)::geography, 'popular_seed', true, now()),
  ('Centre Songhaï', 'autre', 'Porto-Novo', st_setsrid(st_makepoint(2.6210, 6.4620), 4326)::geography, 'popular_seed', true, now()),
  ('Catchi', 'quartier', 'Porto-Novo', st_setsrid(st_makepoint(2.6110, 6.4948), 4326)::geography, 'popular_seed', true, now()),
  ('Université Abomey-Calavi (UAC)', 'école', 'Abomey-Calavi', st_setsrid(st_makepoint(2.3392, 6.4147), 4326)::geography, 'popular_seed', true, now()),
  ('Godomey', 'quartier', 'Abomey-Calavi', st_setsrid(st_makepoint(2.3450, 6.3820), 4326)::geography, 'popular_seed', true, now()),
  ('Frontière Sèmè-Kraké', 'transport', 'Sèmè-Kpodji', st_setsrid(st_makepoint(2.6870, 6.3620), 4326)::geography, 'popular_seed', true, now());
