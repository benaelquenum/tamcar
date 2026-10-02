-- ============================================================
-- Corridors : même prix de nuit que de jour (2026-10-02)
-- ============================================================
-- Décision Terence : pas de majoration de nuit. La grille TamCar est « sans majoration
-- dynamique » (plan d'affaires, parties 3 et 4) et l'appli client envoie déjà toujours
-- « jour » : les prix de nuit n'étaient jamais appliqués. On les aligne sur les prix de jour
-- pour qu'un futur réglage de is_night ne majore pas une course par erreur.
update public.corridor_prices
   set price_night_fcfa = price_day_fcfa,
       round_trip_price_night_fcfa = round_trip_price_day_fcfa
 where price_night_fcfa is distinct from price_day_fcfa
    or round_trip_price_night_fcfa is distinct from round_trip_price_day_fcfa;
