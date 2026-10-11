-- Décision de Terence (2026-10-11) : le prélèvement « maintien en flotte » s'applique à TOUS les véhicules, motos et tricycles compris
-- (30 ‰ du volume du mois sur le fonds de rachat, comme pour les voitures). Le fonds reçoit la même part pour toutes les catégories.
update public.program_rules set value = 30 where key in ('upkeep_permille_moto', 'upkeep_permille_tricycle');
update public.program_rules
   set label = 'Maintien en flotte : prélèvement mensuel sur le fonds de rachat, moto (en ‰ du volume : 30 = 3 %)'
 where key = 'upkeep_permille_moto';
update public.program_rules
   set label = 'Maintien en flotte : prélèvement mensuel sur le fonds de rachat, tricycle (en ‰ du volume : 30 = 3 %)'
 where key = 'upkeep_permille_tricycle';
