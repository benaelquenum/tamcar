-- ============================================================
-- TamCar — Lieux favoris du client + destinations récentes
-- Préalable n° 2 de la refonte de l'accueil (2026-08-13).
--
--   La maquette affiche « Maison / Travail / Bibliothèque » sous le titre
--   « Destinations récentes ». Ce sont DEUX notions distinctes :
--     • les favoris  : enregistrés explicitement, nommés, durables ;
--     • les récentes : déduites de l'historique de courses, éphémères.
--   Aucune des deux n'existait en base.
--
--   Pourquoi dénormaliser l'adresse et la position au lieu de ne garder
--   qu'un lien vers public.places : un favori doit survivre à la
--   modification ou à la suppression du lieu partagé (les POI viennent
--   d'OSM et du crowdsourcing, ils bougent). Le lien est conservé quand
--   il existe, à titre indicatif.
-- ============================================================

create table if not exists public.client_favorite_places (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- 'home' et 'work' sont uniques par client, 'other' est libre.
  kind text not null default 'other' check (kind in ('home', 'work', 'other')),
  label text not null,
  address text not null,
  location geography(point, 4326) not null,
  place_id uuid references public.places(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_favorite_places is
  'Lieux enregistrés par le client (Maison, Travail, et libres). Adresse et position dénormalisées : le favori survit à la disparition du POI partagé.';

-- Un seul domicile et un seul lieu de travail par client.
create unique index if not exists client_favorite_places_home_uniq
  on public.client_favorite_places (profile_id) where kind = 'home';
create unique index if not exists client_favorite_places_work_uniq
  on public.client_favorite_places (profile_id) where kind = 'work';

create index if not exists client_favorite_places_profile_idx
  on public.client_favorite_places (profile_id, kind);

drop trigger if exists client_favorite_places_updated_at on public.client_favorite_places;
create trigger client_favorite_places_updated_at
  before update on public.client_favorite_places
  for each row execute function public.set_updated_at();

alter table public.client_favorite_places enable row level security;

drop policy if exists client_favorite_places_own on public.client_favorite_places;
create policy client_favorite_places_own on public.client_favorite_places
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ------------------------------------------------------------
-- 1. Lecture : domicile et travail d'abord, puis les autres
-- ------------------------------------------------------------
create or replace function public.my_favorite_places()
returns table (
  id uuid,
  kind text,
  label text,
  address text,
  lat double precision,
  lng double precision
)
language sql stable security invoker as $$
  select f.id, f.kind, f.label, f.address,
         st_y(f.location::geometry), st_x(f.location::geometry)
  from public.client_favorite_places f
  where f.profile_id = auth.uid()
  order by case f.kind when 'home' then 0 when 'work' then 1 else 2 end,
           f.label;
$$;
grant execute on function public.my_favorite_places to authenticated;

-- ------------------------------------------------------------
-- 2. Écriture : un seul point d'entrée, création comme modification
--    Domicile et travail écrasent l'existant — « définir ma maison »
--    ne doit jamais échouer sur un conflit d'unicité.
-- ------------------------------------------------------------
create or replace function public.save_favorite_place(
  p_kind text,
  p_label text,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_place_id uuid default null,
  p_id uuid default null
)
returns public.client_favorite_places
language plpgsql security invoker as $$
declare
  v_label text := nullif(trim(coalesce(p_label, '')), '');
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_loc geography;
  v_count int;
  result public.client_favorite_places;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_kind not in ('home', 'work', 'other') then
    raise exception 'Type de lieu inconnu';
  end if;
  if v_address is null then raise exception 'Adresse requise'; end if;
  if p_lat is null or p_lng is null then raise exception 'Position requise'; end if;
  if not public._is_within_service_zone(p_lat, p_lng) then
    raise exception 'Ce lieu est hors de la zone de service TamCar.';
  end if;

  -- Libellé par défaut cohérent avec le type.
  if v_label is null then
    v_label := case p_kind when 'home' then 'Maison'
                           when 'work' then 'Travail'
                           else v_address end;
  end if;

  v_loc := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  if p_id is not null then
    update public.client_favorite_places
      set kind = p_kind, label = v_label, address = v_address,
          location = v_loc, place_id = p_place_id
      where id = p_id and profile_id = auth.uid()
      returning * into result;
    if result.id is null then raise exception 'Lieu introuvable'; end if;
    return result;
  end if;

  if p_kind in ('home', 'work') then
    -- Remplacement : l'index unique partiel interdit le doublon.
    update public.client_favorite_places
      set label = v_label, address = v_address, location = v_loc,
          place_id = p_place_id
      where profile_id = auth.uid() and kind = p_kind
      returning * into result;
    if result.id is not null then return result; end if;
  else
    select count(*)::int into v_count
      from public.client_favorite_places
      where profile_id = auth.uid() and kind = 'other';
    if v_count >= 20 then
      raise exception 'Vous avez atteint la limite de 20 lieux enregistrés.';
    end if;
  end if;

  insert into public.client_favorite_places
    (profile_id, kind, label, address, location, place_id)
    values (auth.uid(), p_kind, v_label, v_address, v_loc, p_place_id)
    returning * into result;
  return result;
end;
$$;
grant execute on function public.save_favorite_place(
  text, text, text, double precision, double precision, uuid, uuid
) to authenticated;

create or replace function public.delete_favorite_place(p_id uuid)
returns void
language sql security invoker as $$
  delete from public.client_favorite_places
   where id = p_id and profile_id = auth.uid();
$$;
grant execute on function public.delete_favorite_place(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. Destinations récentes, déduites des courses
--
--    Regroupement sur la position arrondie à 3 décimales (~110 m) et non
--    sur le texte : « Église Biblique Échelle de Béthel » et « Eglise
--    biblique, Sainte Rita » désignent le même endroit avec deux libellés.
--    On garde le libellé de la course la plus récente.
--
--    Les lieux déjà en favoris sont écartés : inutile de proposer deux
--    fois « Maison » sur le même écran.
-- ------------------------------------------------------------
create or replace function public.my_recent_destinations(p_limit int default 6)
returns table (
  address text,
  lat double precision,
  lng double precision,
  last_used_at timestamptz,
  times_used int
)
language sql stable security invoker as $$
  with mine as (
    select r.dropoff_address as address,
           st_y(r.dropoff_location::geometry) as lat,
           st_x(r.dropoff_location::geometry) as lng,
           r.dropoff_location as loc,
           coalesce(r.ended_at, r.requested_at, r.created_at) as used_at
    from public.rides r
    where r.client_id = auth.uid()
      and r.status = 'completed'
      and r.dropoff_address is not null
  ),
  -- Les fonctions de fenêtrage sont évaluées AVANT le distinct on : le
  -- comptage porte donc bien sur tout le groupe, pas sur la ligne retenue.
  ranked as (
    select distinct on (round(lat::numeric, 3), round(lng::numeric, 3))
           address, lat, lng, loc, used_at,
           count(*) over (
             partition by round(lat::numeric, 3), round(lng::numeric, 3)
           )::int as times_used
    from mine
    order by round(lat::numeric, 3), round(lng::numeric, 3), used_at desc
  )
  select r.address, r.lat, r.lng, r.used_at, r.times_used
  from ranked r
  where not exists (
    select 1 from public.client_favorite_places f
    where f.profile_id = auth.uid()
      and st_dwithin(f.location, r.loc, 150)
  )
  order by r.used_at desc
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;
grant execute on function public.my_recent_destinations(int) to authenticated;

comment on function public.my_recent_destinations is
  'Destinations des courses terminées du client, dédoublonnées par position arrondie à ~110 m, favoris exclus. Alimente l''accueil avec my_favorite_places.';
