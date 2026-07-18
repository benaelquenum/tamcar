-- ============================================================
-- Fix double crédit "revenue_share_credit" par course.
--
-- Cause : credit_wallets_on_ride_complete insère 2 lignes avec
-- type='revenue_share_credit' — une pour la part chauffeur, une
-- pour la part dealer_partner. Quand driver et dealer_partner
-- pointent sur le même profile (cas tests / auto-flotte), le
-- même wallet reçoit 2 lignes → analytics faussées.
--
-- Solution : la part dealer utilise désormais un type dédié
-- 'dealer_share_credit'. Solde inchangé, comptabilité claire.
-- ============================================================

alter type wallet_tx_type add value if not exists 'dealer_share_credit';
