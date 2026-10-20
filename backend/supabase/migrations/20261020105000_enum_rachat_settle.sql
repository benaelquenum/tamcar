-- Sort du fonds de rachat à la fin du contrat d'un chauffeur (contrat de partenariat, article 12) : restitué au chauffeur ou conservé par TamCar (2026-10-20).
-- Valeurs d'enum seules dans leur fichier : elles ne peuvent pas être utilisées dans la même transaction.
alter type public.wallet_tx_type add value if not exists 'rachat_return';
alter type public.wallet_tx_type add value if not exists 'rachat_forfeit';
