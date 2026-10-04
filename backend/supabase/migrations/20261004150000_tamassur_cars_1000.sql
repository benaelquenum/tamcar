-- Décision de Terence (2026-10-04) : toutes les voitures cotisent 1 000 F par jour (TamAssur),
-- quelle que soit la catégorie ; moto 500 F et tricycle 750 F inchangés.
-- Pour tous : 50 % payés par le chauffeur, 50 % prélevés sur le fonds de rachat.
-- NSIA a confirmé qu'elle accepte des cotisations différentes selon la ligne.
update public.program_rules set value = 1000, updated_at = now() where key in ('tamassur_confort', 'tamassur_premium');
update public.program_rules set label = 'TamAssur : cotisation quotidienne voiture Confort (F)' where key = 'tamassur_confort';
update public.program_rules set label = 'TamAssur : cotisation quotidienne voiture VIP (F)' where key = 'tamassur_premium';
