-- ============================================================
-- TamCar — Retraits chauffeurs (payouts) via FedaPay (2026-07-24)
--
--   Brique DB SÛRE (aucun argent réel bougé ici — c'est l'Edge Function
--   fedapay-payout qui déclenche le virement). Machine à états :
--     pending  → le wallet revenus est DÉBITÉ immédiatement (réservation)
--     processing → l'Edge Function a lancé le payout FedaPay
--     paid     → payout confirmé (débit définitif)
--     failed   → payout échoué → wallet REMBOURSÉ (réversible)
--
--   Le débit-puis-remboursement-si-échec évite qu'un chauffeur soit
--   débité sans être payé.
-- ============================================================

create table if not exists public.driver_payouts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  amount_fcfa int not null check (amount_fcfa > 0),
  provider mobile_money_provider not null,
  msisdn text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed')),
  wallet_tx_id uuid references public.wallet_transactions(id) on delete set null,
  fedapay_payout_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_payouts_driver_idx on public.driver_payouts (driver_id, created_at desc);
create index if not exists driver_payouts_status_idx on public.driver_payouts (status);

alter table public.driver_payouts enable row level security;

drop policy if exists driver_payouts_select on public.driver_payouts;
create policy driver_payouts_select on public.driver_payouts for select
  using (profile_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- request_driver_payout : le chauffeur demande un retrait.
--   Débite (réserve) le wallet revenus + crée un payout 'pending'.
--   Renvoie la ligne payout (id + msisdn) que l'Edge Function traitera.
-- ------------------------------------------------------------
create or replace function public.request_driver_payout(
  p_amount_fcfa int,
  p_provider mobile_money_provider,
  p_msisdn text default null
)
returns public.driver_payouts
language plpgsql security definer set search_path = public as $fn_req$
declare
  v_driver record;
  v_wallet record;
  v_msisdn text;
  v_tx public.wallet_transactions;
  v_payout public.driver_payouts;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_provider not in ('mtn', 'moov') then raise exception 'Opérateur invalide (mtn / moov)'; end if;
  if p_amount_fcfa < 500 or p_amount_fcfa > 500000 then
    raise exception 'Montant invalide (500 - 500 000 FCFA)';
  end if;

  select d.id, d.profile_id, p.phone into v_driver
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where d.profile_id = auth.uid() and d.status = 'active';
  if v_driver.id is null then raise exception 'Compte chauffeur introuvable ou inactif'; end if;

  v_msisdn := coalesce(nullif(trim(p_msisdn), ''), v_driver.phone);
  if v_msisdn is null or length(regexp_replace(v_msisdn, '\D', '', 'g')) < 8 then
    raise exception 'Numéro Mobile Money invalide';
  end if;

  -- Un seul retrait en cours à la fois
  if exists (select 1 from public.driver_payouts
             where driver_id = v_driver.id and status in ('pending', 'processing')) then
    raise exception 'Un retrait est déjà en cours de traitement';
  end if;

  select id, balance_fcfa into v_wallet from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus'
   for update;
  if v_wallet.id is null then raise exception 'Wallet TamCar Revenus introuvable'; end if;
  if v_wallet.balance_fcfa < p_amount_fcfa then
    raise exception 'Solde insuffisant (% F disponibles)', v_wallet.balance_fcfa;
  end if;

  -- Réservation : débit immédiat (remboursé si le payout échoue)
  update public.wallets
     set balance_fcfa = balance_fcfa - p_amount_fcfa, updated_at = now()
   where id = v_wallet.id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
  values (v_wallet.id, 'withdrawal', -p_amount_fcfa, p_provider, 'pending',
          jsonb_build_object('kind', 'fedapay_payout'))
  returning * into v_tx;

  insert into public.driver_payouts (driver_id, profile_id, amount_fcfa, provider, msisdn, wallet_tx_id)
  values (v_driver.id, v_driver.profile_id, p_amount_fcfa, p_provider, v_msisdn, v_tx.id)
  returning * into v_payout;

  return v_payout;
end;
$fn_req$;

revoke all on function public.request_driver_payout(int, mobile_money_provider, text) from public, anon;
grant execute on function public.request_driver_payout(int, mobile_money_provider, text) to authenticated;

-- ------------------------------------------------------------
-- mark_payout_processing : l'Edge Function a lancé le virement FedaPay.
-- ------------------------------------------------------------
create or replace function public.mark_payout_processing(p_payout_id uuid, p_fedapay_payout_id text)
returns void
language plpgsql security definer set search_path = public as $fn_proc$
begin
  update public.driver_payouts
     set status = 'processing', fedapay_payout_id = p_fedapay_payout_id, updated_at = now()
   where id = p_payout_id and status = 'pending';
end;
$fn_proc$;
revoke all on function public.mark_payout_processing(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payout_processing(uuid, text) to service_role;

-- ------------------------------------------------------------
-- confirm_driver_payout : virement FedaPay réussi → débit définitif.
-- ------------------------------------------------------------
create or replace function public.confirm_driver_payout(p_payout_id uuid, p_fedapay_payout_id text default null)
returns void
language plpgsql security definer set search_path = public as $fn_ok$
declare v_payout public.driver_payouts;
begin
  select * into v_payout from public.driver_payouts where id = p_payout_id for update;
  if not found then raise exception 'Payout introuvable'; end if;
  if v_payout.status = 'paid' then return; end if;               -- idempotent
  if v_payout.status = 'failed' then raise exception 'Payout déjà échoué'; end if;

  update public.driver_payouts
     set status = 'paid',
         fedapay_payout_id = coalesce(p_fedapay_payout_id, fedapay_payout_id),
         updated_at = now()
   where id = p_payout_id;

  if v_payout.wallet_tx_id is not null then
    update public.wallet_transactions set status = 'success' where id = v_payout.wallet_tx_id;
  end if;
end;
$fn_ok$;
revoke all on function public.confirm_driver_payout(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_driver_payout(uuid, text) to service_role;

-- ------------------------------------------------------------
-- fail_driver_payout : virement échoué → REMBOURSE le wallet.
-- ------------------------------------------------------------
create or replace function public.fail_driver_payout(p_payout_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $fn_fail$
declare
  v_payout public.driver_payouts;
  v_wallet_id uuid;
begin
  select * into v_payout from public.driver_payouts where id = p_payout_id for update;
  if not found then raise exception 'Payout introuvable'; end if;
  if v_payout.status in ('failed', 'paid') then return; end if;  -- idempotent / non réversible

  -- Rembourse le wallet revenus
  select w.id into v_wallet_id from public.wallets w
   join public.wallet_transactions t on t.wallet_id = w.id
   where t.id = v_payout.wallet_tx_id;
  if v_wallet_id is not null then
    update public.wallets set balance_fcfa = balance_fcfa + v_payout.amount_fcfa, updated_at = now()
     where id = v_wallet_id;
    update public.wallet_transactions set status = 'failed' where id = v_payout.wallet_tx_id;
  end if;

  update public.driver_payouts
     set status = 'failed', failure_reason = p_reason, updated_at = now()
   where id = p_payout_id;

  perform public._push_notify(
    v_payout.profile_id, 'Retrait échoué',
    'Ton retrait de ' || v_payout.amount_fcfa || ' F n''a pas abouti — le montant a été recrédité sur tes revenus.',
    '/wallet', 'payout-failed:' || p_payout_id::text, true
  );
end;
$fn_fail$;
revoke all on function public.fail_driver_payout(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_driver_payout(uuid, text) to service_role;

-- ------------------------------------------------------------
-- my_driver_payouts : historique des retraits du chauffeur.
-- ------------------------------------------------------------
create or replace function public.my_driver_payouts(p_limit int default 20)
returns table (id uuid, amount_fcfa int, provider mobile_money_provider, msisdn text, status text, failure_reason text, created_at timestamptz)
language sql stable security definer set search_path = public as $fn_list$
  select id, amount_fcfa, provider, msisdn, status, failure_reason, created_at
  from public.driver_payouts
  where profile_id = auth.uid()
  order by created_at desc
  limit greatest(p_limit, 1);
$fn_list$;
grant execute on function public.my_driver_payouts to authenticated;
