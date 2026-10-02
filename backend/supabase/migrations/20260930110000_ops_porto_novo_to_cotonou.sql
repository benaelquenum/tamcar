-- ============================================================
-- TamCar — Responsable opérations : Porto-Novo rattaché à Cotonou
-- (2026-09-30)
--
--   Décision Terence : un responsable opérations par ville, à Cotonou et
--   à Parakou. En attendant, le responsable de Cotonou couvre aussi
--   Porto-Novo.
--
--   Le rattachement d'une course se fait au centre de ville ACTIF le plus
--   proche de son point de départ, dans son rayon (ops_city_for_point).
--   On désactive donc la ligne 'Porto-Novo' : Cotonou (rayon 45 km) absorbe
--   Porto-Novo (~24 km), Sèmè-Podji, Avrankou, Adjarra.
--
--   Réversible : remettre active = true sur 'Porto-Novo' puis relancer le
--   recalcul ci-dessous.
--
--   Le recalcul est fait ici directement (et non par
--   ops_backfill_ride_cities(), qui exige un compte admin connecté).
--   Seules les courses actuellement rattachées à Porto-Novo sont touchées.
-- ============================================================

update public.ops_cities
   set active = false
 where city = 'Porto-Novo';

update public.rides r
   set ops_city = public.ops_city_for_point(
         st_y(r.pickup_location::geometry),
         st_x(r.pickup_location::geometry))
 where r.ops_city = 'Porto-Novo';

-- Contrôle : villes actives et répartition des courses par ville
select city, active from public.ops_cities order by city;
select coalesce(ops_city, '(hors périmètre)') as ville, count(*) as courses
  from public.rides
 group by 1
 order by 1;
