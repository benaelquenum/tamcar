-- ============================================================
-- TamCar — VIP : 2 000 F sur le trajet de référence (2026-09-30)
--
--   Décision Terence : la catégorie VIP (enum 'premium') coûte 2 000 F
--   pour le trajet de 6,1 km relevé le 30/09/2026 (contre 2 600 F).
--
--   Le calcul reste celui de compute_price (aucune modification de code) :
--     total = max( base + max(km_en_plus × tarif_km, min_en_plus × tarif_min),
--                  min_course ), arrondi au 50 F supérieur.
--   Seule la ligne 'premium' de pricing_tiers change ; les autres catégories
--   ne sont pas touchées.
--
--   Avant  : base 1 500 · ville 200 · corridor 350 · 80 F/min · min 1 500
--            (VIP ≈ Confort × 1,67 sur tous les trajets)
--   Après  : base 1 150 · ville 180 · corridor 270 · 60 F/min · min 1 150
--            (VIP ≈ Confort × 1,27 sur tous les trajets)
--
--   Vérification 6,09 km / 17 min : 1 150 + max(ceil(3,09 × 270) = 835 ;
--   12 × 60 = 720) = 1 985 → arrondi 2 000 F. Le résultat reste 2 000 F
--   pour toute durée de 15 à 19 min.
-- ============================================================

update public.pricing_tiers
   set base_fcfa        = 1150,
       km_city_fcfa     = 180,
       km_corridor_fcfa = 270,
       min_fcfa         = 60,
       min_course_fcfa  = 1150,
       updated_at       = now()
 where category = 'premium';

-- Contrôle : prix de chaque catégorie sur le trajet de référence
-- (points en ville, hors checkpoints corridor). Attendu :
--   moto 450 · tricycle 850 · essentiel 1 200 · confort 1 550 · premium 2 000
select c.category,
       (select q.price_total_fcfa
          from public.compute_price(6.40, 2.40, 6.43, 2.43, 6.09, 17,
                                    c.category::vehicle_category, false, false) q
         limit 1) as prix_fcfa
  from (values ('moto'), ('tricycle'), ('essentiel'), ('confort'), ('premium')) as c(category);
