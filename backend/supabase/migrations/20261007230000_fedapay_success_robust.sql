-- ============================================================
-- TamCar — Crédit d'un paiement FedaPay : verrou, et « refusé puis approuvé » (2026-10-07)
--
--   Constats de l'essai sandbox :
--   1. FedaPay a décliné PUIS approuvé la même transaction (second essai dans la fenêtre de paiement, 8 s d'écart). La ligne
--      avait déjà été marquée « failed » : apply_fedapay_success la refusait (« Transaction non éligible ») alors que l'argent
--      était encaissé. L'état « approuvé » de FedaPay est définitif : on accepte maintenant pending ET failed.
--   2. Le webhook et la vérification directe peuvent arriver en même temps : sans verrou, deux appels lisaient « pending »
--      et créditaient deux fois. La ligne est maintenant verrouillée (for update) : le second appel voit « success » et sort.
--   Droits inchangés (service_role seulement, migration 20261007120000).
-- ============================================================
create or replace function public.apply_fedapay_success(p_reference text, p_fedapay_transaction_id text, p_amount_fcfa integer)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  tx public.wallet_transactions;
begin
  select * into tx from public.wallet_transactions where fedapay_reference = p_reference for update;
  if tx is null then raise exception 'Transaction reference introuvable'; end if;
  if tx.status = 'success' then return; end if;
  if tx.status not in ('pending', 'failed') then raise exception 'Transaction non eligible'; end if;
  if tx.amount_fcfa <> p_amount_fcfa then
    raise exception 'Montant incoherent (attendu %, recu %)', tx.amount_fcfa, p_amount_fcfa;
  end if;

  update public.wallet_transactions
     set status = 'success',
         fedapay_transaction_id = p_fedapay_transaction_id
   where id = tx.id;

  update public.wallets
     set balance_fcfa = balance_fcfa + p_amount_fcfa,
         updated_at = now()
   where id = tx.wallet_id;
end;
$fn$;
