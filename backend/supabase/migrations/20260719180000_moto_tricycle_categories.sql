-- ============================================================
-- Ajout des catégories Moto et Tricycle + tarifs marché Bénin.
-- ============================================================

alter type vehicle_category add value if not exists 'moto';
alter type vehicle_category add value if not exists 'tricycle';
