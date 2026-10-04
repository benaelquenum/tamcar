-- Nouveaux types de mouvements de portefeuille (migration séparée : une valeur d'enum
-- ajoutée ne peut pas être utilisée dans la même transaction).
alter type wallet_tx_type add value if not exists 'tamassur_from_rachat';
alter type wallet_tx_type add value if not exists 'performance_bonus';
