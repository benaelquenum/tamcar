-- ============================================================
-- TamCar — Chauffeurs visibles sur la carte du client (positions dégradées)
-- Préalable n° 3 de la refonte de l'accueil (2026-08-13).
--
--   Décision Terence : afficher les véhicules sur l'accueil. Publier la
--   position exacte de chauffeurs à tout compte connecté serait excessif —
--   on peut suivre quelqu'un, deviner son domicile. Trois garde-fous :
--
--     1. Position ARRONDIE à une grille de 0,002° (~220 m à cette
--        latitude). Assez fin pour situer un véhicule dans le quartier,
--        trop grossier pour le pister.
--     2. Aucun identifiant, aucun nom, aucun cap. Seule la catégorie sort,
--        parce qu'elle sert au client (« y a-t-il une moto près de moi ? »).
--     3. Cinq véhicules au maximum.
--
--   Le compteur de l'accueil comptait TOUS les chauffeurs en ligne du pays
--   sous le libellé « en ligne ». La maquette annonce « à proximité », ce
--   qui est une promesse différente. La fonction renvoie donc le décompte
--   réel du rayon dans `total_nearby` : le chiffre et les épingles
--   viennent de la même requête et ne peuvent plus se contredire.
--
--   FRAÎCHEUR : drivers.updated_at fait office d'horodatage de position —
--   driver_update_location écrit current_location, le déclencheur
--   set_updated_at suit. Un chauffeur dont l'application a été tuée sans
--   passer hors ligne cesse d'émettre : au-delà de 5 minutes, on ne
--   l'affiche plus. C'est une approximation (toute écriture sur la ligne
--   rafraîchit updated_at), suffisante ici et sans colonne à ajouter.
-- ============================================================

create or replace function public.drivers_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 5.0
)
returns table (
  lat double precision,
  lng double precision,
  category vehicle_category,
  total_nearby int
)
language sql stable security definer set search_path = public as $$
  with moi as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as loc
  ),
  candidats as (
    select
      -- Grille de 0,002° : ~222 m en latitude, ~221 m en longitude à 6,4° N.
      round((st_y(d.current_location::geometry) / 0.002)::numeric) * 0.002 as glat,
      round((st_x(d.current_location::geometry) / 0.002)::numeric) * 0.002 as glng,
      v.category as cat,
      st_distance(d.current_location, m.loc) as dist
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    cross join moi m
    where d.is_online = true
      and d.status = 'active'
      and d.current_location is not null
      and d.updated_at > now() - interval '5 minutes'
      and st_dwithin(d.current_location, m.loc, greatest(0.5, least(coalesce(p_radius_km, 5), 15)) * 1000)
      -- Un chauffeur déjà sur deux courses ne peut plus rien accepter :
      -- l'afficher gonflerait une disponibilité qui n'existe pas.
      and (
        select count(*) from public.rides r
        where r.driver_id = d.id
          and r.status in ('matched', 'arrived', 'in_progress')
      ) < 2
  )
  -- Une cellule = une épingle : deux chauffeurs au même endroit ne doivent
  -- pas produire deux marqueurs superposés. Le dédoublonnage impose un tri
  -- par cellule, d'où la sous-requête : on retrie ENSUITE par distance,
  -- sans quoi les cinq retenus seraient les plus à l'ouest, pas les plus
  -- proches. total_nearby, lui, compte les chauffeurs avant regroupement.
  select u.glat::double precision, u.glng::double precision, u.cat,
         (select count(*)::int from candidats)
  from (
    select distinct on (c.glat, c.glng) c.glat, c.glng, c.cat, c.dist
    from candidats c
    order by c.glat, c.glng, c.dist
  ) u
  order by u.dist
  limit 5;
$$;

revoke execute on function public.drivers_nearby(double precision, double precision, double precision)
  from public, anon;
grant execute on function public.drivers_nearby(double precision, double precision, double precision)
  to authenticated;

comment on function public.drivers_nearby is
  'Véhicules disponibles autour d''un point, pour la carte du client. Positions arrondies à ~220 m, aucune identité, 5 au maximum ; total_nearby porte le décompte réel du rayon. À déclarer dans la politique de confidentialité.';
