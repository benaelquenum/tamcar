-- Retraits chauffeur : virement automatique FedaPay derrière un réglage (2026-10-07)
--
-- Les clés FedaPay sont configurées en production, mais le circuit de retrait n'avait jamais fonctionné de bout en bout
-- (request_driver_payout n'existait pas en base avant la revue du 2026-10-07). Laisser la fonction fedapay-payout émettre de
-- vrais virements dès maintenant serait risqué : par défaut, les retraits sont payés à la main par l'équipe
-- (/admin/retraits). À passer à 1 quand un retrait de test en sandbox / petit montant réel a été validé de bout en bout.
insert into public.program_rules (key, value, label) values
  ('payouts_auto', 0,
   'Retraits chauffeur : 1 = virement automatique FedaPay (à activer après un test validé), 0 = payés à la main par l''équipe depuis Retraits chauffeur')
on conflict (key) do nothing;
