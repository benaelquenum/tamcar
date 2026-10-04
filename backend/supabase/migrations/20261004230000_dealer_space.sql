-- Espace partenaire véhicule : gains en temps réel, par véhicule, par jour et par mois.
--
-- Principe : le partenaire ne voit QUE sa part (rides.dealer_share_fcfa, créditée à la fin de
-- chaque course) — ni le prix des courses, ni la part du chauffeur, ni les adresses des clients.
-- Tout passe par des fonctions qui filtrent sur son propre compte ; un admin peut prévisualiser
-- l'espace d'un partenaire en passant son identifiant.

-- Résout le partenaire concerné : le sien, ou (admin) celui demandé.
create or replace function public._dealer_resolve(p_dealer_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_id uuid;
begin
  if p_dealer_id is not null and public.is_admin() then
    return p_dealer_id;
  end if;
  select id into v_id from public.dealer_partners where profile_id = auth.uid() limit 1;
  return v_id;
end $fn$;
revoke execute on function public._dealer_resolve(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Résumé : aujourd'hui, ce mois, mois précédent, cumul, portefeuille, fonds, avance de démarrage
-- ---------------------------------------------------------------------------
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
    coalesce((select sum(wt.amount_fcfa) from public.wallet_transactions wt
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

-- ---------------------------------------------------------------------------
-- Véhicules : part du jour et du mois, chauffeur affecté, objectif de la part
-- ---------------------------------------------------------------------------
create or replace function public.dealer_my_vehicles(p_dealer_id uuid default null)
returns table (
  vehicle_id uuid,
  plate_number text,
  brand text,
  model text,
  vehicle_year int,
  color text,
  category text,
  status text,
  activated_at timestamptz,
  driver_name text,
  driver_online boolean,
  driver_status text,
  today_fcfa int,
  today_rides int,
  month_fcfa int,
  month_rides int,
  expected_daily_fcfa int
)
language sql stable security definer set search_path = public as $fn$
  with me as (
    select dp.* from public.dealer_partners dp where dp.id = public._dealer_resolve(p_dealer_id)
  ),
  t as (
    select (now() at time zone 'Africa/Porto-Novo')::date as d,
           date_trunc('month', now() at time zone 'Africa/Porto-Novo')::date as m0
  ),
  r as (
    select rd.vehicle_id, (rd.ended_at at time zone 'Africa/Porto-Novo')::date as day, rd.dealer_share_fcfa as share
    from public.rides rd
    join me on rd.dealer_partner_id = me.id
    where rd.status = 'completed' and rd.ended_at is not null and rd.vehicle_id is not null
  )
  select
    v.id, v.plate_number, v.brand, v.model, v.year::int, v.color, v.category::text, v.status::text, v.activated_at,
    dp.full_name, d.is_online, d.status::text,
    coalesce((select sum(r.share) from r, t where r.vehicle_id = v.id and r.day = t.d), 0)::int,
    (select count(*) from r, t where r.vehicle_id = v.id and r.day = t.d)::int,
    coalesce((select sum(r.share) from r, t where r.vehicle_id = v.id and r.day >= t.m0), 0)::int,
    (select count(*) from r, t where r.vehicle_id = v.id and r.day >= t.m0)::int,
    round(me.dealer_share_pct / 100.0 * coalesce(public._vehicle_floor(v.category::text), 0))::int
  from public.vehicles v
  join me on v.dealer_partner_id = me.id
  left join public.drivers d on d.current_vehicle_id = v.id
  left join public.profiles dp on dp.id = d.profile_id
  where v.status <> 'archived'
  order by v.status = 'active' desc, v.created_at;
$fn$;
revoke execute on function public.dealer_my_vehicles(uuid) from public, anon;
grant execute on function public.dealer_my_vehicles(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Jour par jour (mois en cours, jours sans course compris)
-- ---------------------------------------------------------------------------
create or replace function public.dealer_my_daily(p_dealer_id uuid default null)
returns table (day date, rides int, share_fcfa int)
language sql stable security definer set search_path = public as $fn$
  with me as (
    select dp.id from public.dealer_partners dp where dp.id = public._dealer_resolve(p_dealer_id)
  ),
  t as (
    select (now() at time zone 'Africa/Porto-Novo')::date as d,
           date_trunc('month', now() at time zone 'Africa/Porto-Novo')::date as m0
  )
  select g.day::date,
         (select count(*) from public.rides rd
            where rd.dealer_partner_id = me.id and rd.status = 'completed' and rd.ended_at is not null
              and (rd.ended_at at time zone 'Africa/Porto-Novo')::date = g.day::date)::int,
         coalesce((select sum(rd.dealer_share_fcfa) from public.rides rd
            where rd.dealer_partner_id = me.id and rd.status = 'completed' and rd.ended_at is not null
              and (rd.ended_at at time zone 'Africa/Porto-Novo')::date = g.day::date), 0)::int
  from me, t, generate_series(t.m0::timestamp, t.d::timestamp, interval '1 day') as g(day)
  order by g.day;
$fn$;
revoke execute on function public.dealer_my_daily(uuid) from public, anon;
grant execute on function public.dealer_my_daily(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Mois par mois
-- ---------------------------------------------------------------------------
create or replace function public.dealer_my_months(p_dealer_id uuid default null, p_n int default 12)
returns table (month_start date, rides int, share_fcfa int)
language sql stable security definer set search_path = public as $fn$
  with me as (
    select dp.id, dp.created_at from public.dealer_partners dp where dp.id = public._dealer_resolve(p_dealer_id)
  ),
  t as (
    select date_trunc('month', now() at time zone 'Africa/Porto-Novo')::date as m0
  )
  select g.m::date,
         (select count(*) from public.rides rd
            where rd.dealer_partner_id = me.id and rd.status = 'completed' and rd.ended_at is not null
              and date_trunc('month', rd.ended_at at time zone 'Africa/Porto-Novo')::date = g.m::date)::int,
         coalesce((select sum(rd.dealer_share_fcfa) from public.rides rd
            where rd.dealer_partner_id = me.id and rd.status = 'completed' and rd.ended_at is not null
              and date_trunc('month', rd.ended_at at time zone 'Africa/Porto-Novo')::date = g.m::date), 0)::int
  from me, t,
       generate_series(
         greatest((t.m0 - ((greatest(least(p_n, 36), 1) - 1) || ' months')::interval)::date,
                  date_trunc('month', me.created_at at time zone 'Africa/Porto-Novo')::date)::timestamp,
         t.m0::timestamp, interval '1 month') as g(m)
  order by g.m desc;
$fn$;
revoke execute on function public.dealer_my_months(uuid, int) from public, anon;
grant execute on function public.dealer_my_months(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Dernières courses : date, véhicule, part. Ni prix, ni adresses, ni part du chauffeur.
-- ---------------------------------------------------------------------------
create or replace function public.dealer_my_recent(p_dealer_id uuid default null, p_limit int default 60)
returns table (
  ride_id uuid,
  ended_at timestamptz,
  vehicle_id uuid,
  plate_number text,
  brand text,
  model text,
  share_fcfa int
)
language sql stable security definer set search_path = public as $fn$
  select rd.id, rd.ended_at, v.id, v.plate_number, v.brand, v.model, rd.dealer_share_fcfa
  from public.rides rd
  join public.dealer_partners me on me.id = public._dealer_resolve(p_dealer_id)
  left join public.vehicles v on v.id = rd.vehicle_id
  where rd.dealer_partner_id = me.id and rd.status = 'completed' and rd.ended_at is not null
  order by rd.ended_at desc
  limit greatest(least(p_limit, 300), 1);
$fn$;
revoke execute on function public.dealer_my_recent(uuid, int) from public, anon;
grant execute on function public.dealer_my_recent(uuid, int) to authenticated;
