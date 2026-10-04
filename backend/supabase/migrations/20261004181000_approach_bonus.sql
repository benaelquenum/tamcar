-- ============================================================
-- TamCar — Prime d'approche (2026-10-04)
--
--   Un chauffeur qui accepte une course dont le point de prise en charge est
--   éloigné reçoit une prime pour son déplacement. Exemple : le client est
--   à 4Q, le chauffeur est au CEG Zogbo (2,2 km à vol d'oiseau).
--
--   prime = taux du véhicule x (distance au moment de l'acceptation - distance gratuite)
--   - distance gratuite : 1 000 m (réglable)
--   - taux par km au-delà : moto 25 F, tricycle 50 F, voiture 100 F (≈ coût réel du carburant)
--   - plafond : la part de TamCar sur la course (voiture 23 %, moto et tricycle 60 %
--     du prix) : TamCar ne perd jamais d'argent sur une prime
--   - arrondie à 50 F inférieurs, minimum 50 F
--   - versée sur Revenus à la fin de la course, jamais si la course est annulée
--   Démarrage : même date que le bonus de performance (réglage performance_bonus_from).
-- ============================================================

insert into public.program_rules (key, value, label) values
  ('approach_free_m',        1000, 'Prime d''approche : distance du chauffeur au client sans prime (m)'),
  ('approach_rate_moto',     25,   'Prime d''approche : moto, F par km au-delà de la distance gratuite'),
  ('approach_rate_tricycle', 50,   'Prime d''approche : tricycle, F par km au-delà'),
  ('approach_rate_essentiel',100,  'Prime d''approche : voiture Essentiel, F par km au-delà'),
  ('approach_rate_confort',  100,  'Prime d''approche : voiture Confort, F par km au-delà'),
  ('approach_rate_premium',  100,  'Prime d''approche : voiture VIP, F par km au-delà'),
  ('approach_cap_pct',       100,  'Prime d''approche : plafond en % de la part de TamCar sur la course (100 = TamCar ne perd jamais)')
on conflict (key) do nothing;

create or replace function public._approach_rate(p_category text)
returns int language sql stable security definer set search_path = public as $fn$
  select case p_category
    when 'moto'      then public._program_rule('approach_rate_moto')
    when 'tricycle'  then public._program_rule('approach_rate_tricycle')
    when 'essentiel' then public._program_rule('approach_rate_essentiel')
    when 'confort'   then public._program_rule('approach_rate_confort')
    when 'premium'   then public._program_rule('approach_rate_premium')
    else public._program_rule('approach_rate_essentiel') end;
$fn$;
revoke execute on function public._approach_rate(text) from public, anon, authenticated;

-- Montant de la prime pour une catégorie, une distance (m) et un prix de course
create or replace function public._approach_amount(p_category text, p_distance_m int, p_price int)
returns int language sql stable security definer set search_path = public as $fn$
  select coalesce(case
    when p_distance_m is null or p_distance_m <= public._program_rule('approach_free_m') then 0
    else (
      select case when q.amt < 50 then 0 else (floor(q.amt / 50.0) * 50)::int end
        from (select least(
                (p_distance_m - public._program_rule('approach_free_m')) / 1000.0 * public._approach_rate(p_category),
                p_price * (case p_category
                             when 'moto' then public._program_rule('share_moto')
                             when 'tricycle' then public._program_rule('share_tricycle')
                             when 'confort' then public._program_rule('share_confort')
                             else public._program_rule('share_essentiel') end) / 100.0
                  * public._program_rule('approach_cap_pct') / 100.0) as amt) q
    ) end, 0);
$fn$;
revoke execute on function public._approach_amount(text, int, int) from public, anon, authenticated;

-- Journal (une ligne par course) ----------------------------------------------
create table if not exists public.driver_approach_log (
  ride_id uuid primary key references public.rides(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  distance_m int not null,
  bonus_fcfa int not null,
  created_at timestamptz not null default now()
);
create index if not exists driver_approach_log_created_idx on public.driver_approach_log (created_at desc);
alter table public.driver_approach_log enable row level security;
drop policy if exists driver_approach_log_select on public.driver_approach_log;
create policy driver_approach_log_select on public.driver_approach_log for select
  using (public.is_admin() or driver_id in (select id from public.drivers where profile_id = auth.uid()));

-- Paiement à la fin de la course -------------------------------------------------
create or replace function public._pay_approach_bonus(p_ride_id uuid)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  v_cat text;
  v_profile uuid;
  v_amount int;
  v_wallet uuid;
  v_log uuid;
begin
  select * into r from public.rides where id = p_ride_id;
  if r.id is null or r.status::text <> 'completed' or r.driver_id is null or r.driver_distance_at_match_m is null then
    return 0;
  end if;
  if (now() at time zone 'Africa/Porto-Novo')::date < public._bonus_start() then return 0; end if;

  select d.profile_id, v.category::text into v_profile, v_cat
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = r.driver_id;
  if v_profile is null then return 0; end if;

  v_amount := public._approach_amount(coalesce(v_cat, 'essentiel'), r.driver_distance_at_match_m, r.price_total_fcfa);
  if v_amount <= 0 then return 0; end if;

  insert into public.driver_approach_log (ride_id, driver_id, distance_m, bonus_fcfa)
  values (p_ride_id, r.driver_id, r.driver_distance_at_match_m, v_amount)
  on conflict (ride_id) do nothing
  returning ride_id into v_log;
  if v_log is null then return 0; end if;

  select id into v_wallet from public.wallets where profile_id = v_profile and kind = 'tamcar_revenus';
  if v_wallet is null then
    insert into public.wallets (profile_id, kind, balance_fcfa) values (v_profile, 'tamcar_revenus', 0)
    returning id into v_wallet;
  end if;
  update public.wallets set balance_fcfa = balance_fcfa + v_amount, updated_at = now() where id = v_wallet;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, provider, status, meta)
  values (v_wallet, 'approach_bonus', v_amount, p_ride_id, 'internal', 'success',
          jsonb_build_object('distance_m', r.driver_distance_at_match_m));
  perform public._push_notify(v_profile, 'Prime d''approche : +' || v_amount || ' F',
    'Vous êtes venu de loin chercher ce client : ' || v_amount || ' F sont crédités sur votre portefeuille.',
    '/wallet', 'approach:' || p_ride_id::text, false);
  return v_amount;
end;
$fn$;
revoke execute on function public._pay_approach_bonus(uuid) from public, anon, authenticated;

create or replace function public._approach_bonus_trg()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  begin
    perform public._pay_approach_bonus(new.id);
  exception when others then
    null;   -- jamais bloquer la fin d'une course
  end;
  return null;
end;
$fn$;
revoke execute on function public._approach_bonus_trg() from public, anon, authenticated;

drop trigger if exists rides_approach_bonus on public.rides;
create trigger rides_approach_bonus
  after update of status on public.rides
  for each row
  when (new.status::text = 'completed' and old.status::text is distinct from 'completed')
  execute function public._approach_bonus_trg();

-- Ce que le chauffeur voit sur l'offre ---------------------------------------------
create or replace function public.my_approach_plan()
returns table (free_m int, rate_per_km int, cap_pct int, share_pct int, started boolean, start_date date)
language sql stable security definer set search_path = public as $fn$
  select public._program_rule('approach_free_m'),
         public._approach_rate(coalesce(v.category::text, 'essentiel')),
         public._program_rule('approach_cap_pct'),
         case coalesce(v.category::text, 'essentiel')
           when 'moto' then public._program_rule('share_moto')
           when 'tricycle' then public._program_rule('share_tricycle')
           when 'confort' then public._program_rule('share_confort')
           else public._program_rule('share_essentiel') end,
         (now() at time zone 'Africa/Porto-Novo')::date >= public._bonus_start(),
         public._bonus_start()
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.profile_id = auth.uid();
$fn$;
revoke execute on function public.my_approach_plan() from public, anon;
grant execute on function public.my_approach_plan() to authenticated;

-- Résumé admin : ajoute la prime d'approche -------------------------------------------
create or replace function public.admin_bonus_summary()
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_month date := date_trunc('month', (now() at time zone 'Africa/Porto-Novo')::date)::date;
begin
  if not public.is_admin() then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'start', public._bonus_start(),
    'month_paid', coalesce((select sum(bonus_fcfa) from public.driver_bonus_log where day >= v_month), 0),
    'month_count', (select count(*) from public.driver_bonus_log where day >= v_month),
    'month_drivers', (select count(distinct driver_id) from public.driver_bonus_log where day >= v_month),
    'total_paid', coalesce((select sum(bonus_fcfa) from public.driver_bonus_log), 0),
    'approach_month_paid', coalesce((select sum(bonus_fcfa) from public.driver_approach_log where created_at >= v_month), 0),
    'approach_month_count', (select count(*) from public.driver_approach_log where created_at >= v_month),
    'approach_total_paid', coalesce((select sum(bonus_fcfa) from public.driver_approach_log), 0)
  );
end;
$fn$;
revoke execute on function public.admin_bonus_summary() from public, anon;
grant execute on function public.admin_bonus_summary() to authenticated;
