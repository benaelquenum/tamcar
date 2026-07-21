-- ============================================================
-- Réajustement tarif Tricycle : +100 F sur toutes les courses.
-- Décision Terence 2026-07-21 : les 700 F d'une course type
-- (5 km / 14 min) sont insuffisants pour la marge chauffeur,
-- on remonte à 800 F.
--
-- Méthode : augmenter la base_fcfa de 300 → 400. Effet uniforme
-- sur toutes les distances (évite les effets de bord sur corridor).
-- ============================================================

update public.pricing_tiers set
  base_fcfa = 400,
  updated_at = now()
where category = 'tricycle';
