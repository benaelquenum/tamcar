-- ============================================================
-- TamCar — nearby_drivers_for_map (2026-07-15)
--
-- Retourne les positions des chauffeurs en ligne autour d'un point,
-- pour affichage sur la carte client pendant la recherche.
-- security definer + set search_path pour ne pas exposer inutilement
-- la table drivers via RLS (on ne renvoie que lat/lng + category,
-- pas d'infos sensibles chauffeur).
-- ============================================================

create or replace function public.nearby_drivers_for_map(
  pickup_lat double precision,
  pickup_lng double precision,
  radius_km double precision default 5.0,
  limit_count int default 20
)
returns table (
  driver_id uuid,
  lat double precision,
  lng double precision,
  category vehicle_category,
  distance_m double precision
)
language sql stable security definer set search_path = public as $$
  select
    d.id,
    st_y(d.current_location::geometry) as lat,
    st_x(d.current_location::geometry) as lng,
    coalesce(v.category, 'essentiel'::vehicle_category) as category,
    st_distance(
      d.current_location,
      st_setsrid(st_makepoint(pickup_lng, pickup_lat), 4326)::geography
    ) as distance_m
  from public.drivers d
  left join public.vehicles v on v.id = d.current_vehicle_id
  where d.is_online = true
    and d.status = 'active'
    and d.current_location is not null
    and st_dwithin(
      d.current_location,
      st_setsrid(st_makepoint(pickup_lng, pickup_lat), 4326)::geography,
      radius_km * 1000
    )
  order by distance_m asc
  limit limit_count;
$$;

comment on function public.nearby_drivers_for_map is
  'Positions des chauffeurs en ligne autour d''un point pour affichage carte client. Anonymisé (pas d''infos personnelles chauffeur).';

grant execute on function public.nearby_drivers_for_map to authenticated, anon;
