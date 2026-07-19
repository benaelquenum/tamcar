-- ============================================================
-- Disponibilité chauffeurs par catégorie autour d'un pickup.
-- Utilisé sur /commande pour afficher "3 · 6 min" sous chaque tuile.
--
-- Retour : une ligne par catégorie (même si zéro chauffeur), pour
-- que le front puisse afficher "0 · —" au lieu d'une case vide.
--
-- ETA calculé simplement : distance / vitesse moyenne + 1 min démarrage.
--   moto/tricycle : 25 km/h → 417 m/min
--   essentiel/confort : 22 km/h → 367 m/min
-- Le vrai ETA arrive à /ride via Mapbox Directions une fois matché.
-- ============================================================

create or replace function public.drivers_availability_by_category(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 10.0
)
returns table (
  category vehicle_category,
  online_count int,
  nearest_driver_distance_m int,
  eta_min int
)
language sql stable security definer set search_path = public as $$
  with pickup as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as geo
  ),
  eligible as (
    select
      v.category,
      st_distance(d.current_location, (select geo from pickup)) as dist_m
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.is_online = true
      and d.status = 'active'
      and d.current_location is not null
      and st_dwithin(d.current_location, (select geo from pickup), p_radius_km * 1000)
  ),
  agg as (
    select
      category,
      count(*)::int as online_count,
      min(dist_m)::int as nearest_driver_distance_m
    from eligible
    group by category
  ),
  cats(category) as (
    values ('moto'::vehicle_category), ('tricycle'::vehicle_category),
           ('essentiel'::vehicle_category), ('confort'::vehicle_category)
  )
  select
    c.category,
    coalesce(a.online_count, 0) as online_count,
    a.nearest_driver_distance_m,
    case
      when a.nearest_driver_distance_m is null then null
      when c.category in ('moto', 'tricycle')
        then ceil(a.nearest_driver_distance_m::numeric / 417.0)::int + 1
      else ceil(a.nearest_driver_distance_m::numeric / 367.0)::int + 1
    end as eta_min
  from cats c
  left join agg a on a.category = c.category;
$$;

comment on function public.drivers_availability_by_category is
  'Retourne 4 lignes (une par catégorie) : nb chauffeurs online + ETA estimé du plus proche. ETA basé sur distance/vitesse moyenne — utilisé pour affichage instantané, pas pour matching.';

grant execute on function public.drivers_availability_by_category to authenticated;
