-- ============================================================
-- TamCar — Maintien en flotte (prélèvement mensuel sur le fonds de rachat) + forfaits internet des meilleurs chauffeurs (2026-10-11)
--
--   Décisions de Terence (2026-10-11) : pas d'avance de démarrage (ADR) demandée aux partenaires ; TamCar avance les frais d'entrée d'une
--   voiture (inspection 10 000 F + habillage 10 000 F + kit chauffeur 10 000 F = 30 000 F) ; un prélèvement mensuel de 3 points du volume
--   (30 ‰) sur le fonds de rachat finance le maintien du véhicule dans la flotte : entrée, produits de senteur, gadgets et forfaits
--   internet des meilleurs. Il REMPLACE le prélèvement « senteur » (3 000 F/mois), qui passe à 0 pour ne pas être compté deux fois.
--   Forfait internet : chaque semaine, 20 % des chauffeurs ayant atteint leur objectif (au moins 3), par ordre décroissant de performance.
-- ============================================================

-- 1. Prélèvement « maintien en flotte » ------------------------------------------------------------------------------------------
insert into public.program_rules (key, value, label) values
  ('upkeep_permille_essentiel', 30, 'Maintien en flotte : prélèvement mensuel sur le fonds de rachat, voiture Essentiel (en ‰ du volume du mois : 30 = 3 %)'),
  ('upkeep_permille_confort',   30, 'Maintien en flotte : prélèvement mensuel sur le fonds de rachat, voiture Confort (en ‰ du volume : 30 = 3 %)'),
  ('upkeep_permille_premium',   30, 'Maintien en flotte : prélèvement mensuel sur le fonds de rachat, VIP (en ‰ du volume : 30 = 3 %)'),
  ('upkeep_permille_moto',      0,  'Maintien en flotte : prélèvement mensuel sur le fonds de rachat, moto (en ‰ du volume : 0 = aucun, véhicule de TamCar)'),
  ('upkeep_permille_tricycle',  0,  'Maintien en flotte : prélèvement mensuel sur le fonds de rachat, tricycle (en ‰ du volume : 0 = aucun, véhicule de TamCar)')
on conflict (key) do update set label = excluded.label;

-- Les senteurs sont désormais comprises dans le prélèvement : on évite le double prélèvement
update public.program_rules set value = 0 where key in ('senteur_essentiel', 'senteur_confort', 'senteur_premium');
update public.program_rules set label = label || ' — REMPLACÉ par le prélèvement « maintien en flotte » (mettre à 0)'
 where key like 'senteur\_%' and label not like '%REMPLACÉ%';

create table if not exists public.driver_upkeep_log (
  driver_id uuid not null references public.drivers(id) on delete cascade,
  month date not null,
  volume_fcfa bigint not null default 0,
  permille int not null,
  due_fcfa int not null,
  charged_fcfa int not null,
  created_at timestamptz not null default now(),
  primary key (driver_id, month)
);
alter table public.driver_upkeep_log enable row level security;
drop policy if exists driver_upkeep_log_admin on public.driver_upkeep_log;
create policy driver_upkeep_log_admin on public.driver_upkeep_log for select using (public.is_admin());
drop policy if exists driver_upkeep_log_own on public.driver_upkeep_log;
create policy driver_upkeep_log_own on public.driver_upkeep_log for select
  using (exists (select 1 from public.drivers d where d.id = driver_upkeep_log.driver_id and d.profile_id = auth.uid()));
revoke all on public.driver_upkeep_log from anon, authenticated;
grant select on public.driver_upkeep_log to authenticated;

create or replace function public._upkeep_permille(p_category text)
returns int
language sql stable security definer set search_path = public as $fn$
  select case p_category
    when 'moto'      then public._program_rule('upkeep_permille_moto')
    when 'tricycle'  then public._program_rule('upkeep_permille_tricycle')
    when 'essentiel' then public._program_rule('upkeep_permille_essentiel')
    when 'confort'   then public._program_rule('upkeep_permille_confort')
    when 'premium'   then public._program_rule('upkeep_permille_premium')
    else 0 end;
$fn$;
revoke execute on function public._upkeep_permille(text) from public, anon, authenticated;

-- Le dernier jour du mois : prélève, sur le fonds de rachat de chaque chauffeur en formule Cession, X ‰ du volume du mois (jamais au-delà du fonds
-- disponible). Une seule fois par chauffeur et par mois (journal), sans effet avant la date de démarrage des primes (comme les senteurs).
create or replace function public._charge_upkeep(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Porto-Novo')::date);
  v_month date := date_trunc('month', coalesce(p_day, (now() at time zone 'Africa/Porto-Novo')::date))::date;
  v_last date;
  r record;
  v_permille int;
  v_vol bigint;
  v_due int;
  v_wallet uuid;
  v_bal int;
  v_take int;
  v_log date;
  v_n int := 0;
  v_total int := 0;
begin
  v_last := (v_month + interval '1 month' - interval '1 day')::date;
  if v_day <> v_last then
    return jsonb_build_object('day', v_day, 'skipped', 'not_last_day');
  end if;
  if v_day < public._bonus_start() then
    return jsonb_build_object('day', v_day, 'skipped', 'not_started', 'starts_on', public._bonus_start());
  end if;

  for r in
    select d.id as driver_id, d.profile_id, v.category::text as cat
      from public.drivers d
      join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.application_type::text = 'cession'
  loop
    v_permille := public._upkeep_permille(r.cat);
    if v_permille <= 0 then continue; end if;

    select id, balance_fcfa into v_wallet, v_bal
      from public.wallets where profile_id = r.profile_id and kind = 'tamcar_rachat' for update;
    if v_wallet is null then continue; end if;

    select coalesce(sum(x.price_total_fcfa), 0) into v_vol
      from public.rides x
     where x.driver_id = r.driver_id and x.status = 'completed'
       and (x.ended_at at time zone 'Africa/Porto-Novo')::date between v_month and v_last;
    v_due := floor(v_vol * v_permille / 1000.0)::int;
    v_take := least(v_due, greatest(v_bal, 0));

    insert into public.driver_upkeep_log (driver_id, month, volume_fcfa, permille, due_fcfa, charged_fcfa)
    values (r.driver_id, v_month, v_vol, v_permille, v_due, v_take)
    on conflict (driver_id, month) do nothing
    returning month into v_log;
    if v_log is null then continue; end if;   -- déjà prélevé ce mois-ci

    if v_take > 0 then
      update public.wallets set balance_fcfa = balance_fcfa - v_take, updated_at = now() where id = v_wallet;
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
      values (v_wallet, 'fleet_upkeep_fee', -v_take, 'internal', 'success',
              jsonb_build_object('month', v_month, 'volume', v_vol, 'permille', v_permille, 'due', v_due));
      v_n := v_n + 1;
      v_total := v_total + v_take;
    end if;
  end loop;

  return jsonb_build_object('day', v_day, 'month', v_month, 'drivers', v_n, 'total_fcfa', v_total);
end;
$fn$;
revoke execute on function public._charge_upkeep(date) from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'upkeep-monthly') then perform cron.unschedule('upkeep-monthly'); end if;
  perform cron.schedule('upkeep-monthly', '50 22 * * *', 'select public._charge_upkeep()');
end
$do$;

-- 2. Forfaits internet des meilleurs chauffeurs ----------------------------------------------------------------------------------
insert into public.program_rules (key, value, label) values
  ('data_bundle_top_pct',      20,   'Forfaits internet : part des chauffeurs éligibles récompensés chaque semaine (%)'),
  ('data_bundle_min_winners',  3,    'Forfaits internet : nombre minimal de bénéficiaires par semaine (s''il y a assez d''éligibles)'),
  ('data_bundle_max_winners',  10,   'Forfaits internet : nombre maximal de bénéficiaires par semaine (0 = pas de plafond)'),
  ('data_bundle_min_days',     4,    'Forfaits internet : jours d''objectif atteints sur 6 (lundi-samedi) pour être éligible'),
  ('data_bundle_min_rating',   45,   'Forfaits internet : note minimale de la semaine, en dixièmes d''étoile (45 = 4,5 ; 0 = pas de condition)'),
  ('data_bundle_cost_fcfa',    1000, 'Forfaits internet : coût d''un forfait hebdomadaire (F), pour le suivi du budget')
on conflict (key) do update set label = excluded.label;

insert into public._push_settings (key, value) values ('data_bundle_from', '2027-07-01')
on conflict (key) do nothing;

create or replace function public._data_bundle_start()
returns date
language sql stable security definer set search_path = public as $fn$
  select coalesce((select nullif(value, '')::date from public._push_settings where key = 'data_bundle_from'), date '2027-07-01');
$fn$;
revoke execute on function public._data_bundle_start() from public, anon, authenticated;

create table if not exists public.data_bundle_awards (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  rank int not null,
  days_met int not null,
  volume_fcfa bigint not null,
  objective_fcfa bigint not null,
  ratio numeric,
  rating numeric,
  status text not null default 'selected' check (status in ('selected', 'sent', 'cancelled')),
  sent_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (week_start, profile_id)
);
create index if not exists data_bundle_awards_week_idx on public.data_bundle_awards (week_start desc, rank);
alter table public.data_bundle_awards enable row level security;
drop policy if exists data_bundle_awards_admin on public.data_bundle_awards;
create policy data_bundle_awards_admin on public.data_bundle_awards for select using (public.is_admin());
drop policy if exists data_bundle_awards_own on public.data_bundle_awards;
create policy data_bundle_awards_own on public.data_bundle_awards for select using (profile_id = auth.uid());
revoke all on public.data_bundle_awards from anon, authenticated;
grant select on public.data_bundle_awards to authenticated;

create or replace function public.admin_set_program_rule(p_key text, p_value int)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_value is null or p_value < 0 then raise exception 'Valeur invalide'; end if;
  if (p_key like 'share_%' or p_key in ('surplus_cede_pct', 'tamassur_fund_pct')) and p_value > 100 then
    raise exception 'Un pourcentage ne peut pas dépasser 100.';
  end if;
  if p_key like 'tamassur_months_%' then
    if p_value < 1 or p_value > 120 then raise exception 'Une durée doit être comprise entre 1 et 120 mois.'; end if;
  elsif p_key like 'tamassur_%' and p_key <> 'tamassur_fund_pct' and p_value < 100 then
    raise exception 'Une cotisation quotidienne doit être d''au moins 100 F.';
  end if;
  if p_key in ('payments_test_mode', 'payouts_auto', 'payments_provider') and p_value not in (0, 1) then
    raise exception 'Ce réglage se règle sur 1 (activé) ou 0 (désactivé).';
  end if;
  if p_key = 'booking_penalty_fcfa' and p_value > 5000 then
    raise exception 'La pénalité de réservation ne peut pas dépasser 5 000 F.';
  end if;
  if p_key like 'upkeep\_permille\_%' and p_value > 80 then
    raise exception 'Au plus 80 ‰ du volume (8 %%) : le fonds de rachat ne reçoit pas plus.';
  end if;
  if p_key = 'data_bundle_top_pct' and (p_value < 1 or p_value > 100) then
    raise exception 'Entre 1 et 100 %%.';
  end if;
  if p_key = 'data_bundle_min_days' and (p_value < 1 or p_value > 6) then
    raise exception 'Entre 1 et 6 jours.';
  end if;
  if p_key = 'data_bundle_min_rating' and p_value > 50 then
    raise exception 'La note minimale s''exprime en dixièmes d''étoile (45 = 4,5) et ne peut pas dépasser 50.';
  end if;
  if p_key = 'data_bundle_min_winners' and p_value > 100 then
    raise exception 'Au plus 100 bénéficiaires minimum.';
  end if;
  if p_key = 'data_bundle_max_winners' and p_value > 500 then
    raise exception 'Au plus 500 bénéficiaires par semaine.';
  end if;
  if p_key = 'data_bundle_cost_fcfa' and p_value > 20000 then
    raise exception 'Au plus 20 000 F par forfait.';
  end if;
  if p_key = 'payout_auto_max_fcfa' and p_value > 500000 then
    raise exception 'Au plus 500 000 F (limite d''un retrait).';
  end if;
  if p_key = 'payout_auto_daily_cap_fcfa' and p_value > 2000000 then
    raise exception 'Au plus 2 000 000 F par chauffeur et par jour.';
  end if;
  if p_key = 'payout_hold_new_number' and p_value not in (0, 1) then
    raise exception 'Mettre 0 ou 1.';
  end if;
  if p_key = 'rdv_capacity_per_slot' and (p_value < 1 or p_value > 20) then
    raise exception 'Entre 1 et 20 candidats par créneau.';
  end if;
  if p_key in ('gadget_driver_min_rating', 'gadget_client_min_rating') and p_value > 50 then
    raise exception 'Une note minimale s''exprime en dixièmes d''étoile (47 = 4,7) et ne peut pas dépasser 50.';
  end if;
  if p_key in ('gadget_winners_drivers', 'gadget_winners_clients') and p_value > 50 then
    raise exception 'Au plus 50 gagnants par catégorie.';
  end if;
  if p_key = 'prio_enabled' and p_value not in (0, 1) then
    raise exception 'La priorité de proximité se règle sur 1 (active) ou 0 (désactivée).';
  end if;
  if p_key like 'prio_r%_m' and (p_value < 500 or p_value > 50000) then
    raise exception 'Un rayon doit être compris entre 500 m et 50 000 m.';
  end if;
  if p_key like 'prio_d%_s' and p_value > 300 then
    raise exception 'Un délai ne peut pas dépasser 300 secondes.';
  end if;
  update public.program_rules set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'Réglage inconnu'; end if;
end;
$fn$;
revoke execute on function public.admin_set_program_rule(text, int) from public, anon;
grant execute on function public.admin_set_program_rule(text, int) to authenticated;

-- Classement d'une semaine (lundi-samedi) : éligibles = au moins X jours d'objectif atteints, note suffisante, aucune annulation imputable.
-- Performance = volume de la semaine ÷ (objectif quotidien de la catégorie × 6). Bénéficiaires = X % des éligibles, au moins N (dans la limite des éligibles).
drop function if exists public.admin_data_bundle_ranking(date);
create function public.admin_data_bundle_ranking(p_week_start date)
returns table (
  rank_pos int, profile_id uuid, driver_id uuid, full_name text, phone text, category text,
  days_met int, volume_fcfa bigint, objective_fcfa bigint, ratio numeric, rating numeric, cancels int,
  eligible boolean, reason text, is_winner boolean
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_from date := date_trunc('week', p_week_start)::date;
  v_to date := date_trunc('week', p_week_start)::date + 5;
  v_min_days int := public._program_rule('data_bundle_min_days');
  v_min_rating int := public._program_rule('data_bundle_min_rating');
  v_pct int := public._program_rule('data_bundle_top_pct');
  v_min_w int := public._program_rule('data_bundle_min_winners');
  v_max_w int := public._program_rule('data_bundle_max_winners');
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  return query
  with drv as (
    select d.id as did, d.profile_id as pid, p.full_name::text as fname, p.phone::text as fphone, v.category::text as cat,
           public._vehicle_floor(v.category::text) as fl
      from public.drivers d
      join public.vehicles v on v.id = d.current_vehicle_id
      join public.profiles p on p.id = d.profile_id
     where d.status::text = 'active' and d.application_type::text <> 'proprietaire' and p.role::text <> 'admin'
  ),
  vol as (
    select r.driver_id as did, (r.ended_at at time zone 'Africa/Porto-Novo')::date as day, sum(r.price_total_fcfa)::bigint as v
      from public.rides r
     where r.status::text = 'completed'
       and (r.ended_at at time zone 'Africa/Porto-Novo')::date between v_from and v_to
     group by 1, 2
  ),
  agg as (
    select dr.did, dr.pid, dr.fname, dr.fphone, dr.cat, dr.fl,
           coalesce(sum(vl.v), 0)::bigint as vol_w,
           (count(*) filter (where dr.fl > 0 and vl.v >= dr.fl))::int as days_ok
      from drv dr left join vol vl on vl.did = dr.did
     group by dr.did, dr.pid, dr.fname, dr.fphone, dr.cat, dr.fl
  ),
  sc as (
    select a.*,
           (select round(avg(x.stars)::numeric, 2) from public.ratings x
             where x.rated_id = a.pid and (x.created_at at time zone 'Africa/Porto-Novo')::date between v_from and v_to) as rat,
           ((select count(*) from public.rides r
              where r.driver_id = a.did and r.cancel_attributed_to = 'driver'
                and (coalesce(r.cancelled_at, r.ended_at) at time zone 'Africa/Porto-Novo')::date between v_from and v_to)
            + (select count(*) from public.ride_driver_exclusions x join public.rides r on r.id = x.ride_id
                where x.driver_id = a.did and r.scheduled_at is not null and x.created_at >= r.scheduled_at - interval '10 minutes'
                  and (x.created_at at time zone 'Africa/Porto-Novo')::date between v_from and v_to))::int as canc
      from agg a
  ),
  ok as (
    select s.*,
           (s.fl > 0 and s.days_ok >= v_min_days and s.canc = 0
              and (v_min_rating = 0 or s.rat is null or s.rat * 10 >= v_min_rating)) as good,
           concat_ws(' · ',
             case when s.fl <= 0 then 'catégorie sans objectif' end,
             case when s.fl > 0 and s.days_ok < v_min_days then s.days_ok || ' jour' || case when s.days_ok > 1 then 's' else '' end || ' d''objectif sur ' || v_min_days || ' requis' end,
             case when s.canc > 0 then s.canc || ' annulation' || case when s.canc > 1 then 's imputables' else ' imputable' end end,
             case when v_min_rating > 0 and s.rat is not null and s.rat * 10 < v_min_rating then 'note ' || replace(s.rat::text, '.', ',') || ' sous ' || replace(round(v_min_rating / 10.0, 1)::text, '.', ',') end
           ) as why,
           case when s.fl > 0 then s.vol_w / (s.fl * 6.0) else 0 end as rt
      from sc s
  ),
  nw as (
    select count(*) filter (where good)::int as n_elig from ok
  ),
  ranked as (
    select o.*, row_number() over (order by o.good desc, o.rt desc, o.days_ok desc, o.rat desc nulls last, o.vol_w desc, o.fname) as pos
      from ok o
  )
  select r.pos::int, r.pid, r.did, r.fname, r.fphone, r.cat, r.days_ok, r.vol_w, (r.fl * 6)::bigint, round(r.rt::numeric, 3), r.rat, r.canc,
         r.good, nullif(r.why, ''),
         (r.good and r.pos <= case when nw.n_elig = 0 then 0
            else least(nw.n_elig, greatest(ceil(nw.n_elig * v_pct / 100.0)::int, v_min_w), case when v_max_w > 0 then v_max_w else nw.n_elig end) end)
    from ranked r cross join nw
   order by r.pos;
end;
$fn$;
revoke execute on function public.admin_data_bundle_ranking(date) from public, anon;
grant execute on function public.admin_data_bundle_ranking(date) to authenticated;

-- Validation d'une semaine terminée : enregistre les bénéficiaires (une seule fois) et les prévient.
create or replace function public.admin_data_bundle_validate(p_week_start date)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_from date := date_trunc('week', p_week_start)::date;
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_n int := 0;
  g record;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if v_from < public._data_bundle_start() then
    raise exception 'Les forfaits internet démarrent le %.', to_char(public._data_bundle_start(), 'DD/MM/YYYY');
  end if;
  if v_from + 6 > v_today then
    raise exception 'Cette semaine n''est pas terminée : validez à partir du dimanche %.', to_char(v_from + 6, 'DD/MM/YYYY');
  end if;
  for g in select * from public.admin_data_bundle_ranking(v_from) x where x.is_winner loop
    insert into public.data_bundle_awards (week_start, profile_id, driver_id, rank, days_met, volume_fcfa, objective_fcfa, ratio, rating, created_by)
    values (v_from, g.profile_id, g.driver_id, g.rank_pos, g.days_met, g.volume_fcfa, g.objective_fcfa, g.ratio, g.rating, auth.uid())
    on conflict (week_start, profile_id) do nothing;
    if found then
      v_n := v_n + 1;
      perform public._push_notify(
        g.profile_id, 'Forfait internet offert',
        'Bravo : vous faites partie des meilleurs chauffeurs de la semaine. Un forfait internet vous est offert ; il sera activé sur votre numéro dans les prochaines heures.',
        '/wallet', 'data-bundle:' || v_from::text, false);
    end if;
  end loop;
  return v_n;
end;
$fn$;
revoke execute on function public.admin_data_bundle_validate(date) from public, anon;
grant execute on function public.admin_data_bundle_validate(date) to authenticated;

-- L'opérateur a activé les forfaits de la semaine : on le marque (les chauffeurs en sont prévenus).
create or replace function public.admin_data_bundle_mark_sent(p_week_start date)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_from date := date_trunc('week', p_week_start)::date;
  v_n int := 0;
  a record;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  for a in
    update public.data_bundle_awards set status = 'sent', sent_at = now()
     where week_start = v_from and status = 'selected'
    returning profile_id
  loop
    v_n := v_n + 1;
    perform public._push_notify(a.profile_id, 'Forfait internet activé',
      'Votre forfait internet de la semaine est activé sur votre numéro. Bonne route !', '/wallet', 'data-bundle-sent:' || v_from::text, false);
  end loop;
  return v_n;
end;
$fn$;
revoke execute on function public.admin_data_bundle_mark_sent(date) from public, anon;
grant execute on function public.admin_data_bundle_mark_sent(date) to authenticated;
