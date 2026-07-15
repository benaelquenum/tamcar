-- ============================================================
-- TamCar — Extend enums pour pricing & ops (2026-07-15)
--
-- Fichier séparé de la migration métier suivante car PostgreSQL exige
-- que ALTER TYPE ... ADD VALUE soit commité avant d'être utilisé dans
-- la même transaction (contrainte pre-PG12, mais aussi bonne pratique).
-- ============================================================

-- Nouvelle catégorie de véhicule
create type vehicle_category as enum ('essentiel', 'confort', 'premium');

-- Extension wallet_kind pour le fonds rachat cession échelonnée
alter type wallet_kind add value if not exists 'tamcar_rachat';

-- Extensions wallet_tx_type pour les nouveaux flux
alter type wallet_tx_type add value if not exists 'rachat_credit';
alter type wallet_tx_type add value if not exists 'cancellation_fee';
alter type wallet_tx_type add value if not exists 'cancellation_reimbursement';
