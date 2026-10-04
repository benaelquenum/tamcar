-- ============================================================
-- TamCar — Espace responsable opérations dans TamCar Pro + portefeuille (2026-10-04)
--
--   Le responsable opérations est aussi chauffeur : il accède à son tableau de bord
--   depuis TamCar Pro (l'accès repose sur ops_city_managers, pas sur le rôle).
--
--   Il peut :
--     - suivre l'activité des chauffeurs de sa ville (moto, tricycle, voiture) ;
--     - voir son portefeuille « responsable » : chaque course terminée de sa ville
--       lui rapporte 3 % du prix (taux de sa nomination), jusqu'à 150 000 F par mois ;
--       ses propres courses ne comptent pas.
--
--   Les 3 % sont désormais CRÉDITÉS (wallet `tamcar_ops`, type `ops_commission`),
--   au fil des courses. Le règlement au responsable se fait hors application, puis
--   l'admin l'enregistre (`admin_pay_ops_wallet`, type `ops_payout`).
--   Démarrage : même date que le bonus de performance (performance_bonus_from).
-- ============================================================

-- A. Journal des commissions (une ligne par course) ------------------------------
create table if not exists public.ops_commission_log (
  ride_id uuid primary key references public.rides(id) on delete cascade,
  mandate_id uuid not null references public.ops_city_managers(id) on delete cascade,
  manager_profile_id uuid not null references public.profiles(id) on delete cascade,
  city text not null,
  month date not null,
  volume_fcfa int not null,
  amount_fcfa int not null,
  created_at timestamptz not null default now()
);
create index if not exists ops_commission_log_mandate_month_idx on public.ops_commission_log (mandate_id, month);
alter table public.ops_commission_log enable row level security;
drop policy if exists ops_commission_log_select on public.ops_commission_log;
create policy ops_commission_log_select on public.ops_commission_log for select
  using (public.is_admin() or manager_profile_id = auth.uid());

-- B. Crédit de la commission à la fin de chaque course ---------------------------------
create or replace function public._credit_ops_commission(p_ride_id uuid)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  m public.ops_city_managers;
  v_driver_profile uuid;
  v_day date;
  v_month date;
  v_done int;
  v_amount int;
  v_wallet uuid;
  v_log uuid;
begin
  select * into r from public.rides where id = p_ride_id;
  if r.id is null or r.status::text <> 'completed' or r.ops_city is null or coalesce(r.price_total_fcfa, 0) <= 0 then
    return 0;
  end if;
  v_day := (coalesce(r.ended_at, now()) at time zone 'Africa/Porto-Novo')::date;
  if v_day < public._bonus_start() then return 0; end if;

  select * into m from public.ops_city_managers
   where city = r.ops_city and started_on <= v_day and (ended_on is null or ended_on >= v_day)
   order by started_on desc limit 1;
  if m.id is null then return 0; end if;

  -- Ses propres courses ne lui rapportent rien
  select profile_id into v_driver_profile from public.drivers where id = r.driver_id;
  if v_driver_profile is not null and v_driver_profile = m.profile_id then return 0; end if;

  perform pg_advisory_xact_lock(hashtext(m.id::text));
  v_month := date_trunc('month', v_day)::date;
  select coalesce(sum(amount_fcfa), 0)::int into v_done
    from public.ops_commission_log where mandate_id = m.id and month = v_month;
  v_amount := least(floor(r.price_total_fcfa * m.rate_pct / 100.0)::int, greatest(0, m.monthly_cap_fcfa - v_done));
  if v_amount <= 0 then return 0; end if;

  insert into public.ops_commission_log (ride_id, mandate_id, manager_profile_id, city, month, volume_fcfa, amount_fcfa)
  values (p_ride_id, m.id, m.profile_id, r.ops_city, v_month, r.price_total_fcfa, v_amount)
  on conflict (ride_id) do nothing
  returning ride_id into v_log;
  if v_log is null then return 0; end if;

  select id into v_wallet from public.wallets where profile_id = m.profile_id and kind = 'tamcar_ops';
  if v_wallet is null then
    insert into public.wallets (profile_id, kind, balance_fcfa) values (m.profile_id, 'tamcar_ops', 0)
    returning id into v_wallet;
  end if;
  update public.wallets set balance_fcfa = balance_fcfa + v_amount, updated_at = now() where id = v_wallet;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, provider, status, meta)
  values (v_wallet, 'ops_commission', v_amount, p_ride_id, 'internal', 'success',
          jsonb_build_object('city', r.ops_city, 'volume', r.price_total_fcfa, 'rate_pct', m.rate_pct, 'month', v_month));
  return v_amount;
end;
$fn$;
revoke execute on function public._credit_ops_commission(uuid) from public, anon, authenticated;

create or replace function public._ops_commission_trg()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  begin
    perform public._credit_ops_commission(new.id);
  exception when others then
    null;   -- ne jamais bloquer la fin d'une course
  end;
  return null;
end;
$fn$;
revoke execute on function public._ops_commission_trg() from public, anon, authenticated;

drop trigger if exists rides_ops_commission on public.rides;
create trigger rides_ops_commission
  after update of status on public.rides
  for each row
  when (new.status::text = 'completed' and old.status::text is distinct from 'completed')
  execute function public._ops_commission_trg();

-- C. Tableau de bord dans TamCar Pro ---------------------------------------------------
-- Ville d'un chauffeur : ville de sa dernière course (60 jours), sinon de sa dernière position.
create or replace function public._driver_ops_city(p_driver uuid)
returns text language sql stable security definer set search_path = public as $fn$
  select coalesce(
    (select r.ops_city from public.rides r
      where r.driver_id = p_driver and r.ops_city is not null and r.requested_at > now() - interval '60 days'
      order by r.requested_at desc limit 1),
    (select public.ops_city_for_point(st_y(d.current_location::geometry), st_x(d.current_location::geometry))
       from public.drivers d where d.id = p_driver and d.current_location is not null));
$fn$;
revoke execute on function public._driver_ops_city(uuid) from public, anon, authenticated;

create or replace function public.ops_pro_summary()
returns table (
  city text, rate_pct numeric, monthly_cap_fcfa int, mandate_active boolean, started_on date, ended_on date,
  month_start date, earned_month int, remaining_cap int, wallet_fcfa int,
  rides_month int, volume_month bigint, drivers_total int, drivers_online int,
  commission_started boolean, commission_start date
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  m public.ops_city_managers;
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_month date := date_trunc('month', (now() at time zone 'Africa/Porto-Novo')::date)::date;
  v_earned int;
  v_rides int;
  v_volume bigint;
  v_total int;
  v_online int;
begin
  if v_uid is null then raise exception 'Auth required'; end if;
  select * into m from public.ops_city_managers where profile_id = v_uid order by active desc, started_on desc limit 1;
  if m.id is null then return; end if;

  select coalesce(sum(amount_fcfa), 0)::int into v_earned
    from public.ops_commission_log where mandate_id = m.id and month = v_month;

  select count(*)::int, coalesce(sum(r.price_total_fcfa), 0)::bigint into v_rides, v_volume
    from public.rides r
    left join public.drivers d on d.id = r.driver_id
   where r.ops_city = m.city and r.status = 'completed'
     and r.ended_at >= (v_month::timestamp at time zone 'Africa/Porto-Novo')
     and (d.profile_id is null or d.profile_id <> v_uid);

  select count(*)::int, count(*) filter (where d.is_online)::int into v_total, v_online
    from public.drivers d
   where d.profile_id <> v_uid and d.status::text in ('active', 'suspended')
     and public._driver_ops_city(d.id) = m.city and m.active;

  return query select m.city, m.rate_pct, m.monthly_cap_fcfa, m.active, m.started_on, m.ended_on,
    v_month, v_earned, greatest(0, m.monthly_cap_fcfa - v_earned),
    coalesce((select balance_fcfa from public.wallets where profile_id = v_uid and kind = 'tamcar_ops'), 0)::int,
    v_rides, v_volume, v_total, v_online,
    v_today >= public._bonus_start(), public._bonus_start();
end;
$fn$;
revoke execute on function public.ops_pro_summary() from public, anon;
grant execute on function public.ops_pro_summary() to authenticated;

create or replace function public.ops_pro_drivers()
returns table (
  driver_id uuid, full_name text, phone text, category text, plate text,
  is_online boolean, last_seen_at timestamptz, driver_status text,
  rides_today int, volume_today bigint, rides_month int, volume_month bigint,
  floor_fcfa int, pct_today int
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  m public.ops_city_managers;
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_month date := date_trunc('month', (now() at time zone 'Africa/Porto-Novo')::date)::date;
begin
  if v_uid is null then raise exception 'Auth required'; end if;
  select * into m from public.ops_city_managers where profile_id = v_uid and active order by started_on desc limit 1;
  if m.id is null then return; end if;

  return query
  select d.id, p.full_name, p.phone, v.category::text, v.plate_number,
         d.is_online, d.last_seen_at, d.status::text,
         coalesce(s.rides_today, 0)::int, coalesce(s.volume_today, 0)::bigint,
         coalesce(s.rides_month, 0)::int, coalesce(s.volume_month, 0)::bigint,
         public._vehicle_floor(coalesce(v.category::text, 'essentiel')),
         case when public._vehicle_floor(coalesce(v.category::text, 'essentiel')) > 0
              then (coalesce(s.volume_today, 0) * 100 / public._vehicle_floor(coalesce(v.category::text, 'essentiel')))::int
              else 0 end
    from public.drivers d
    join public.profiles p on p.id = d.profile_id
    left join public.vehicles v on v.id = d.current_vehicle_id
    left join lateral (
      select count(*) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date = v_today) as rides_today,
             sum(r.price_total_fcfa) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date = v_today) as volume_today,
             count(*) as rides_month,
             sum(r.price_total_fcfa) as volume_month
        from public.rides r
       where r.driver_id = d.id and r.status = 'completed'
         and r.ended_at >= (v_month::timestamp at time zone 'Africa/Porto-Novo')
    ) s on true
   where d.profile_id <> v_uid and d.status::text in ('active', 'suspended')
     and public._driver_ops_city(d.id) = m.city
   order by d.is_online desc, coalesce(s.volume_today, 0) desc, p.full_name;
end;
$fn$;
revoke execute on function public.ops_pro_drivers() from public, anon;
grant execute on function public.ops_pro_drivers() to authenticated;

create or replace function public.ops_pro_daily()
returns table (day date, rides int, volume bigint, commission int)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  m public.ops_city_managers;
  v_month date := date_trunc('month', (now() at time zone 'Africa/Porto-Novo')::date)::date;
begin
  if v_uid is null then raise exception 'Auth required'; end if;
  select * into m from public.ops_city_managers where profile_id = v_uid order by active desc, started_on desc limit 1;
  if m.id is null then return; end if;
  return query
  select q.d, q.rides, q.volume, coalesce(c.amount, 0)::int
    from (
      select (r.ended_at at time zone 'Africa/Porto-Novo')::date as d, count(*)::int as rides, sum(r.price_total_fcfa)::bigint as volume
        from public.rides r left join public.drivers dr on dr.id = r.driver_id
       where r.ops_city = m.city and r.status = 'completed'
         and r.ended_at >= (v_month::timestamp at time zone 'Africa/Porto-Novo')
         and (dr.profile_id is null or dr.profile_id <> v_uid)
       group by 1) q
    left join (
      select (created_at at time zone 'Africa/Porto-Novo')::date as d, sum(amount_fcfa) as amount
        from public.ops_commission_log where mandate_id = m.id and month = v_month group by 1) c on c.d = q.d
   order by q.d desc;
end;
$fn$;
revoke execute on function public.ops_pro_daily() from public, anon;
grant execute on function public.ops_pro_daily() to authenticated;

-- D. Admin : soldes des responsables et enregistrement d'un règlement -----------------------
create or replace function public.admin_ops_wallets()
returns table (profile_id uuid, full_name text, phone text, city text, active boolean,
               balance_fcfa int, earned_month int, earned_total int)
language sql stable security definer set search_path = public as $fn$
  select m.profile_id, p.full_name, p.phone, m.city, m.active,
         coalesce((select w.balance_fcfa from public.wallets w where w.profile_id = m.profile_id and w.kind = 'tamcar_ops'), 0)::int,
         coalesce((select sum(l.amount_fcfa) from public.ops_commission_log l
                    where l.manager_profile_id = m.profile_id
                      and l.month = date_trunc('month', (now() at time zone 'Africa/Porto-Novo')::date)::date), 0)::int,
         coalesce((select sum(l.amount_fcfa) from public.ops_commission_log l where l.manager_profile_id = m.profile_id), 0)::int
    from public.ops_city_managers m join public.profiles p on p.id = m.profile_id
   where public.is_admin()
   order by m.active desc, p.full_name;
$fn$;
revoke execute on function public.admin_ops_wallets() from public, anon;
grant execute on function public.admin_ops_wallets() to authenticated;

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
  values (v_wallet, 'ops_payout', p_amount, 'internal', 'success',
          jsonb_build_object('note', nullif(trim(p_note), ''), 'by', auth.uid()));
  return v_bal - p_amount;
end;
$fn$;
revoke execute on function public.admin_pay_ops_wallet(uuid, int, text) from public, anon;
grant execute on function public.admin_pay_ops_wallet(uuid, int, text) to authenticated;
