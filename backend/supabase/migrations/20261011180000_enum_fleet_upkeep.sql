-- Nouveau type de mouvement de portefeuille : prélèvement mensuel « maintien en flotte » sur le fonds de rachat (2026-10-11).
-- À appliquer SEUL (une valeur d'énumération ajoutée ne s'utilise qu'après validation de la transaction).
alter type public.wallet_tx_type add value if not exists 'fleet_upkeep_fee';
