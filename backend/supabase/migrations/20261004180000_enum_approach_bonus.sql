-- Nouveau type de mouvement de portefeuille : prime d'approche (migration séparée de l'usage).
alter type wallet_tx_type add value if not exists 'approach_bonus';
