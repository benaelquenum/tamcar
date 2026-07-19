-- ============================================================
-- Phase 1 (partie 1/2) : extension des enums de statut pour supporter
-- l'archivage (soft-delete) et l'attente d'activation des véhicules.
-- ============================================================

alter type driver_status add value if not exists 'archived';
alter type vehicle_status add value if not exists 'pending';
alter type vehicle_status add value if not exists 'archived';
