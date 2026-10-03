# Import des lieux Overture Maps (Bénin, cinq villes)

Réalisé le 2026-10-03 : release Overture `2026-09-23.1`, 2 305 lieux importés (`places.source = 'overture'`).

1. `pip install duckdb`
2. Exporter les lieux actuels pour le dédoublonnage (depuis `backend/`) :
   `supabase db query --linked -o json -f <fichier avec : select id, name, name_normalized, category, category_group, city, source::text as source, st_y(location::geometry) as lat, st_x(location::geometry) as lng from public.places;>`
   puis enregistrer le tableau `rows` dans `existing_places.json` (dans ce dossier).
3. `python overture_fetch.py` : télécharge les lieux de la zone (lat 6,29-6,71 ; lng 1,94-2,81) dans `overture_zone.parquet`.
4. `python overture_prepare.py` : filtre (hors Nigeria, confiance >= 0,5, entreprises de services >= 0,7), retire les doublons
   (distance + similarité de nom), attribue la ville et la catégorie, écrit les lots `overture_sql/lot_*.sql`.
5. Exécuter chaque lot avec `supabase db query --linked -f overture_sql/lot_001.sql` (idempotent : `on conflict (overture_id) do nothing`).

Licences : CDLA-Permissive-2.0 (Meta, Microsoft), Apache-2.0 (Foursquare), CC0 (AllThePlaces). Attribution dans le pied de page des CGU.
Les lieux Overture et OpenStreetMap sont exclus de la sauvegarde (réimportables) : voir `20261003110000_places_overture.sql`.

## Contrôle des villes (2026-10-03)

Les villes de la table `places` avaient été attribuées par zones rectangulaires (OSM) puis héritées du lieu voisin (Overture) :
1 878 lieux portaient le nom d'une autre commune (surtout Cotonou étiqueté Abomey-Calavi). Correction faite par comparaison avec les limites
communales d'Overture (`communes_fetch.py` puis `city_audit.py`, qui exige `existing_places.json`/`all_places.json` et `communes_bj.parquet`).
Règles : on ne corrige que les lieux situés DANS l'une des 5 communes ; marge de 150 m à la limite (500 m pour Porto-Novo, tracé grossier) ;
adresse contredisant la correction : laissé pour vérification. L'ancienne ville est gardée dans `tags.city_before_fix`.
Les lieux situés dans d'autres communes (Adjarra, Allada…) gardent le nom de la grande ville voisine (zone de service).
Mêmes lieux Overture : positions de remplacement (coordonnées partagées par >= 3 lieux) supprimées (517 lieux), filtre ajouté à `overture_prepare.py`.
