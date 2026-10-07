-- ============================================================
-- TamCar — Règlement de dette chauffeur par Mobile Money (FedaPay) (2026-10-07)
--
--   Jusqu'ici le chauffeur ne pouvait régler sa dette que par une fonction « test » gratuite (settle_driver_debt, désactivée au
--   lancement) ou en remettant l'argent à TamCar (admin_record_debt_payment). Ce RPC crée une transaction « en attente » sur son
--   portefeuille Revenus ; le webhook FedaPay (apply_fedapay_success, inchangé) la valide, crédite le portefeuille, et le garde-fou
--   de dette réactive le compte tout seul. Même mécanique que la recharge client (initiate_fedapay_topup).
--   Le montant minimum est celui de FedaPay (100 F) : une dette inférieure peut être réglée en arrondissant à 100 F (l'excédent
--   reste positif sur Revenus et se compense avec les commissions suivantes).
-- ============================================================
create or replace function public.initiate_fedapay_debt(p_amount_fcfa int)
returns table (transaction_id uuid, reference text, amount_fcfa int)
language plpgsql security definer set search_path = public as $fn$
declare
  v_driver uuid;
  v_wallet uuid;
  v_bal int;
  v_debt int;
  v_tx uuid;
  v_ref text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_driver from public.drivers where profile_id = auth.uid();
  if v_driver is null then raise exception 'not_a_driver'; end if;

  select id, balance_fcfa into v_wallet, v_bal from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus';
  if v_wallet is null then raise exception 'Wallet Revenus introuvable'; end if;

  v_debt := greatest(0, -v_bal);
  if v_debt <= 0 then raise exception 'Aucune dette a regler'; end if;
  if p_amount_fcfa is null or p_amount_fcfa < 100 then raise exception 'Montant minimum : 100 F'; end if;
  if p_amount_fcfa > greatest(v_debt, 100) then raise exception 'Le montant depasse votre dette (% F)', v_debt; end if;

  v_ref := 'FDP-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, status, fedapay_reference)
  values (v_wallet, 'debt_settlement', p_amount_fcfa, 'pending', v_ref)
  returning id into v_tx;

  return query select v_tx, v_ref, p_amount_fcfa;
end;
$fn$;
revoke execute on function public.initiate_fedapay_debt(int) from public, anon;
grant execute on function public.initiate_fedapay_debt(int) to authenticated;
