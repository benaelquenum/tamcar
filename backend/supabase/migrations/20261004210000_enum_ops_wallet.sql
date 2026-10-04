-- Portefeuille du responsable opérations (migration séparée de l'usage des nouvelles valeurs d'enum).
alter type wallet_kind add value if not exists 'tamcar_ops';
alter type wallet_tx_type add value if not exists 'ops_commission';
alter type wallet_tx_type add value if not exists 'ops_payout';
