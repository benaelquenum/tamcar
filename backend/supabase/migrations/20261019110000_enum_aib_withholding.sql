-- Retenue d'AIB (acompte sur impôt assis sur les bénéfices) sur les sommes versées aux partenaires véhicule (2026-10-19).
-- Valeur d'enum seule dans son fichier : elle ne peut pas être utilisée dans la même transaction.
alter type public.wallet_tx_type add value if not exists 'aib_withholding';
