-- Versements aux partenaires véhicule (propriétaires) : écran admin + historique côté partenaire.
--
-- Le règlement se fait hors application (Mobile Money, virement…) ; l'admin l'enregistre ici, ce qui
-- débite le portefeuille « Revenus » du partenaire (transaction « withdrawal », montant NÉGATIF,
-- comme les retraits chauffeurs : la comptabilité du back-office lit le signe du montant).
--
-- Au passage : les règlements des responsables opérations (ops_payout) sont désormais enregistrés
-- avec un montant négatif, et la synchronisation comptable les range sur le compte de trésorerie
-- (5318) au lieu du compte de liaison.

-- A. Règlements responsables opérations : montant négatif (sortie du portefeuille) -----------------
create or replace function public.admin_pay_ops_wallet(p_profile uuid, p_amount int, p_note text default null)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_wallet uuid;
  v_bal int;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide'; end if;
  select id, balance_fcfa into v_wallet, v_bal from public.wallets
   where profile_id = p_profile and kind = 'tamcar_ops' for update;
  if v_wallet is null or v_bal < p_amount then
    raise exception 'Solde insuffisant (solde : % F)', coalesce(v_bal, 0);
  end if;
  update public.wallets set balance_fcfa = balance_fcfa - p_amount, updated_at = now() where id = v_wallet;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
  values (v_wallet, 'ops_payout', -p_amount, 'internal', 'success',
          jsonb_build_object('note', nullif(trim(p_note), ''), 'by', auth.uid()));
  return v_bal - p_amount;
end;
$fn$;
revoke execute on function public.admin_pay_ops_wallet(uuid, int, text) from public, anon;
grant execute on function public.admin_pay_ops_wallet(uuid, int, text) to authenticated;

-- B. Admin : soldes des partenaires véhicule ------------------------------------------------------
create or replace function public.admin_dealer_wallets()
returns table (
  dealer_id uuid,
  profile_id uuid,
  company_name text,
  full_name text,
  phone text,
  archived boolean,
  balance_fcfa int,
  earned_month int,
  earned_total int,
  paid_total int,
  last_paid_at timestamptz
)
language sql stable security definer set search_path = public as $fn$
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
                      and wt.type = 'withdrawal' and wt.status = 'success'), 0)::int,
         (select max(wt.created_at) from public.wallet_transactions wt
            join public.wallets w on w.id = wt.wallet_id
            where w.profile_id = dp.profile_id and w.kind = 'tamcar_revenus'
              and wt.type = 'withdrawal' and wt.status = 'success')
    from public.dealer_partners dp
    join public.profiles p on p.id = dp.profile_id
   where public.is_admin()
   order by dp.archived_at is not null, dp.company_name;
$fn$;
revoke execute on function public.admin_dealer_wallets() from public, anon;
grant execute on function public.admin_dealer_wallets() to authenticated;

-- C. Admin : enregistrer un versement --------------------------------------------------------------
create or replace function public.admin_pay_dealer_wallet(p_dealer uuid, p_amount int, p_note text default null)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_profile uuid;
  v_wallet uuid;
  v_bal int;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Montant invalide'; end if;
  select profile_id into v_profile from public.dealer_partners where id = p_dealer;
  if v_profile is null then raise exception 'Partenaire introuvable'; end if;
  select id, balance_fcfa into v_wallet, v_bal from public.wallets
   where profile_id = v_profile and kind = 'tamcar_revenus' for update;
  if v_wallet is null or v_bal < p_amount then
    raise exception 'Solde insuffisant (solde : % F)', coalesce(v_bal, 0);
  end if;
  update public.wallets set balance_fcfa = balance_fcfa - p_amount, updated_at = now() where id = v_wallet;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
  values (v_wallet, 'withdrawal', -p_amount, 'internal', 'success',
          jsonb_build_object('kind', 'dealer_payout', 'note', nullif(trim(p_note), ''), 'by', auth.uid()));
  return v_bal - p_amount;
end;
$fn$;
revoke execute on function public.admin_pay_dealer_wallet(uuid, int, text) from public, anon;
grant execute on function public.admin_pay_dealer_wallet(uuid, int, text) to authenticated;

-- D. Partenaire : ses versements -------------------------------------------------------------------
create or replace function public.dealer_my_payouts(p_dealer_id uuid default null, p_limit int default 12)
returns table (paid_at timestamptz, amount_fcfa int, note text)
language sql stable security definer set search_path = public as $fn$
  select wt.created_at, abs(wt.amount_fcfa)::int, wt.meta ->> 'note'
    from public.dealer_partners me
    join public.wallets w on w.profile_id = me.profile_id and w.kind = 'tamcar_revenus'
    join public.wallet_transactions wt on wt.wallet_id = w.id
   where me.id = public._dealer_resolve(p_dealer_id)
     and wt.type = 'withdrawal' and wt.status = 'success'
   order by wt.created_at desc
   limit greatest(least(p_limit, 100), 1);
$fn$;
revoke execute on function public.dealer_my_payouts(uuid, int) from public, anon;
grant execute on function public.dealer_my_payouts(uuid, int) to authenticated;

-- E. Résumé partenaire : « déjà versé » compté en valeur absolue (signe négatif des retraits) --------

create or replace function public.dealer_my_summary(p_dealer_id uuid default null)
returns table (
  dealer_id uuid,
  company_name text,
  share_pct numeric,
  is_shareholder boolean,
  shareholder_pct numeric,
  today date,
  month_start date,
  today_fcfa int,
  today_rides int,
  month_fcfa int,
  month_rides int,
  prev_month_fcfa int,
  prev_to_date_fcfa int,
  total_fcfa bigint,
  total_rides int,
  last_ride_at timestamptz,
  wallet_fcfa int,
  paid_fcfa int,
  fund_fcfa int,
  adr_amount_fcfa int,
  adr_refunded_fcfa int,
  adr_status text,
  adr_refund_target date,
  vehicles_total int,
  vehicles_active int,
  vehicles_unassigned int
)
language sql stable security definer set search_path = public as $fn$
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
                and wt.type = 'withdrawal' and wt.status = 'success'), 0)::int,
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
$fn$;
revoke execute on function public.dealer_my_summary(uuid) from public, anon;
grant execute on function public.dealer_my_summary(uuid) to authenticated;

-- F. Comptabilité : les règlements des responsables opérations sortent de la trésorerie (5318) -------
create or replace function public.bo_sync_platform(
  p_through date default (now() at time zone 'Africa/Porto-Novo')::date - 1
)
returns int
language plpgsql security definer set search_path = public as $$
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
$$;
