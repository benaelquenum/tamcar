-- ============================================================
-- TamCar — Régularisation de la dette chauffeur (2026-07-29)  [Phase 2]
--
--   Quand le wallet Revenus est négatif (dette = commissions de courses
--   encaissées en direct, cf Phase 1), le chauffeur régularise par Mobile
--   Money. Crédite le wallet Revenus du montant réglé (borné à la dette),
--   type 'debt_settlement'.
--
--   ⚠️ Collecte Mobile Money RÉELLE (FeexPay) NON encore branchée — comme
--   la recharge client `topup_tamcar_credit` (v1 simulée). Quand FeexPay
--   sera intégré : la collecte confirmée par webhook devra précéder ce
--   crédit (ici on crédite directement, MVP).
-- ============================================================

alter type wallet_tx_type add value if not exists 'debt_settlement';

create or replace function public.settle_driver_debt(
  p_amount int,
  p_provider mobile_money_provider default 'internal'
)
returns public.wallet_transactions
language plpgsql security definer set search_path = public as $fn$
declare
  v_driver_id uuid;
  w_id uuid;
  v_bal int;
  v_debt int;
  v_amount int;
  tx public.wallet_transactions;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select id into v_driver_id from public.drivers where profile_id = auth.uid();
  if v_driver_id is null then raise exception 'not_a_driver'; end if;

  select id, balance_fcfa into w_id, v_bal from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus'
   for update;
  if w_id is null then raise exception 'Wallet Revenus introuvable'; end if;

  v_debt := greatest(0, -v_bal);                 -- dette = solde négatif
  if v_debt <= 0 then raise exception 'Aucune dette a regler'; end if;

  v_amount := least(greatest(coalesce(p_amount, v_debt), 1), v_debt);  -- borné [1, dette]

  update public.wallets
   set balance_fcfa = balance_fcfa + v_amount, updated_at = now()
   where id = w_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status)
   values (w_id, 'debt_settlement', v_amount, p_provider, 'success')
   returning * into tx;

  return tx;
end;
$fn$;

revoke execute on function public.settle_driver_debt(int, mobile_money_provider) from public, anon;
grant execute on function public.settle_driver_debt(int, mobile_money_provider) to authenticated;
