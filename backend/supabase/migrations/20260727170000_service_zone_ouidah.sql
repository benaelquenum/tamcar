-- ============================================================
-- Élargissement de la zone de service : + Ouidah (ouest).
-- Décision Terence 2026-07-27 : réélargir le périmètre jusqu'à
-- Ouidah à l'ouest et Porto-Novo à l'est (corridor complet).
--
-- Ouidah est à ~39 km de Cotonou : deux cercles de 15 km ne se
-- rejoindraient pas. On ajoute donc un point-relais à Pahou
-- (ville sur la RNIE1, à mi-chemin) pour que la chaîne de cercles
-- Ouidah → Pahou → Cotonou → Sèmè-Podji → Porto-Novo se chevauche
-- d'un bout à l'autre → corridor continu, sans trou de couverture.
-- Sèmè-Podji (Grand Nokoué) est décalée au sud : son propre cercle
-- comble le creux côtier entre Cotonou et Porto-Novo.
--
-- Rayons volontairement serrés (15 km) : on ne couvre que là où
-- des chauffeurs sont réellement disponibles.
-- ============================================================

create or replace function public._is_within_service_zone(
  p_lat double precision,
  p_lng double precision
)
returns boolean
language sql stable security invoker as $$
  select
       st_dwithin(  -- Ouidah
         st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
         st_setsrid(st_makepoint(2.085, 6.363), 4326)::geography, 15000)
    or st_dwithin(  -- Pahou (relais corridor Ouidah–Cotonou)
         st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
         st_setsrid(st_makepoint(2.200, 6.383), 4326)::geography, 15000)
    or st_dwithin(  -- Cotonou
         st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
         st_setsrid(st_makepoint(2.435, 6.365), 4326)::geography, 15000)
    or st_dwithin(  -- Sèmè-Podji (creux côtier Cotonou–Porto-Novo)
         st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
         st_setsrid(st_makepoint(2.625, 6.365), 4326)::geography, 15000)
    or st_dwithin(  -- Porto-Novo
         st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
         st_setsrid(st_makepoint(2.605, 6.497), 4326)::geography, 15000);
$$;

comment on function public._is_within_service_zone is
  'Zone de service : 15 km autour de Ouidah (2.085, 6.363), Pahou (2.200, 6.383), Cotonou (2.435, 6.365), Sèmè-Podji (2.625, 6.365) et Porto-Novo (2.605, 6.497). Les cercles se chevauchent en chaîne → corridor Ouidah–Cotonou–Porto-Novo couvert en continu.';

grant execute on function public._is_within_service_zone to authenticated;
