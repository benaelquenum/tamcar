-- Décision de Terence (2026-10-04) : la cotisation TamAssur est entièrement payée par le chauffeur,
-- prélevée sur son portefeuille Revenus ; plus de prélèvement sur le fonds de rachat, plus de part de TamCar.
update public.program_rules
   set value = 0,
       label = 'TamAssur : part de la cotisation prélevée sur le fonds de rachat (%) — 0 = tout sur le portefeuille du chauffeur',
       updated_at = now()
 where key = 'tamassur_fund_pct';
