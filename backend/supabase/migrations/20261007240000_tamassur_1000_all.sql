-- ============================================================
-- TamCar — TamAssur : cotisation de 1 000 F par jour pour TOUS les véhicules (2026-10-07, décision de Terence)
--
--   NSIA refuse les cotisations de 500 F par personne : le minimum est 1 000 F par jour et par personne. Moto et tricycle
--   passent donc de 500 / 750 F à 1 000 F (portée par le plancher de versement : +1 000 F, soit 3 500 F au lieu de 2 500 F pour
--   la moto). Les seuils de retrait (25 jours x mois x cotisation) deviennent : moto 12 mois = 300 000 F ; tricycle et voitures
--   24 mois = 600 000 F. Le montant effectif d'un chauffeur reste max(minimum de sa catégorie, son choix) : aucune ligne à migrer.
-- ============================================================
update public.program_rules set value = 1000 where key in ('tamassur_moto', 'tamassur_tricycle');
update public.program_rules set label = 'TamAssur : cotisation quotidienne moto (F) — 1 000 F minimum imposé par NSIA'  where key = 'tamassur_moto';
update public.program_rules set label = 'TamAssur : cotisation quotidienne tricycle (F) — 1 000 F minimum imposé par NSIA' where key = 'tamassur_tricycle';
