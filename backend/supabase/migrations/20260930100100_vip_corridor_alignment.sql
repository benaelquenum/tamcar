-- ============================================================
-- TamCar — VIP : aligner le prix fixe du corridor (2026-09-30)
-- Validé par Terence le 2026-10-02 ; prix de nuit = prix de jour (décision du même jour).
--
--   Avec la grille VIP (20260930100000) puis le minimum voiture à −200 F
--   (20261001100000), un trajet de 30 km au compteur coûte
--   950 + 27 × 270 = 8 240 → 8 250 F. Le prix fixe VIP
--   du corridor Cotonou ↔ Porto-Novo (9 000 F jour) serait donc SUPÉRIEUR
--   au prix au compteur : le « prix garanti » deviendrait un surcoût.
--
--   Rapport prix fixe / prix au compteur sur 30 km :
--     Essentiel 4 500 / 4 850 = −7 %   ·   Confort 6 000 / 6 400 = −6 %
--   Prix VIP retenu : 7 500 F, jour ET nuit (−9 % vs compteur, pas de majoration de nuit).
--   Rapport VIP / Confort : 7 500 / 6 000 = 1,25, cohérent avec le ×1,27 de la grille.
-- ============================================================

update public.corridor_prices
   set price_day_fcfa   = 7500,
       price_night_fcfa = 7500
 where category = 'premium';

select category, price_day_fcfa, price_night_fcfa
  from public.corridor_prices
 order by category;
