-- Produits de senteur : nouveau type de transaction (à valider avant la migration suivante, qui l'utilise).
alter type public.wallet_tx_type add value if not exists 'senteur_fee';
