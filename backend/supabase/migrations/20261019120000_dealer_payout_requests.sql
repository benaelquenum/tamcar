-- ============================================================
-- TamCar — Versements aux partenaires véhicule : demande en ligne, frais de transaction, AIB (2026-10-19)
--
--   Contrat de partenariat véhicule (projet du 19 octobre 2026), article 9 :
--   • 9.3 le partenaire suit ses gains sur l'espace partenaire (site) : part disponible, demandes, versements ;
--   • 9.5 il peut demander le versement de sa part disponible À TOUT MOMENT, dès qu'un mois s'est écoulé depuis la première course de ses
--     véhicules ; le montant demandé est réservé tout de suite sur son portefeuille « Revenus » (comme un retrait chauffeur) ;
--   • 9.6 les frais de transaction sont à sa charge : déduits du montant versé, annoncés avant la validation de la demande ;
--   • 9.7 le versement fait l'objet d'une facture normalisée (n° saisi par le partenaire, exigé avant le règlement) et TamCar retient l'AIB
--     (3 % avec identifiant fiscal, 5 % sans, 0 si l'équipe constate une exonération), selon les circonstances et la réglementation.
--   Le règlement lui-même reste enregistré par l'équipe TamCar (virement ou Mobile Money, hors application) ; l'envoi automatique par FeexPay
--   pourra être branché plus tard sur le même circuit. Comptabilité : le retrait part sur 5318 (agrégateur), l'AIB retenu sur 447 (État).
-- ============================================================

-- 1. Réglages ------------------------------------------------------------------------------------------------------------------------
insert into public.program_rules (key, value, label) values
  ('dealer_payout_wait_months',  1,    'Versements partenaires : mois à attendre après la première course de ses véhicules avant la première demande'),
  ('dealer_payout_min_fcfa',     500,  'Versements partenaires : montant minimal d''une demande (F)'),
  ('dealer_payout_fee_permille', 10,   'Versements partenaires : frais de transaction Mobile Money, à la charge du partenaire (en ‰ du montant net d''AIB : 10 = 1 %, à caler sur le tarif FeexPay)'),
  ('dealer_payout_fee_bank_fcfa', 0,   'Versements partenaires : frais d''un virement bancaire, à la charge du partenaire (F, forfait)'),
  ('aib_rate_ifu_permille',      30,   'AIB retenu sur les sommes versées à un partenaire AVEC identifiant fiscal unique (en ‰ : 30 = 3 %, prestations de services, art. 132 du CGI)'),
  ('aib_rate_noifu_permille',    50,   'AIB retenu sur les sommes versées à un partenaire SANS identifiant fiscal unique (en ‰ : 50 = 5 %, art. 132 du CGI)')
on conflict (key) do update set label = excluded.label;

-- 2. Situation fiscale du partenaire ------------------------------------------------------------------------------------------------
alter table public.dealer_partners add column if not exists ifu text;
alter table public.dealer_partners add column if not exists aib_exempt boolean not null default false;
alter table public.dealer_partners add column if not exists aib_exempt_reason text;

create or replace function public.admin_set_dealer_tax(p_dealer uuid, p_ifu text, p_aib_exempt boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if coalesce(p_aib_exempt, false) and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Un motif est requis pour constater une exonération d''AIB.';
  end if;
  update public.dealer_partners
     set ifu = nullif(btrim(coalesce(p_ifu, '')), ''),
         aib_exempt = coalesce(p_aib_exempt, false),
         aib_exempt_reason = case when coalesce(p_aib_exempt, false) then nullif(btrim(p_reason), '') else null end
   where id = p_dealer;
  if not found then raise exception 'Partenaire introuvable'; end if;
end;
$fn$;
revoke execute on function public.admin_set_dealer_tax(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_set_dealer_tax(uuid, text, boolean, text) to authenticated;

-- 3. Demandes de versement ----------------------------------------------------------------------------------------------------------
create table if not exists public.dealer_payout_requests (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealer_partners(id),
  profile_id uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),
  amount_fcfa int not null check (amount_fcfa > 0),          -- montant demandé = montant de la facture, hors taxes ; réservé sur le portefeuille
  aib_permille int not null default 0,
  aib_fcfa int not null default 0,
  fee_fcfa int not null default 0,
  net_fcfa int not null check (net_fcfa > 0),                -- montant effectivement envoyé = montant - AIB - frais
  method text not null check (method in ('mobile_money', 'virement')),
  provider text,                                              -- mtn, moov ou banque
  account text not null,                                      -- numéro Mobile Money ou coordonnées bancaires
  invoice_number text,                                        -- n° de la facture normalisée
  status text not null default 'requested' check (status in ('requested', 'paid', 'rejected', 'cancelled')),
  reference text,                                             -- référence du règlement (Mobile Money, virement)
  reason text,
  decided_by uuid,
  decided_at timestamptz,
  wallet_tx_id uuid,
  aib_tx_id uuid
);
create index if not exists dealer_payout_requests_dealer_idx on public.dealer_payout_requests (dealer_id, requested_at desc);
create index if not exists dealer_payout_requests_status_idx on public.dealer_payout_requests (status);
alter table public.dealer_payout_requests enable row level security;
drop policy if exists dealer_payout_requests_select on public.dealer_payout_requests;
create policy dealer_payout_requests_select on public.dealer_payout_requests for select using (profile_id = auth.uid() or public.is_admin());
revoke all on public.dealer_payout_requests from anon, authenticated;
grant select on public.dealer_payout_requests to authenticated;

-- 4. Calcul de l'AIB et des frais ---------------------------------------------------------------------------------------------------
create or replace function public._dealer_payout_calc(p_dealer uuid, p_amount int, p_method text)
returns table (aib_permille int, aib_fcfa int, fee_fcfa int, net_fcfa int)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v record;
  v_rate int;
  v_aib int;
  v_fee int;
begin
  select ifu, aib_exempt into v from public.dealer_partners where id = p_dealer;
  if not found then raise exception 'Partenaire introuvable'; end if;
  v_rate := case when v.aib_exempt then 0
                 when nullif(btrim(coalesce(v.ifu, '')), '') is not null then public._program_rule('aib_rate_ifu_permille')
                 else public._program_rule('aib_rate_noifu_permille') end;
  v_aib := round(p_amount * v_rate / 1000.0)::int;
  v_fee := case when p_method = 'virement' then public._program_rule('dealer_payout_fee_bank_fcfa')
                else ceil((p_amount - v_aib) * public._program_rule('dealer_payout_fee_permille') / 1000.0)::int end;
  return query select v_rate, v_aib, v_fee, p_amount - v_aib - v_fee;
end;
$fn$;
revoke execute on function public._dealer_payout_calc(uuid, int, text) from public, anon, authenticated;

-- Remet la somme réservée sur le portefeuille (annulation ou refus) ; interne.
create or replace function public._dealer_payout_release(p_id uuid, p_status text, p_reason text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v public.dealer_payout_requests;
  v_wallet uuid;
begin
  select * into v from public.dealer_payout_requests where id = p_id for update;
  if v.id is null or v.status <> 'requested' then return; end if;
  select w.id into v_wallet from public.wallets w
   join public.wallet_transactions t on t.wallet_id = w.id where t.id = v.wallet_tx_id;
  if v_wallet is not null then
    update public.wallets set balance_fcfa = balance_fcfa + v.amount_fcfa, updated_at = now() where id = v_wallet;
  end if;
  update public.wallet_transactions set status = 'failed' where id in (v.wallet_tx_id, v.aib_tx_id);
  update public.dealer_payout_requests
     set status = p_status, reason = nullif(btrim(coalesce(p_reason, '')), ''), decided_at = now(), decided_by = auth.uid()
   where id = p_id;
end;
$fn$;
revoke execute on function public._dealer_payout_release(uuid, text, text) from public, anon, authenticated;

-- 5. Côté partenaire --------------------------------------------------------------------------------------------------------------------
create or replace function public.dealer_payout_overview(p_dealer_id uuid default null)
returns table (
  dealer_id uuid, wallet_fcfa int, available_fcfa int, pending_fcfa int, first_ride_at timestamptz, eligible_from date, eligible boolean,
  min_fcfa int, ifu text, aib_exempt boolean, aib_rate_permille int, fee_permille int, fee_bank_fcfa int, wait_months int
)
language sql stable security definer set search_path = public as $fn$
  with me as (select dp.* from public.dealer_partners dp where dp.id = public._dealer_resolve(p_dealer_id)),
  w as (
    select coalesce((select x.balance_fcfa from public.wallets x where x.profile_id = me.profile_id and x.kind = 'tamcar_revenus' limit 1), 0)::int as bal
      from me
  ),
  f as (
    select min(r.ended_at) as first_at
      from public.rides r join me on r.dealer_partner_id = me.id
     where r.status = 'completed' and r.ended_at is not null
  )
  select me.id, w.bal, greatest(w.bal, 0),
         coalesce((select sum(q.amount_fcfa) from public.dealer_payout_requests q where q.dealer_id = me.id and q.status = 'requested'), 0)::int,
         f.first_at,
         case when f.first_at is null then null
              else ((f.first_at at time zone 'Africa/Porto-Novo')::date + make_interval(months => public._program_rule('dealer_payout_wait_months')))::date end,
         (f.first_at is not null
          and (now() at time zone 'Africa/Porto-Novo')::date
              >= ((f.first_at at time zone 'Africa/Porto-Novo')::date + make_interval(months => public._program_rule('dealer_payout_wait_months')))::date),
         public._program_rule('dealer_payout_min_fcfa'), me.ifu, me.aib_exempt,
         case when me.aib_exempt then 0
              when nullif(btrim(coalesce(me.ifu, '')), '') is not null then public._program_rule('aib_rate_ifu_permille')
              else public._program_rule('aib_rate_noifu_permille') end,
         public._program_rule('dealer_payout_fee_permille'), public._program_rule('dealer_payout_fee_bank_fcfa'),
         public._program_rule('dealer_payout_wait_months')
    from me cross join w cross join f;
$fn$;
revoke execute on function public.dealer_payout_overview(uuid) from public, anon;
grant execute on function public.dealer_payout_overview(uuid) to authenticated;

create or replace function public.dealer_payout_quote(p_amount int, p_method text default 'mobile_money', p_dealer_id uuid default null)
returns table (amount_fcfa int, aib_permille int, aib_fcfa int, fee_fcfa int, net_fcfa int)
language plpgsql stable security definer set search_path = public as $fn$
declare v_dealer uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide'; end if;
  if p_method not in ('mobile_money', 'virement') then raise exception 'Mode de versement invalide'; end if;
  v_dealer := public._dealer_resolve(p_dealer_id);
  if v_dealer is null then raise exception 'Aucun profil partenaire'; end if;
  return query select p_amount, c.aib_permille, c.aib_fcfa, c.fee_fcfa, c.net_fcfa from public._dealer_payout_calc(v_dealer, p_amount, p_method) c;
end;
$fn$;
revoke execute on function public.dealer_payout_quote(int, text, uuid) from public, anon;
grant execute on function public.dealer_payout_quote(int, text, uuid) to authenticated;

create or replace function public.dealer_request_payout(
  p_amount int, p_method text, p_account text, p_provider text default null, p_invoice_number text default null
)
returns public.dealer_payout_requests
language plpgsql security definer set search_path = public as $fn$
declare
  v_dealer public.dealer_partners;
  v_wallet record;
  v_first timestamptz;
  v_from date;
  v_calc record;
  v_req public.dealer_payout_requests;
  v_tx1 uuid;
  v_tx2 uuid;
  v_acc text;
  v_prov text;
  v_min int := greatest(public._program_rule('dealer_payout_min_fcfa'), 1);
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into v_dealer from public.dealer_partners where profile_id = auth.uid() and archived_at is null limit 1;
  if v_dealer.id is null then raise exception 'Compte partenaire introuvable'; end if;
  if p_method not in ('mobile_money', 'virement') then raise exception 'Mode de versement invalide'; end if;
  if p_amount is null or p_amount < v_min then raise exception 'Montant minimal d''une demande : % F', v_min; end if;

  v_acc := btrim(coalesce(p_account, ''));
  if p_method = 'mobile_money' then
    v_prov := lower(coalesce(p_provider, ''));
    if v_prov not in ('mtn', 'moov') then raise exception 'Opérateur invalide (MTN ou Moov)'; end if;
    if length(regexp_replace(v_acc, '\D', '', 'g')) < 8 then raise exception 'Numéro Mobile Money invalide'; end if;
  else
    v_prov := 'banque';
    if length(v_acc) < 10 then raise exception 'Coordonnées bancaires incomplètes'; end if;
  end if;

  select min(r.ended_at) into v_first from public.rides r
   where r.dealer_partner_id = v_dealer.id and r.status = 'completed' and r.ended_at is not null;
  if v_first is null then raise exception 'Aucune course terminée sur vos véhicules pour le moment.'; end if;
  v_from := ((v_first at time zone 'Africa/Porto-Novo')::date + make_interval(months => public._program_rule('dealer_payout_wait_months')))::date;
  if (now() at time zone 'Africa/Porto-Novo')::date < v_from then
    raise exception 'Les demandes de versement s''ouvrent un mois après la première course de vos véhicules, soit le %.', to_char(v_from, 'DD/MM/YYYY');
  end if;
  if exists (select 1 from public.dealer_payout_requests where dealer_id = v_dealer.id and status = 'requested') then
    raise exception 'Une demande est déjà en cours de traitement.';
  end if;

  select id, balance_fcfa into v_wallet from public.wallets where profile_id = auth.uid() and kind = 'tamcar_revenus' for update;
  if v_wallet.id is null then raise exception 'Portefeuille introuvable'; end if;
  if v_wallet.balance_fcfa < p_amount then
    raise exception 'Part disponible insuffisante (% F disponibles).', greatest(v_wallet.balance_fcfa, 0);
  end if;

  select * into v_calc from public._dealer_payout_calc(v_dealer.id, p_amount, p_method);
  if v_calc.net_fcfa <= 0 then raise exception 'Montant trop faible : l''AIB et les frais dépassent le montant demandé.'; end if;

  update public.wallets set balance_fcfa = balance_fcfa - p_amount, updated_at = now() where id = v_wallet.id;

  insert into public.dealer_payout_requests (dealer_id, profile_id, amount_fcfa, aib_permille, aib_fcfa, fee_fcfa, net_fcfa, method, provider, account, invoice_number)
  values (v_dealer.id, auth.uid(), p_amount, v_calc.aib_permille, v_calc.aib_fcfa, v_calc.fee_fcfa, v_calc.net_fcfa, p_method, v_prov, v_acc,
          nullif(btrim(coalesce(p_invoice_number, '')), ''))
  returning * into v_req;

  -- La part retenue (AIB) et le reste (net + frais, versés par TamCar) sont deux lignes : la comptabilité les range sur 447 (État) et 5318 (agrégateur).
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
  values (v_wallet.id, 'withdrawal', -(p_amount - v_calc.aib_fcfa), 'internal', 'pending',
          jsonb_build_object('kind', 'dealer_payout_request', 'request_id', v_req.id, 'gross', p_amount, 'aib', v_calc.aib_fcfa,
                             'fee', v_calc.fee_fcfa, 'net', v_calc.net_fcfa))
  returning id into v_tx1;
  if v_calc.aib_fcfa > 0 then
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_wallet.id, 'aib_withholding', -v_calc.aib_fcfa, 'internal', 'pending',
            jsonb_build_object('kind', 'dealer_payout_request', 'request_id', v_req.id, 'gross', p_amount, 'permille', v_calc.aib_permille))
    returning id into v_tx2;
  end if;
  update public.dealer_payout_requests set wallet_tx_id = v_tx1, aib_tx_id = v_tx2 where id = v_req.id returning * into v_req;

  perform public._admin_alert(
    'dealer_payout', 'normal', 'Demande de versement partenaire',
    v_dealer.company_name || ' : ' || p_amount || ' F demandés, ' || v_calc.net_fcfa || ' F nets · ' || upper(v_prov) || ' ' || v_acc,
    '/admin/dealers', v_req.id);
  return v_req;
end;
$fn$;
revoke execute on function public.dealer_request_payout(int, text, text, text, text) from public, anon;
grant execute on function public.dealer_request_payout(int, text, text, text, text) to authenticated;

create or replace function public.dealer_cancel_payout(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v public.dealer_payout_requests;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into v from public.dealer_payout_requests where id = p_id for update;
  if v.id is null or v.profile_id <> auth.uid() then raise exception 'Demande introuvable'; end if;
  if v.status <> 'requested' then raise exception 'Cette demande est déjà traitée.'; end if;
  perform public._dealer_payout_release(p_id, 'cancelled', 'Annulée par le partenaire');
end;
$fn$;
revoke execute on function public.dealer_cancel_payout(uuid) from public, anon;
grant execute on function public.dealer_cancel_payout(uuid) to authenticated;

create or replace function public.dealer_my_payout_requests(p_dealer_id uuid default null, p_limit int default 10)
returns table (
  id uuid, requested_at timestamptz, amount_fcfa int, aib_permille int, aib_fcfa int, fee_fcfa int, net_fcfa int, method text, provider text,
  account text, invoice_number text, status text, reference text, reason text, decided_at timestamptz
)
language sql stable security definer set search_path = public as $fn$
  select q.id, q.requested_at, q.amount_fcfa, q.aib_permille, q.aib_fcfa, q.fee_fcfa, q.net_fcfa, q.method, q.provider, q.account,
         q.invoice_number, q.status, q.reference, q.reason, q.decided_at
    from public.dealer_payout_requests q
   where q.dealer_id = public._dealer_resolve(p_dealer_id)
   order by q.requested_at desc
   limit greatest(least(p_limit, 100), 1);
$fn$;
revoke execute on function public.dealer_my_payout_requests(uuid, int) from public, anon;
grant execute on function public.dealer_my_payout_requests(uuid, int) to authenticated;

-- Les versements enregistrés à la main restent listés ici ; ceux qui viennent d'une demande ont leur propre liste (ci-dessus).
create or replace function public.dealer_my_payouts(p_dealer_id uuid default null, p_limit int default 12)
returns table (paid_at timestamptz, amount_fcfa int, note text)
language sql stable security definer set search_path = public as $fn$
  select wt.created_at, abs(wt.amount_fcfa)::int, wt.meta ->> 'note'
    from public.dealer_partners me
    join public.wallets w on w.profile_id = me.profile_id and w.kind = 'tamcar_revenus'
    join public.wallet_transactions wt on wt.wallet_id = w.id
   where me.id = public._dealer_resolve(p_dealer_id)
     and wt.type = 'withdrawal' and wt.status = 'success'
     and coalesce(wt.meta ->> 'kind', '') <> 'dealer_payout_request'
   order by wt.created_at desc
   limit greatest(least(p_limit, 100), 1);
$fn$;

-- 6. Côté équipe TamCar ---------------------------------------------------------------------------------------------------------------
create or replace function public.admin_dealer_payout_requests(p_status text default 'requested')
returns table (
  id uuid, dealer_id uuid, company_name text, full_name text, phone text, ifu text, aib_exempt boolean, requested_at timestamptz,
  amount_fcfa int, aib_permille int, aib_fcfa int, fee_fcfa int, net_fcfa int, method text, provider text, account text, invoice_number text,
  status text, reference text, reason text, decided_at timestamptz
)
language sql stable security definer set search_path = public as $fn$
  select q.id, q.dealer_id, dp.company_name, p.full_name, p.phone, dp.ifu, dp.aib_exempt, q.requested_at, q.amount_fcfa, q.aib_permille, q.aib_fcfa,
         q.fee_fcfa, q.net_fcfa, q.method, q.provider, q.account, q.invoice_number, q.status, q.reference, q.reason, q.decided_at
    from public.dealer_payout_requests q
    join public.dealer_partners dp on dp.id = q.dealer_id
    join public.profiles p on p.id = dp.profile_id
   where public.is_admin() and (p_status = 'all' or q.status = p_status)
   order by (q.status = 'requested') desc, q.requested_at desc
   limit 200;
$fn$;
revoke execute on function public.admin_dealer_payout_requests(text) from public, anon;
grant execute on function public.admin_dealer_payout_requests(text) to authenticated;

create or replace function public.admin_settle_dealer_payout(p_id uuid, p_reference text default null, p_invoice_number text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v public.dealer_payout_requests;
  v_inv text;
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select * into v from public.dealer_payout_requests where id = p_id for update;
  if v.id is null then raise exception 'Demande introuvable'; end if;
  if v.status <> 'requested' then raise exception 'Cette demande est déjà traitée.'; end if;
  v_inv := coalesce(nullif(btrim(coalesce(p_invoice_number, '')), ''), v.invoice_number);
  if v_inv is null then raise exception 'Le numéro de la facture normalisée est requis avant le versement.'; end if;
  update public.wallet_transactions
     set status = 'success', meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('invoice', v_inv, 'reference', v_ref)
   where id in (v.wallet_tx_id, v.aib_tx_id);
  update public.dealer_payout_requests
     set status = 'paid', invoice_number = v_inv, reference = v_ref, decided_at = now(), decided_by = auth.uid()
   where id = p_id;
  perform public._push_notify(
    v.profile_id, 'Versement envoyé',
    'Votre versement de ' || v.net_fcfa || ' F a été envoyé (montant demandé ' || v.amount_fcfa || ' F, AIB ' || v.aib_fcfa || ' F, frais ' || v.fee_fcfa || ' F).',
    '/espace', 'dealer-payout-paid:' || p_id::text, true);
end;
$fn$;
revoke execute on function public.admin_settle_dealer_payout(uuid, text, text) from public, anon;
grant execute on function public.admin_settle_dealer_payout(uuid, text, text) to authenticated;

create or replace function public.admin_reject_dealer_payout(p_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v public.dealer_payout_requests;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select * into v from public.dealer_payout_requests where id = p_id for update;
  if v.id is null then raise exception 'Demande introuvable'; end if;
  if v.status <> 'requested' then raise exception 'Cette demande est déjà traitée.'; end if;
  perform public._dealer_payout_release(p_id, 'rejected', coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Refusée par TamCar'));
  perform public._push_notify(
    v.profile_id, 'Demande de versement refusée',
    'Votre demande de ' || v.amount_fcfa || ' F n''a pas été acceptée : le montant est de nouveau disponible. ' || coalesce(nullif(btrim(coalesce(p_reason, '')), ''), ''),
    '/espace', 'dealer-payout-rejected:' || p_id::text, true);
end;
$fn$;
revoke execute on function public.admin_reject_dealer_payout(uuid, text) from public, anon;
grant execute on function public.admin_reject_dealer_payout(uuid, text) to authenticated;

-- 7. Fonctions existantes mises à jour ----------------------------------------------------------------------------------------
-- « Déjà versé » compte désormais le montant demandé en entier (versement + AIB retenu).

-- dealer_my_summary
CREATE OR REPLACE FUNCTION public.dealer_my_summary(p_dealer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(dealer_id uuid, company_name text, share_pct numeric, is_shareholder boolean, shareholder_pct numeric, today date, month_start date, today_fcfa integer, today_rides integer, month_fcfa integer, month_rides integer, prev_month_fcfa integer, prev_to_date_fcfa integer, total_fcfa bigint, total_rides integer, last_ride_at timestamp with time zone, wallet_fcfa integer, paid_fcfa integer, fund_fcfa integer, adr_amount_fcfa integer, adr_refunded_fcfa integer, adr_status text, adr_refund_target date, vehicles_total integer, vehicles_active integer, vehicles_unassigned integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (
    select dp.* from public.dealer_partners dp where dp.id = public._dealer_resolve(p_dealer_id)
  ),
  t as (
    select
      (now() at time zone 'Africa/Porto-Novo')::date as d,
      date_trunc('month', now() at time zone 'Africa/Porto-Novo')::date as m0,
      (date_trunc('month', now() at time zone 'Africa/Porto-Novo') - interval '1 month')::date as pm0
  ),
  r as (
    select (rd.ended_at at time zone 'Africa/Porto-Novo')::date as day,
           rd.dealer_share_fcfa as share, rd.ended_at, rd.id
    from public.rides rd
    join me on rd.dealer_partner_id = me.id
    where rd.status = 'completed' and rd.ended_at is not null
  ),
  agg as (
    select
      coalesce(sum(r.share) filter (where r.day = t.d), 0)::int as today_fcfa,
      (count(*) filter (where r.day = t.d))::int as today_rides,
      coalesce(sum(r.share) filter (where r.day >= t.m0), 0)::int as month_fcfa,
      (count(*) filter (where r.day >= t.m0))::int as month_rides,
      coalesce(sum(r.share) filter (where r.day >= t.pm0 and r.day < t.m0), 0)::int as prev_month_fcfa,
      coalesce(sum(r.share) filter (
        where r.day >= t.pm0 and r.day <= least(t.pm0 + (extract(day from t.d)::int - 1), t.m0 - 1)
      ), 0)::int as prev_to_date_fcfa,
      coalesce(sum(r.share), 0)::bigint as total_fcfa,
      count(*)::int as total_rides,
      max(r.ended_at) as last_ride_at
    from t left join r on true
    group by t.d, t.m0, t.pm0
  )
  select
    me.id, me.company_name, me.dealer_share_pct, me.is_shareholder, me.shareholder_pct,
    t.d, t.m0,
    agg.today_fcfa, agg.today_rides, agg.month_fcfa, agg.month_rides,
    agg.prev_month_fcfa, agg.prev_to_date_fcfa, agg.total_fcfa, agg.total_rides, agg.last_ride_at,
    coalesce((select w.balance_fcfa from public.wallets w
              where w.profile_id = me.profile_id and w.kind = 'tamcar_revenus' limit 1), 0)::int,
    coalesce((select sum(abs(wt.amount_fcfa)) from public.wallet_transactions wt
              join public.wallets w on w.id = wt.wallet_id
              where w.profile_id = me.profile_id and w.kind = 'tamcar_revenus'
                and wt.type in ('withdrawal', 'aib_withholding') and wt.status = 'success'), 0)::int,
    -- Fonds de rachat constitué sur ses véhicules (versé à la cession) : crédits « rachat » des
    -- courses de ses véhicules.
    coalesce((select sum(wt.amount_fcfa) from public.wallet_transactions wt
              where wt.type = 'rachat_credit' and wt.status = 'success'
                and wt.ride_id in (select r2.id from r r2)), 0)::int,
    adr.amount_fcfa, adr.refunded_fcfa, adr.status::text, adr.refund_target_at::date,
    (select count(*) from public.vehicles v
       where v.dealer_partner_id = me.id and v.status <> 'archived')::int,
    (select count(*) from public.vehicles v
       where v.dealer_partner_id = me.id and v.status = 'active')::int,
    (select count(*) from public.vehicles v
       where v.dealer_partner_id = me.id and v.status = 'active'
         and not exists (select 1 from public.drivers d where d.current_vehicle_id = v.id))::int
  from me
  cross join t
  cross join agg
  left join public.dealer_advances adr on adr.dealer_partner_id = me.id;
$function$;

-- admin_dealer_wallets
CREATE OR REPLACE FUNCTION public.admin_dealer_wallets()
 RETURNS TABLE(dealer_id uuid, profile_id uuid, company_name text, full_name text, phone text, archived boolean, balance_fcfa integer, earned_month integer, earned_total integer, paid_total integer, last_paid_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select dp.id, dp.profile_id, dp.company_name, p.full_name, p.phone, dp.archived_at is not null,
         coalesce((select w.balance_fcfa from public.wallets w
                    where w.profile_id = dp.profile_id and w.kind = 'tamcar_revenus' limit 1), 0)::int,
         coalesce((select sum(r.dealer_share_fcfa) from public.rides r
                    where r.dealer_partner_id = dp.id and r.status = 'completed' and r.ended_at is not null
                      and date_trunc('month', r.ended_at at time zone 'Africa/Porto-Novo')
                          = date_trunc('month', now() at time zone 'Africa/Porto-Novo')), 0)::int,
         coalesce((select sum(r.dealer_share_fcfa) from public.rides r
                    where r.dealer_partner_id = dp.id and r.status = 'completed'), 0)::int,
         coalesce((select sum(abs(wt.amount_fcfa)) from public.wallet_transactions wt
                    join public.wallets w on w.id = wt.wallet_id
                    where w.profile_id = dp.profile_id and w.kind = 'tamcar_revenus'
                      and wt.type in ('withdrawal', 'aib_withholding') and wt.status = 'success'), 0)::int,
         (select max(wt.created_at) from public.wallet_transactions wt
            join public.wallets w on w.id = wt.wallet_id
            where w.profile_id = dp.profile_id and w.kind = 'tamcar_revenus'
              and wt.type in ('withdrawal', 'aib_withholding') and wt.status = 'success')
    from public.dealer_partners dp
    join public.profiles p on p.id = dp.profile_id
   where public.is_admin()
   order by dp.archived_at is not null, dp.company_name;
$function$;

-- bo_sync_platform
CREATE OR REPLACE FUNCTION public.bo_sync_platform(p_through date DEFAULT (((now() AT TIME ZONE 'Africa/Porto-Novo'::text))::date - 1))
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_day    date;
  v_count  int := 0;
  v_lines  jsonb;
  v_dr4718 bigint;
  v_cr4718 bigint;
  rec      record;
begin
  if not public.is_backoffice() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;
  for v_day in
    select distinct (t.created_at at time zone 'Africa/Porto-Novo')::date
    from public.wallet_transactions t
    where t.status = 'success'
      and (t.created_at at time zone 'Africa/Porto-Novo')::date <= p_through
      and not exists (
        select 1 from public.bo_entries e
        where e.source_key = 'platform:' ||
              ((t.created_at at time zone 'Africa/Porto-Novo')::date)::text)
    order by 1
  loop
    v_lines := '[]'::jsonb;
    v_dr4718 := 0;
    v_cr4718 := 0;
    for rec in
      select t.type::text as tx_type,
             w.kind::text as wallet_kind,
             sum(case when t.amount_fcfa > 0 then t.amount_fcfa else 0 end)::bigint as credited,
             sum(case when t.amount_fcfa < 0 then -t.amount_fcfa else 0 end)::bigint as debited
      from public.wallet_transactions t
      join public.wallets w on w.id = t.wallet_id
      where t.status = 'success'
        and (t.created_at at time zone 'Africa/Porto-Novo')::date = v_day
      group by 1, 2
    loop
      declare
        v_wallet_acc text := case rec.wallet_kind
          when 'tamcar_credit'  then '4191'
          when 'tamcar_revenus' then '4671'
          when 'tamcar_epargne' then '4672'
          when 'tamcar_rachat'  then '4674'
          else '4671'
        end;
        v_other text := case rec.tx_type
          when 'topup'               then '5318'
          when 'debt_settlement'     then '5318'
          when 'withdrawal'          then '5318'
          when 'ops_payout'          then '5318'
          when 'aib_withholding'     then '447'
          when 'insurance_premium'   then '4676'
          when 'tamassur_withdrawal' then '4677'
          else '4718'
        end;
        v_lbl text;
      begin
        v_lbl := rec.tx_type || ' (' || rec.wallet_kind || ')';
        -- Wallet crédité (avoir du tiers augmente) : C wallet / D contrepartie
        if rec.credited > 0 then
          v_lines := v_lines
            || jsonb_build_array(
                 jsonb_build_object('account', v_other, 'label', v_lbl,
                                    'debit', rec.credited, 'credit', 0),
                 jsonb_build_object('account', v_wallet_acc, 'label', v_lbl,
                                    'debit', 0, 'credit', rec.credited));
          if v_other = '4718' then v_dr4718 := v_dr4718 + rec.credited; end if;
        end if;
        -- Wallet débité (avoir du tiers diminue) : D wallet / C contrepartie
        if rec.debited > 0 then
          v_lines := v_lines
            || jsonb_build_array(
                 jsonb_build_object('account', v_wallet_acc, 'label', v_lbl,
                                    'debit', rec.debited, 'credit', 0),
                 jsonb_build_object('account', v_other, 'label', v_lbl,
                                    'debit', 0, 'credit', rec.debited));
          if v_other = '4718' then v_cr4718 := v_cr4718 + rec.debited; end if;
        end if;
      end;
    end loop;
    if jsonb_array_length(v_lines) = 0 then continue; end if;
    -- Solde du compte de liaison = commission TamCar du jour → 7061
    if v_cr4718 > v_dr4718 then
      v_lines := v_lines
        || jsonb_build_array(
             jsonb_build_object('account', '4718',
               'label', 'Commission plateforme du jour', 'debit', v_cr4718 - v_dr4718, 'credit', 0),
             jsonb_build_object('account', '7061',
               'label', 'Commission plateforme du jour', 'debit', 0, 'credit', v_cr4718 - v_dr4718));
    elsif v_dr4718 > v_cr4718 then
      v_lines := v_lines
        || jsonb_build_array(
             jsonb_build_object('account', '7061',
               'label', 'Régularisation commissions', 'debit', v_dr4718 - v_cr4718, 'credit', 0),
             jsonb_build_object('account', '4718',
               'label', 'Régularisation commissions', 'debit', 0, 'credit', v_dr4718 - v_cr4718));
    end if;
    perform public._bo_insert_entry(
      'PL', v_day, 'Activité plateforme du ' || to_char(v_day, 'DD/MM/YYYY'),
      v_lines, 'platform', 'platform:' || v_day::text, null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;
