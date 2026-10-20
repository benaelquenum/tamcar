-- ============================================================
-- TamCar — Versements partenaires : fenêtre mensuelle, facture à la demande, compte de paiement enregistré et validé (2026-10-20)
--
--   Contrat de partenariat véhicule, articles 9.5 et annexe 1 (version du fondateur du 20 octobre) :
--   • les demandes de versement se font dans les 5 PREMIERS JOURS de chaque mois (réglage dealer_payout_window_days), pour les sommes acquises à la
--     fin du mois écoulé : la part gagnée depuis le 1er du mois en cours n'est pas encore demandable ;
--   • la facture normalisée est exigée DÈS LA DEMANDE (et non plus seulement au règlement) ;
--   • le versement part sur « le compte indiqué à l'annexe 1 » : le partenaire enregistre UNE fois son compte (Mobile Money ou banque), TamCar le
--     valide, et les demandes l'utilisent. Tout changement remet le compte en attente de validation (protection contre un détournement).
-- ============================================================

insert into public.program_rules (key, value, label) values
  ('dealer_payout_window_days', 5, 'Versements partenaires : demandes ouvertes du 1er au N-ième jour de chaque mois (N = ce réglage ; 31 = toujours ouvert)')
on conflict (key) do update set label = excluded.label;

-- 1. Compte de paiement du partenaire ------------------------------------------------------------------------------------------------
alter table public.dealer_partners add column if not exists payout_method text;
alter table public.dealer_partners add column if not exists payout_provider text;
alter table public.dealer_partners add column if not exists payout_account text;
alter table public.dealer_partners add column if not exists payout_account_status text not null default 'none';
alter table public.dealer_partners add column if not exists payout_account_validated_at timestamptz;
alter table public.dealer_partners add column if not exists payout_account_validated_by uuid;
alter table public.dealer_partners drop constraint if exists dealer_partners_payout_method_chk;
alter table public.dealer_partners add constraint dealer_partners_payout_method_chk check (payout_method is null or payout_method in ('mobile_money', 'virement'));
alter table public.dealer_partners drop constraint if exists dealer_partners_payout_status_chk;
alter table public.dealer_partners add constraint dealer_partners_payout_status_chk check (payout_account_status in ('none', 'pending', 'validated'));

create or replace function public.dealer_save_payout_account(p_method text, p_provider text, p_account text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_dealer public.dealer_partners;
  v_acc text := btrim(coalesce(p_account, ''));
  v_prov text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into v_dealer from public.dealer_partners where profile_id = auth.uid() and archived_at is null limit 1;
  if v_dealer.id is null then raise exception 'Compte partenaire introuvable'; end if;
  if p_method not in ('mobile_money', 'virement') then raise exception 'Mode de versement invalide'; end if;
  if p_method = 'mobile_money' then
    v_prov := lower(coalesce(p_provider, ''));
    if v_prov not in ('mtn', 'moov') then raise exception 'Opérateur invalide (MTN ou Moov)'; end if;
    if length(regexp_replace(v_acc, '\D', '', 'g')) < 8 then raise exception 'Numéro Mobile Money invalide'; end if;
  else
    v_prov := 'banque';
    if length(v_acc) < 10 then raise exception 'Coordonnées bancaires incomplètes'; end if;
  end if;
  if exists (select 1 from public.dealer_payout_requests where dealer_id = v_dealer.id and status = 'requested') then
    raise exception 'Une demande de versement est en cours : changez de compte après son règlement.';
  end if;
  -- aucun changement : rien à revalider
  if v_dealer.payout_method = p_method and coalesce(v_dealer.payout_provider, '') = v_prov and coalesce(v_dealer.payout_account, '') = v_acc then
    return;
  end if;
  update public.dealer_partners
     set payout_method = p_method, payout_provider = v_prov, payout_account = v_acc, payout_account_status = 'pending',
         payout_account_validated_at = null, payout_account_validated_by = null
   where id = v_dealer.id;
  perform public._admin_alert(
    'dealer_account', 'normal', 'Compte de paiement à valider',
    v_dealer.company_name || ' : ' || case when p_method = 'mobile_money' then 'Mobile Money ' || upper(v_prov) else 'virement bancaire' end || ' ' || v_acc,
    '/admin/dealers', v_dealer.id);
end;
$fn$;
revoke execute on function public.dealer_save_payout_account(text, text, text) from public, anon;
grant execute on function public.dealer_save_payout_account(text, text, text) to authenticated;

create or replace function public.admin_validate_dealer_account(p_dealer uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v public.dealer_partners;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select * into v from public.dealer_partners where id = p_dealer for update;
  if v.id is null then raise exception 'Partenaire introuvable'; end if;
  if v.payout_account is null then raise exception 'Ce partenaire n''a enregistré aucun compte de paiement.'; end if;
  update public.dealer_partners
     set payout_account_status = 'validated', payout_account_validated_at = now(), payout_account_validated_by = auth.uid()
   where id = p_dealer;
  perform public._push_notify(
    v.profile_id, 'Compte de paiement validé',
    'Votre compte de paiement est validé : vous pouvez demander vos versements.', '/espace', 'dealer-account-ok:' || p_dealer::text, true);
end;
$fn$;
revoke execute on function public.admin_validate_dealer_account(uuid) from public, anon;
grant execute on function public.admin_validate_dealer_account(uuid) to authenticated;

-- 2. Aperçu des versements : fenêtre, part demandable, compte ---------------------------------------------------------------------
drop function if exists public.dealer_payout_overview(uuid);
create function public.dealer_payout_overview(p_dealer_id uuid default null)
returns table (
  dealer_id uuid, wallet_fcfa int, available_fcfa int, pending_fcfa int, month_to_date_fcfa int, requestable_fcfa int,
  first_ride_at timestamptz, eligible_from date, eligible boolean, window_days int, window_open boolean, next_window_start date,
  min_fcfa int, ifu text, aib_exempt boolean, aib_rate_permille int, fee_permille int, fee_bank_fcfa int, wait_months int,
  payout_method text, payout_provider text, payout_account text, account_status text
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
  ),
  m as (
    select coalesce(sum(r.dealer_share_fcfa), 0)::int as mtd
      from public.rides r join me on r.dealer_partner_id = me.id
     where r.status = 'completed' and r.ended_at is not null
       and (r.ended_at at time zone 'Africa/Porto-Novo') >= date_trunc('month', now() at time zone 'Africa/Porto-Novo')
  ),
  t as (select (now() at time zone 'Africa/Porto-Novo')::date as today, public._program_rule('dealer_payout_window_days') as wd)
  select me.id, w.bal, greatest(w.bal, 0),
         coalesce((select sum(q.amount_fcfa) from public.dealer_payout_requests q where q.dealer_id = me.id and q.status = 'requested'), 0)::int,
         m.mtd, greatest(0, w.bal - m.mtd),
         f.first_at,
         case when f.first_at is null then null
              else ((f.first_at at time zone 'Africa/Porto-Novo')::date + make_interval(months => public._program_rule('dealer_payout_wait_months')))::date end,
         (f.first_at is not null
          and t.today >= ((f.first_at at time zone 'Africa/Porto-Novo')::date + make_interval(months => public._program_rule('dealer_payout_wait_months')))::date),
         t.wd, (extract(day from t.today)::int <= t.wd),
         case when extract(day from t.today)::int <= t.wd then date_trunc('month', t.today)::date else (date_trunc('month', t.today) + interval '1 month')::date end,
         public._program_rule('dealer_payout_min_fcfa'), me.ifu, me.aib_exempt,
         case when me.aib_exempt then 0
              when nullif(btrim(coalesce(me.ifu, '')), '') is not null then public._program_rule('aib_rate_ifu_permille')
              else public._program_rule('aib_rate_noifu_permille') end,
         public._program_rule('dealer_payout_fee_permille'), public._program_rule('dealer_payout_fee_bank_fcfa'),
         public._program_rule('dealer_payout_wait_months'),
         me.payout_method, me.payout_provider, me.payout_account, me.payout_account_status
    from me cross join w cross join f cross join m cross join t;
$fn$;
revoke execute on function public.dealer_payout_overview(uuid) from public, anon;
grant execute on function public.dealer_payout_overview(uuid) to authenticated;

-- 3. Demande de versement : compte validé, fenêtre, facture, part demandable -------------------------------------------------------
drop function if exists public.dealer_request_payout(int, text, text, text, text);
create function public.dealer_request_payout(p_amount int, p_invoice_number text)
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
  v_inv text := nullif(btrim(coalesce(p_invoice_number, '')), '');
  v_min int := greatest(public._program_rule('dealer_payout_min_fcfa'), 1);
  v_wd int := public._program_rule('dealer_payout_window_days');
  v_mtd int;
  v_requestable int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into v_dealer from public.dealer_partners where profile_id = auth.uid() and archived_at is null limit 1;
  if v_dealer.id is null then raise exception 'Compte partenaire introuvable'; end if;
  if v_dealer.payout_account_status <> 'validated' or v_dealer.payout_account is null then
    raise exception 'Enregistrez votre compte de paiement et attendez sa validation par TamCar avant de demander un versement.';
  end if;
  if v_inv is null then raise exception 'Le numéro de la facture normalisée est requis pour demander un versement.'; end if;
  if p_amount is null or p_amount < v_min then raise exception 'Montant minimal d''une demande : % F', v_min; end if;
  if extract(day from (now() at time zone 'Africa/Porto-Novo'))::int > v_wd then
    raise exception 'Les demandes de versement sont ouvertes du 1er au % de chaque mois.', v_wd;
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
  select coalesce(sum(r.dealer_share_fcfa), 0)::int into v_mtd
    from public.rides r
   where r.dealer_partner_id = v_dealer.id and r.status = 'completed' and r.ended_at is not null
     and (r.ended_at at time zone 'Africa/Porto-Novo') >= date_trunc('month', now() at time zone 'Africa/Porto-Novo');
  v_requestable := greatest(0, v_wallet.balance_fcfa - v_mtd);
  if p_amount > v_requestable then
    raise exception 'Montant supérieur à la part demandable (% F : sommes acquises à la fin du mois écoulé).', v_requestable;
  end if;

  select * into v_calc from public._dealer_payout_calc(v_dealer.id, p_amount, v_dealer.payout_method);
  if v_calc.net_fcfa <= 0 then raise exception 'Montant trop faible : l''AIB et les frais dépassent le montant demandé.'; end if;

  update public.wallets set balance_fcfa = balance_fcfa - p_amount, updated_at = now() where id = v_wallet.id;

  insert into public.dealer_payout_requests (dealer_id, profile_id, amount_fcfa, aib_permille, aib_fcfa, fee_fcfa, net_fcfa, method, provider, account, invoice_number)
  values (v_dealer.id, auth.uid(), p_amount, v_calc.aib_permille, v_calc.aib_fcfa, v_calc.fee_fcfa, v_calc.net_fcfa, v_dealer.payout_method,
          v_dealer.payout_provider, v_dealer.payout_account, v_inv)
  returning * into v_req;

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
    v_dealer.company_name || ' : ' || p_amount || ' F demandés, ' || v_calc.net_fcfa || ' F nets · facture ' || v_inv || ' · '
      || upper(coalesce(v_dealer.payout_provider, '')) || ' ' || v_dealer.payout_account,
    '/admin/dealers', v_req.id);
  return v_req;
end;
$fn$;
revoke execute on function public.dealer_request_payout(int, text) from public, anon;
grant execute on function public.dealer_request_payout(int, text) to authenticated;
