-- ============================================================
-- TamCar — Retrait de l'épargne TamAssur (2026-07-29)  [Phase 5]
--
--   Le chauffeur peut demander le retrait de son épargne TamAssur
--   UNIQUEMENT quand la poche `tamcar_epargne` atteint 600 000 F.
--   La demande crée une ligne tracée + débite (réserve) la poche, et
--   TamCar règle MANUELLEMENT (espèces ou Mobile Money) SOUS 30 JOURS.
-- ============================================================

alter type wallet_tx_type add value if not exists 'tamassur_withdrawal';

-- Demandes de retrait épargne (règlement manuel par TamCar)
create table if not exists public.tamassur_withdrawals (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  amount_fcfa int not null check (amount_fcfa > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  method text,                                   -- 'cash' | 'mobile_money' (au paiement)
  requested_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '30 days'),
  paid_at timestamptz,
  notes text
);

create index if not exists tamassur_withdrawals_driver_idx
  on public.tamassur_withdrawals (driver_id, requested_at desc);

alter table public.tamassur_withdrawals enable row level security;

drop policy if exists tamassur_withdrawals_select on public.tamassur_withdrawals;
create policy tamassur_withdrawals_select on public.tamassur_withdrawals
  for select using (
    driver_id in (select id from public.drivers where profile_id = auth.uid())
    or public.is_admin()
  );

-- Demande de retrait (déblocage à 600 000 F) --------------------------
create or replace function public.request_tamassur_withdrawal(p_amount int)
returns public.tamassur_withdrawals
language plpgsql security definer set search_path = public as $fn$
declare
  v_driver_id uuid;
  w_id uuid;
  v_bal int;
  v_amount int;
  rec public.tamassur_withdrawals;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_driver_id from public.drivers where profile_id = auth.uid();
  if v_driver_id is null then raise exception 'not_a_driver'; end if;

  if exists (
    select 1 from public.tamassur_withdrawals
     where driver_id = v_driver_id and status = 'pending'
  ) then
    raise exception 'Une demande de retrait est deja en cours.';
  end if;

  select id, balance_fcfa into w_id, v_bal from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_epargne'
   for update;
  if w_id is null then raise exception 'Poche Epargne introuvable'; end if;

  if v_bal < 600000 then
    raise exception 'Retrait debloque a partir de 600 000 F (solde: % F).', v_bal;
  end if;

  v_amount := least(greatest(coalesce(p_amount, v_bal), 1), v_bal);  -- borné [1, solde]

  update public.wallets
   set balance_fcfa = balance_fcfa - v_amount, updated_at = now()
   where id = w_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status)
   values (w_id, 'tamassur_withdrawal', v_amount, 'internal', 'success');

  insert into public.tamassur_withdrawals (driver_id, amount_fcfa)
   values (v_driver_id, v_amount)
   returning * into rec;

  return rec;
end;
$fn$;

revoke execute on function public.request_tamassur_withdrawal(int) from public, anon;
grant execute on function public.request_tamassur_withdrawal(int) to authenticated;

-- Lecture côté chauffeur ---------------------------------------------
create or replace function public.my_tamassur_withdrawals()
returns setof public.tamassur_withdrawals
language sql stable security definer set search_path = public as $fn$
  select * from public.tamassur_withdrawals
  where driver_id in (select id from public.drivers where profile_id = auth.uid())
  order by requested_at desc
  limit 12;
$fn$;
grant execute on function public.my_tamassur_withdrawals to authenticated;

-- Admin : liste + marquer payé ---------------------------------------
create or replace function public.admin_tamassur_withdrawals()
returns table (
  id uuid,
  driver_id uuid,
  full_name text,
  phone text,
  amount_fcfa int,
  status text,
  requested_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  method text
)
language sql stable security definer set search_path = public as $fn$
  select w.id, w.driver_id, p.full_name, p.phone,
         w.amount_fcfa, w.status, w.requested_at, w.due_at, w.paid_at, w.method
  from public.tamassur_withdrawals w
  join public.drivers d on d.id = w.driver_id
  join public.profiles p on p.id = d.profile_id
  where (select public.is_admin())
  order by (w.status = 'pending') desc, w.requested_at desc;
$fn$;
grant execute on function public.admin_tamassur_withdrawals to authenticated;

create or replace function public.admin_mark_tamassur_paid(p_id uuid, p_method text default 'cash')
returns public.tamassur_withdrawals
language plpgsql security definer set search_path = public as $fn$
declare
  rec public.tamassur_withdrawals;
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  update public.tamassur_withdrawals
     set status = 'paid', method = p_method, paid_at = now()
   where id = p_id and status = 'pending'
   returning * into rec;
  if rec.id is null then raise exception 'Demande introuvable ou deja traitee'; end if;
  return rec;
end;
$fn$;

revoke execute on function public.admin_mark_tamassur_paid(uuid, text) from public, anon;
grant execute on function public.admin_mark_tamassur_paid(uuid, text) to authenticated;
