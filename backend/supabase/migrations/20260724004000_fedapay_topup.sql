-- ============================================================
-- TamCar — Recharge TamCar Crédit via FedaPay (2026-07-24)
--
-- ⚠️  RECONSTRUCTION VERSIONNÉE d'objets créés ad-hoc en prod.
--     Les RPC initiate_fedapay_topup / apply_fedapay_success /
--     apply_fedapay_declined et la colonne fedapay_reference étaient
--     référencés par le front + le webhook mais n'existaient dans
--     AUCUNE migration. Ce fichier les capture dans le version control.
--
--     Contrat reconstruit à partir de :
--       - apps/client/src/lib/fedapay.ts
--       - apps/client/src/app/wallet/WalletModals.tsx  (initiate + polling)
--       - backend/supabase/functions/fedapay-webhook/index.ts (apply_*)
--
--     Idempotent : add column if not exists + create or replace.
--     AVANT de l'appliquer en prod, dumper les définitions actuelles
--     (voir bloc diagnostic fourni séparément) et comparer.
-- ============================================================

-- 1. Colonnes de suivi FedaPay sur wallet_transactions ---------
alter table public.wallet_transactions
  add column if not exists fedapay_reference text,
  add column if not exists fedapay_transaction_id text;

-- Unicité de la référence + lookup rapide (webhook + polling client)
create unique index if not exists wallet_tx_fedapay_ref_uidx
  on public.wallet_transactions (fedapay_reference)
  where fedapay_reference is not null;

-- 2. initiate_fedapay_topup ------------------------------------
--    Crée une transaction 'pending' sur le wallet TamCar Crédit du
--    user courant et renvoie la référence à passer au widget FedaPay.
create or replace function public.initiate_fedapay_topup(p_amount_fcfa int)
returns table (reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_ref text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_amount_fcfa < 100 or p_amount_fcfa > 500000 then
    raise exception 'Montant invalide (100 - 500 000 FCFA)';
  end if;

  select id into v_wallet_id
    from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_credit';
  if v_wallet_id is null then
    raise exception 'Wallet TamCar Crédit introuvable';
  end if;

  v_ref := 'tamcar_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.wallet_transactions
    (wallet_id, type, amount_fcfa, provider, status, fedapay_reference)
  values
    (v_wallet_id, 'topup', p_amount_fcfa, 'internal', 'pending', v_ref);

  reference := v_ref;
  return next;
end;
$$;

revoke all on function public.initiate_fedapay_topup(int) from public, anon;
grant execute on function public.initiate_fedapay_topup(int) to authenticated;

-- 3. apply_fedapay_success -------------------------------------
--    Appelée par le webhook (service_role) sur 'transaction.approved'.
--    Idempotente : ne crédite que si la transaction est encore 'pending'
--    (webhook rejoué → pas de double crédit). On crédite le montant
--    INITIÉ (source de vérité), pas le montant renvoyé par le webhook.
create or replace function public.apply_fedapay_success(
  p_reference text,
  p_fedapay_transaction_id text,
  p_amount_fcfa int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.wallet_transactions;
begin
  select * into v_tx
    from public.wallet_transactions
   where fedapay_reference = p_reference
   for update;

  if not found then
    raise exception 'Transaction FedaPay introuvable: %', p_reference;
  end if;

  -- Idempotence
  if v_tx.status = 'success' then return; end if;
  if v_tx.status <> 'pending' then return; end if;  -- déjà failed : on ne réactive pas

  update public.wallet_transactions
     set status = 'success',
         fedapay_transaction_id = p_fedapay_transaction_id,
         meta = meta || jsonb_build_object('fedapay_amount', p_amount_fcfa)
   where id = v_tx.id;

  update public.wallets
     set balance_fcfa = balance_fcfa + v_tx.amount_fcfa,
         updated_at = now()
   where id = v_tx.wallet_id;
end;
$$;

revoke all on function public.apply_fedapay_success(text, text, int) from public, anon, authenticated;
grant execute on function public.apply_fedapay_success(text, text, int) to service_role;

-- 4. apply_fedapay_declined ------------------------------------
--    Appelée par le webhook sur declined / canceled / refunded.
create or replace function public.apply_fedapay_declined(
  p_reference text,
  p_fedapay_transaction_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wallet_transactions
     set status = 'failed',
         fedapay_transaction_id = coalesce(p_fedapay_transaction_id, fedapay_transaction_id)
   where fedapay_reference = p_reference
     and status = 'pending';
end;
$$;

revoke all on function public.apply_fedapay_declined(text, text) from public, anon, authenticated;
grant execute on function public.apply_fedapay_declined(text, text) to service_role;
