-- ============================================================
-- TamCar — Recharge TamCar Crédit via FedaPay (2026-07-24)
--
-- ⚠️  Les 3 RPC (initiate_fedapay_topup / apply_fedapay_success /
--     apply_fedapay_declined) EXISTENT DÉJÀ EN PROD (créées ad-hoc via
--     l'éditeur SQL) et la recharge FONCTIONNE. On ne les redéfinit donc
--     PAS ici : create-or-replace écraserait le comportement de prod, et
--     le type de retour d'initiate_fedapay_topup diffère de toute façon.
--
--     Cette migration ne fait que garantir (idempotent) les colonnes de
--     suivi + l'index, pour qu'un rebuild à froid parte sur une base saine.
--
--     👉 Les définitions EXACTES des 3 fonctions seront capturées depuis
--        la prod (pg_get_functiondef) et ajoutées ici, afin que le version
--        control reflète fidèlement ce qui tourne. Tant que ce n'est pas
--        fait, un environnement neuf n'aura pas ces fonctions — la prod, si.
-- ============================================================

alter table public.wallet_transactions
  add column if not exists fedapay_reference text,
  add column if not exists fedapay_transaction_id text;

create unique index if not exists wallet_tx_fedapay_ref_uidx
  on public.wallet_transactions (fedapay_reference)
  where fedapay_reference is not null;
