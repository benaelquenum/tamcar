-- ============================================================
-- TamCar — Wallet operations (2026-07-15)
--
-- topup_tamcar_credit : simule une recharge Mobile Money (v1 sans API)
-- withdraw_tamcar_revenus : simule un retrait chauffeur (v1 sans API)
-- my_wallets : liste les wallets du user connecté avec balance
-- wallet_transactions_for_user : historique paginé
-- ============================================================

create or replace function public.topup_tamcar_credit(
  amount_fcfa int,
  provider mobile_money_provider default 'internal'
)
returns public.wallet_transactions
language plpgsql security invoker as $$
declare
  w_id uuid;
  tx public.wallet_transactions;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if amount_fcfa < 100 or amount_fcfa > 500000 then
    raise exception 'Montant invalide (100 - 500 000 FCFA)';
  end if;

  select id into w_id from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_credit';
  if w_id is null then raise exception 'Wallet TamCar Crédit introuvable'; end if;

  update public.wallets
   set balance_fcfa = balance_fcfa + amount_fcfa, updated_at = now()
   where id = w_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status)
   values (w_id, 'topup', amount_fcfa, provider, 'success')
   returning * into tx;

  return tx;
end;
$$;

comment on function public.topup_tamcar_credit is
  'Simule recharge TamCar Crédit (v1 sans intégration Mobile Money réelle).';

-- ------------------------------------------------------------
-- withdraw_tamcar_revenus : chauffeur retire du wallet revenus vers Mobile Money
-- ------------------------------------------------------------
create or replace function public.withdraw_tamcar_revenus(
  amount_fcfa int,
  provider mobile_money_provider default 'internal'
)
returns public.wallet_transactions
language plpgsql security invoker as $$
declare
  w_id uuid;
  balance int;
  tx public.wallet_transactions;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if amount_fcfa < 500 or amount_fcfa > 500000 then
    raise exception 'Montant invalide (500 - 500 000 FCFA)';
  end if;

  select id, balance_fcfa into w_id, balance from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus';
  if w_id is null then raise exception 'Wallet TamCar Revenus introuvable'; end if;
  if balance < amount_fcfa then
    raise exception 'Solde insuffisant (% F disponibles)', balance;
  end if;

  update public.wallets
   set balance_fcfa = balance_fcfa - amount_fcfa, updated_at = now()
   where id = w_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status)
   values (w_id, 'withdrawal', amount_fcfa, provider, 'success')
   returning * into tx;

  return tx;
end;
$$;

-- ------------------------------------------------------------
-- my_wallets : les wallets du user avec balance
-- ------------------------------------------------------------
create or replace function public.my_wallets()
returns table (
  id uuid,
  kind wallet_kind,
  balance_fcfa int
)
language sql stable security invoker as $$
  select id, kind, balance_fcfa
  from public.wallets
  where profile_id = auth.uid()
  order by
    case kind
      when 'tamcar_credit'  then 1
      when 'tamcar_revenus' then 2
      when 'tamcar_rachat'  then 3
    end;
$$;

-- ------------------------------------------------------------
-- wallet_transactions_for_user : historique paginé
-- ------------------------------------------------------------
create or replace function public.wallet_transactions_for_user(
  limit_count int default 50
)
returns table (
  id uuid,
  wallet_kind wallet_kind,
  type wallet_tx_type,
  amount_fcfa int,
  provider mobile_money_provider,
  status wallet_tx_status,
  ride_id uuid,
  created_at timestamptz
)
language sql stable security invoker as $$
  select
    wt.id,
    w.kind as wallet_kind,
    wt.type,
    wt.amount_fcfa,
    wt.provider,
    wt.status,
    wt.ride_id,
    wt.created_at
  from public.wallet_transactions wt
  join public.wallets w on w.id = wt.wallet_id
  where w.profile_id = auth.uid()
  order by wt.created_at desc
  limit greatest(limit_count, 1);
$$;
