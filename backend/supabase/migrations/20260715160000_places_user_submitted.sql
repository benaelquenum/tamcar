-- ============================================================
-- TamCar — Crowd-sourcing lieux via user_submitted (2026-07-15)
--
-- Permet à un client authentifié de proposer un lieu qui apparaîtra
-- dans la modération admin avec verified=false.
-- ============================================================

-- Policy INSERT : user connecté peut créer un place UNIQUEMENT si
--   source='user_submitted' AND submitted_by=auth.uid()
-- Il ne peut pas se marquer verified=true (impossible via check).
create policy places_user_submitted_insert on public.places for insert
  to authenticated
  with check (
    source = 'user_submitted'
    and submitted_by = auth.uid()
    and verified = false
  );

-- Policy SELECT étendue : le user voit ses propres user_submitted
-- (déjà vue par tous via places_public_read, mais utile si un jour
-- on filtre public_read aux verified uniquement).
-- Pour l'instant places_public_read couvre.

-- ------------------------------------------------------------
-- Helper RPC : suggest_place(name, category_group, city, lng, lat)
--
-- Simplifie l'appel côté client, valide les champs, retourne le row inséré.
-- ------------------------------------------------------------

create or replace function public.suggest_place(
  p_name text,
  p_category_group text,
  p_city text,
  p_lng double precision,
  p_lat double precision,
  p_district text default null
)
returns public.places
language plpgsql security invoker as $$
declare
  new_row public.places;
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;
  if length(trim(p_name)) < 2 then
    raise exception 'name too short';
  end if;
  if p_lng is null or p_lat is null then
    raise exception 'coordinates required';
  end if;

  insert into public.places
    (name, category_group, city, district, location, source, verified, submitted_by)
  values (
    trim(p_name),
    p_category_group,
    p_city,
    p_district,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    'user_submitted',
    false,
    auth.uid()
  )
  returning * into new_row;

  return new_row;
end;
$$;

comment on function public.suggest_place is
  'Client authentifié propose un nouveau lieu. Va en attente de modération (verified=false).';

-- ------------------------------------------------------------
-- Helpers admin pour la modération
-- ------------------------------------------------------------

create or replace function public.verify_place(place_id uuid)
returns public.places
language plpgsql security invoker as $$
declare
  updated public.places;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  update public.places
  set verified = true,
      verified_at = now(),
      verified_by = auth.uid(),
      updated_at = now()
  where id = place_id
  returning * into updated;

  return updated;
end;
$$;

create or replace function public.reject_place(place_id uuid)
returns void
language plpgsql security invoker as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  delete from public.places
  where id = place_id
    and verified = false
    and source = 'user_submitted';
end;
$$;

comment on function public.verify_place is 'Admin valide un lieu proposé (verified=true + traçabilité).';
comment on function public.reject_place is 'Admin rejette un lieu proposé (suppression). Uniquement user_submitted non vérifiés.';
