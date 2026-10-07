-- Types de transaction du versement quotidien (à passer SEUL : une valeur d'enum ne peut pas servir dans la même transaction).
alter type wallet_tx_type add value if not exists 'floor_topup';
alter type wallet_tx_type add value if not exists 'floor_refund';
