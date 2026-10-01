-- ============================================================
-- TamCar — Voitures : prix d'entrée (course minimale) −200 F par catégorie (2026-10-01)
--
--   Décision Terence : réduire de 200 F le coût minimum de chaque catégorie de voiture
--   (Essentiel, Confort, VIP). Moto et tricycle ne sont pas touchés.
--
--   Le calcul reste celui de compute_price (aucune modification de code) :
--     total = max( base + max(km_en_plus × tarif_km, min_en_plus × tarif_min),
--                  min_course ), arrondi au 50 F supérieur.
--   On abaisse base_fcfa ET min_course_fcfa de 200 F : le minimum baisse de 200 F
--   et toute course au-dessus du minimum baisse aussi de 200 F (la base est la
--   première composante du prix). Les tarifs au km et à la minute ne changent pas.
--
--   Avant  : essentiel 700 · confort 900 · premium (VIP) 1 150
--   Après  : essentiel 500 · confort 700 · premium (VIP)   950
--
--   Valeurs absolues (et non « − 200 ») : la migration peut être rejouée sans
--   baisser une seconde fois les prix.
--
--   Prix attendus après migration (course de 6,09 km / 17 min, en ville) :
--     essentiel 1 200 → 1 000 · confort 1 550 → 1 350 · premium 2 000 → 1 800
--   Vérification (6,09 km, 17 min, distance > 5 km donc tarif « corridor ») :
--     essentiel  500 + max(ceil(3,09 × 160) = 495 ; 12 × 40 = 480)  =   995 → 1 000
--     confort    700 + max(ceil(3,09 × 210) = 649 ; 12 × 50 = 600)  = 1 349 → 1 350
--     premium    950 + max(ceil(3,09 × 270) = 835 ; 12 × 60 = 720)  = 1 785 → 1 800
--
--   Les prix fixes du corridor (corridor_prices) ne sont pas modifiés.
-- ============================================================

update public.pricing_tiers
   set base_fcfa       = 500,
       min_course_fcfa = 500,
       updated_at      = now()
 where category = 'essentiel';

update public.pricing_tiers
   set base_fcfa       = 700,
       min_course_fcfa = 700,
       updated_at      = now()
 where category = 'confort';

update public.pricing_tiers
   set base_fcfa       = 950,
       min_course_fcfa = 950,
       updated_at      = now()
 where category = 'premium';

-- Contrôle : prix de chaque catégorie sur le trajet de référence
-- (points en ville, hors checkpoints corridor). Attendu :
--   moto 450 · tricycle 850 · essentiel 1 000 · confort 1 350 · premium 1 800
select c.category,
       (select q.price_total_fcfa
          from public.compute_price(6.40, 2.40, 6.43, 2.43, 6.09, 17,
                                    c.category::vehicle_category, false, false) q
         limit 1) as prix_fcfa
  from (values ('moto'), ('tricycle'), ('essentiel'), ('confort'), ('premium')) as c(category);

-- Contrôle : grille complète après migration
select category, base_fcfa, km_city_fcfa, km_corridor_fcfa, min_fcfa, min_course_fcfa
  from public.pricing_tiers
 order by category;
