-- ============================================================
-- Réajustement tarifs Moto et Tricycle (marché Bénin réel).
-- ============================================================
--
-- Nouveaux tarifs :
--   Moto     : base 100 F (couvre 1 km, 3 min), 30 F/km ville, 60 F/km corridor.
--              → 5 km ≈ 250 F, 8 km ≈ 340 F.
--   Tricycle : base 300 F (couvre 2 km, 4 min), 55 F/km ville, 100 F/km corridor.
--              → 5 km ≈ 465 F, 7 km ≈ 685 F, 10 km ≈ 850 F.
--
-- Note : la course minimum reste 200 F (Moto) et 350 F (Tricycle) pour couvrir
-- les frais fixes du chauffeur.

update public.pricing_tiers set
  base_fcfa = 100,
  base_covers_km = 1.0,
  base_covers_min = 3,
  km_city_fcfa = 30,
  km_corridor_fcfa = 60,
  min_fcfa = 10,
  min_course_fcfa = 200,
  updated_at = now()
where category = 'moto';

update public.pricing_tiers set
  base_fcfa = 300,
  base_covers_km = 2.0,
  base_covers_min = 4,
  km_city_fcfa = 55,
  km_corridor_fcfa = 100,
  min_fcfa = 20,
  min_course_fcfa = 350,
  updated_at = now()
where category = 'tricycle';
