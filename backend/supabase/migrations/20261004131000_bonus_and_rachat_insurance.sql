-- ============================================================
-- TamCar — Bonus de performance + TamAssur moitié sur le fonds de rachat (2026-10-04)
--
--   1. BONUS DE PERFORMANCE (au-dessus du plancher, sur le volume DANS L'APP)
--      Chaque soir (23 h 55 heure de Porto-Novo, du lundi au samedi), le volume
--      des courses terminées du jour est comparé à l'objectif du véhicule
--      (moto 4 500, tricycle 8 500, Essentiel 12 000, Confort 15 000 F) :
--         >= 150 % de l'objectif : 1 000 F
--         >= 175 %               : 1 500 F
--         >= 200 %               : 2 000 F      (paliers non cumulatifs)
--      Les montants incluent les 500 F de cotisation TamAssur que le chauffeur
--      paie en espèces. Chaque palier rapporte à TamCar plus qu'il ne coûte.
--      Le bonus est crédité sur le portefeuille Revenus (il éponge une dette).
--      Démarrage : réglage `performance_bonus_from` (2027-01-01 par défaut).
--      À cette date l'ancien bonus « +5 % dès la 16e course » est coupé
--      (sinon double paiement).
--
--   2. TAMASSUR : la cotisation de 1 000 F/j est financée pour moitié
--      (500 F) par le fonds de rachat du chauffeur, pour moitié par son
--      portefeuille Revenus. Si le fonds est insuffisant, la part manquante
--      est prélevée sur Revenus. L'épargne reçoit toujours 1 000 F.
-- ============================================================

-- A. Réglages du programme (modifiables depuis /admin/bonus) -----------------
create table if not exists public.program_rules (
  key text primary key,
  value int not null,
  label text not null,
  updated_at timestamptz not null default now()
);
alter table public.program_rules enable row level security;
drop policy if exists program_rules_select on public.program_rules;
create policy program_rules_select on public.program_rules for select using (public.is_admin());

insert into public.program_rules (key, value, label) values
  ('floor_moto',      4500,  'Objectif quotidien moto (F de volume dans l''app)'),
  ('floor_tricycle',  8500,  'Objectif quotidien tricycle (F)'),
  ('floor_essentiel', 12000, 'Objectif quotidien voiture Essentiel (F)'),
  ('floor_confort',   15000, 'Objectif quotidien voiture Confort (F)'),
  ('tier1_pct',       150,   'Palier 1 : % de l''objectif à atteindre'),
  ('tier1_fcfa',      1000,  'Palier 1 : bonus (F)'),
  ('tier2_pct',       175,   'Palier 2 : % de l''objectif à atteindre'),
  ('tier2_fcfa',      1500,  'Palier 2 : bonus (F)'),
  ('tier3_pct',       200,   'Palier 3 : % de l''objectif à atteindre'),
  ('tier3_fcfa',      2000,  'Palier 3 : bonus (F)'),
  ('tamassur_rachat_share_fcfa', 500, 'TamAssur : part de la cotisation quotidienne prélevée sur le fonds de rachat (F/jour)')
on conflict (key) do nothing;

create or replace function public._program_rule(p_key text)
returns int language sql stable security definer set search_path = public as $fn$
  select coalesce((select value from public.program_rules where key = p_key), 0);
$fn$;
revoke execute on function public._program_rule(text) from public, anon, authenticated;

create or replace function public.admin_set_program_rule(p_key text, p_value int)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_value is null or p_value < 0 then raise exception 'Valeur invalide'; end if;
  update public.program_rules set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'Réglage inconnu'; end if;
  -- cohérence des paliers : seuils et montants strictement croissants
  if not (public._program_rule('tier1_pct') < public._program_rule('tier2_pct')
      and public._program_rule('tier2_pct') < public._program_rule('tier3_pct')
      and public._program_rule('tier1_fcfa') <= public._program_rule('tier2_fcfa')
      and public._program_rule('tier2_fcfa') <= public._program_rule('tier3_fcfa')) then
    raise exception 'Les paliers doivent croître : seuils 1 < 2 < 3 et montants non décroissants.';
  end if;
  if public._program_rule('tamassur_rachat_share_fcfa') > 1000 then
    raise exception 'La part du fonds de rachat ne peut pas dépasser la cotisation minimale (1 000 F).';
  end if;
end;
$fn$;
revoke execute on function public.admin_set_program_rule(text, int) from public, anon;
grant execute on function public.admin_set_program_rule(text, int) to authenticated;

insert into public._push_settings (key, value) values ('performance_bonus_from', '2027-01-01')
on conflict (key) do nothing;

create or replace function public._bonus_start()
returns date language sql stable security definer set search_path = public as $fn$
  select coalesce((select nullif(value, '')::date from public._push_settings where key = 'performance_bonus_from'), date '2027-01-01');
$fn$;
revoke execute on function public._bonus_start() from public, anon, authenticated;

-- L'ancien bonus « +5 % dès la 16e course du jour » s'arrête quand le nouveau démarre.
create or replace function public._legacy_ride_bonus_on()
returns boolean language sql stable security definer set search_path = public as $fn$
  select (now() at time zone 'Africa/Porto-Novo')::date < public._bonus_start();
$fn$;
revoke execute on function public._legacy_ride_bonus_on() from public, anon, authenticated;

-- B. Journal des bonus (un par chauffeur et par jour) ----------------------
create table if not exists public.driver_bonus_log (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  day date not null,
  volume_fcfa int not null,
  floor_fcfa int not null,
  pct int not null,
  bonus_fcfa int not null,
  created_at timestamptz not null default now(),
  unique (driver_id, day)
);
create index if not exists driver_bonus_log_day_idx on public.driver_bonus_log (day desc);
alter table public.driver_bonus_log enable row level security;
drop policy if exists driver_bonus_log_select on public.driver_bonus_log;
create policy driver_bonus_log_select on public.driver_bonus_log for select
  using (public.is_admin() or driver_id in (select id from public.drivers where profile_id = auth.uid()));

create or replace function public._vehicle_floor(p_category text)
returns int language sql stable security definer set search_path = public as $fn$
  select case p_category
    when 'moto'      then public._program_rule('floor_moto')
    when 'tricycle'  then public._program_rule('floor_tricycle')
    when 'essentiel' then public._program_rule('floor_essentiel')
    when 'confort'   then public._program_rule('floor_confort')
    else 0 end;
$fn$;
revoke execute on function public._vehicle_floor(text) from public, anon, authenticated;

-- C. Jauge du chauffeur : volume du jour, objectif, palier atteint, prochain palier
drop function if exists public.driver_today_volume(uuid);
create or replace function public.driver_today_volume(p_driver_id uuid)
returns table (
  volume_today int,
  floor_fcfa int,
  pct int,
  bonus_now_fcfa int,
  next_pct int,
  next_bonus_fcfa int,
  fcfa_to_next int,
  bonus_started boolean,
  bonus_start date,
  bonus_day boolean
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_cat text;
  v_app text;
  v_floor int;
  v_vol int;
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_now int := 0;
  v_np int;
  v_nb int;
begin
  if not exists (select 1 from public.drivers d where d.id = p_driver_id and (d.profile_id = auth.uid() or public.is_admin())) then
    raise exception 'Not authorized';
  end if;
  select v.category::text, d.application_type::text into v_cat, v_app
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = p_driver_id;
  v_floor := case when v_app = 'proprietaire' then 0 else public._vehicle_floor(coalesce(v_cat, 'essentiel')) end;
  select coalesce(sum(r.price_total_fcfa), 0)::int into v_vol
    from public.rides r
   where r.driver_id = p_driver_id and r.status = 'completed'
     and (r.ended_at at time zone 'Africa/Porto-Novo')::date = v_today;

  if v_floor > 0 then
    select coalesce(max(t.amt), 0) into v_now
      from (values (public._program_rule('tier1_pct'), public._program_rule('tier1_fcfa')),
                   (public._program_rule('tier2_pct'), public._program_rule('tier2_fcfa')),
                   (public._program_rule('tier3_pct'), public._program_rule('tier3_fcfa'))) as t(p, amt)
     where v_vol * 100 >= t.p * v_floor;
    select t.p, t.amt into v_np, v_nb
      from (values (public._program_rule('tier1_pct'), public._program_rule('tier1_fcfa')),
                   (public._program_rule('tier2_pct'), public._program_rule('tier2_fcfa')),
                   (public._program_rule('tier3_pct'), public._program_rule('tier3_fcfa'))) as t(p, amt)
     where v_vol * 100 < t.p * v_floor
     order by t.p limit 1;
  end if;

  return query select
    v_vol, v_floor,
    case when v_floor > 0 then (v_vol * 100 / v_floor) else 0 end,
    v_now, v_np, v_nb,
    case when v_np is null then 0 else greatest(0, ceil(v_np * v_floor / 100.0)::int - v_vol) end,
    v_today >= public._bonus_start(), public._bonus_start(), extract(dow from v_today) <> 0;
end;
$fn$;
revoke execute on function public.driver_today_volume(uuid) from public, anon;
grant execute on function public.driver_today_volume(uuid) to authenticated;

-- D. Attribution quotidienne du bonus ---------------------------------------
create or replace function public.award_performance_bonus(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Porto-Novo')::date);
  v_drv record;
  v_floor int;
  v_vol int;
  v_bonus int;
  v_wallet uuid;
  v_paid int := 0;
  v_n int := 0;
  v_log uuid;
begin
  if extract(dow from v_day) = 0 then
    return jsonb_build_object('day', v_day, 'skipped', 'sunday');
  end if;
  if v_day < public._bonus_start() then
    return jsonb_build_object('day', v_day, 'skipped', 'not_started', 'starts_on', public._bonus_start());
  end if;

  for v_drv in
    select d.id, d.profile_id, v.category::text as cat
      from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.application_type::text <> 'proprietaire'
  loop
    v_floor := public._vehicle_floor(v_drv.cat);
    if v_floor <= 0 then continue; end if;
    select coalesce(sum(r.price_total_fcfa), 0)::int into v_vol
      from public.rides r
     where r.driver_id = v_drv.id and r.status = 'completed'
       and (r.ended_at at time zone 'Africa/Porto-Novo')::date = v_day;
    select coalesce(max(t.amt), 0) into v_bonus
      from (values (public._program_rule('tier1_pct'), public._program_rule('tier1_fcfa')),
                   (public._program_rule('tier2_pct'), public._program_rule('tier2_fcfa')),
                   (public._program_rule('tier3_pct'), public._program_rule('tier3_fcfa'))) as t(p, amt)
     where v_vol * 100 >= t.p * v_floor;
    if v_bonus <= 0 then continue; end if;

    v_log := null;
    insert into public.driver_bonus_log (driver_id, day, volume_fcfa, floor_fcfa, pct, bonus_fcfa)
    values (v_drv.id, v_day, v_vol, v_floor, (v_vol * 100 / v_floor), v_bonus)
    on conflict (driver_id, day) do nothing
    returning id into v_log;
    if v_log is null then continue; end if;

    select id into v_wallet from public.wallets where profile_id = v_drv.profile_id and kind = 'tamcar_revenus';
    if v_wallet is null then
      insert into public.wallets (profile_id, kind, balance_fcfa) values (v_drv.profile_id, 'tamcar_revenus', 0)
      returning id into v_wallet;
    end if;
    update public.wallets set balance_fcfa = balance_fcfa + v_bonus, updated_at = now() where id = v_wallet;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_wallet, 'performance_bonus', v_bonus, 'internal', 'success',
            jsonb_build_object('day', v_day, 'volume', v_vol, 'floor', v_floor, 'pct', (v_vol * 100 / v_floor)));

    perform public._push_notify(
      v_drv.profile_id, 'Bonus de performance : +' || v_bonus || ' F',
      'Vous avez atteint ' || (v_vol * 100 / v_floor) || ' % de votre objectif aujourd''hui. ' || v_bonus || ' F sont crédités sur votre portefeuille.',
      '/wallet', 'perf-bonus:' || v_day::text, false
    );
    v_paid := v_paid + v_bonus;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('day', v_day, 'drivers_rewarded', v_n, 'paid_fcfa', v_paid);
end;
$fn$;
revoke execute on function public.award_performance_bonus(date) from public, anon, authenticated;
grant execute on function public.award_performance_bonus(date) to service_role;

do $cron$
begin
  perform cron.unschedule('performance-bonus-daily');
exception when others then null;
end
$cron$;
-- 22 h 55 UTC = 23 h 55 à Porto-Novo
select cron.schedule('performance-bonus-daily', '55 22 * * *', $job$ select public.award_performance_bonus(); $job$);

-- E. Résumé pour l'admin ------------------------------------------------------
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
    'by_amount', coalesce((select jsonb_object_agg(bonus_fcfa::text, n) from (
        select bonus_fcfa, count(*) n from public.driver_bonus_log where day >= v_month group by 1) q), '{}'::jsonb),
    'total_paid', coalesce((select sum(bonus_fcfa) from public.driver_bonus_log), 0)
  );
end;
$fn$;
revoke execute on function public.admin_bonus_summary() from public, anon;
grant execute on function public.admin_bonus_summary() to authenticated;

-- F. Ancien bonus « +5 % dès la 16e course » : coupé au démarrage du nouveau
CREATE OR REPLACE FUNCTION public.credit_wallets_on_ride_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  w_id uuid;

  driver_profile_id uuid;

  dealer_profile_id uuid;

  driver_app_type driver_application_type;

  driver_created_at timestamptz;

  is_senior boolean := false;

  bonus_threshold int;

  rides_before_this int := 0;

  bonus int := 0;

  total_credited_to_driver int;

  months_active numeric;

  platform_rachat_share_pct numeric;

  platform_rachat_amount int;

  driver_rachat_amount int;

  v_dealer_id uuid;

  v_tamcar_holds boolean;

  v_commission int;

begin

  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then



    -- TamCar détient l'argent : paiement wallet OU prépayé (TamPass, NULL)

    v_tamcar_holds := (new.payment_method = 'tamcar_credit' or new.payment_method is null);



    -- 1. Débit wallet client UNIQUEMENT si paiement TamCar Crédit

    if new.payment_method = 'tamcar_credit' and new.price_total_fcfa > 0 then

      select id into w_id from public.wallets

        where profile_id = new.client_id and kind = 'tamcar_credit';

      if w_id is not null then

        update public.wallets

          set balance_fcfa = balance_fcfa - new.price_total_fcfa

          where id = w_id;

        insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)

        values (w_id, 'payment', new.price_total_fcfa, new.id, 'success');

      end if;

    end if;



    -- 2. Chauffeur

    if new.driver_id is not null then

      select application_type, profile_id, created_at

        into driver_app_type, driver_profile_id, driver_created_at

       from public.drivers where id = new.driver_id;



      if driver_app_type = 'cession' then

        select count(*)::int into rides_before_this

        from public.rides

        where driver_id = new.driver_id

          and status = 'completed'

          and id <> new.id

          and (ended_at at time zone 'Africa/Porto-Novo')::date

            = (new.ended_at at time zone 'Africa/Porto-Novo')::date;



        is_senior := (

          driver_created_at < now() - interval '6 months'

          and not exists (

            select 1 from public.driver_warnings w

            where w.driver_id = new.driver_id

              and w.issued_at > now() - interval '6 months'

          )

        );



        bonus_threshold := case when is_senior then 13 else 15 end;



        if rides_before_this >= bonus_threshold and public._legacy_ride_bonus_on() then

          bonus := floor(new.price_total_fcfa * 0.05)::int;

          bonus := least(bonus, new.platform_share_fcfa);

        end if;



      elsif driver_app_type = 'proprietaire' and new.driver_share_fcfa > 0 then

        bonus := least(floor(new.price_total_fcfa * 0.10)::int, 100);

        bonus := least(bonus, new.platform_share_fcfa);

      end if;



      select id into w_id from public.wallets

        where profile_id = driver_profile_id and kind = 'tamcar_revenus';



      if w_id is not null then

        if v_tamcar_holds then

          -- Cashless / prépayé : TamCar a encaissé -> crédite part chauffeur (+ bonus)

          total_credited_to_driver := new.driver_share_fcfa + bonus;

          if total_credited_to_driver > 0 then

            update public.wallets

              set balance_fcfa = balance_fcfa + total_credited_to_driver

              where id = w_id;

            insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)

            values (w_id, 'revenue_share_credit', total_credited_to_driver, new.id, 'success');

          end if;

        else

          -- Espèces / MoMo direct : le chauffeur détient tout le prix.

          v_commission := new.price_total_fcfa - new.driver_share_fcfa;

          if v_commission > 0 then

            update public.wallets

              set balance_fcfa = balance_fcfa - v_commission

              where id = w_id;

            insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)

            values (w_id, 'cash_commission', v_commission, new.id, 'success');

          end if;

          if bonus > 0 then

            update public.wallets

              set balance_fcfa = balance_fcfa + bonus

              where id = w_id;

            insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)

            values (w_id, 'revenue_share_credit', bonus, new.id, 'success');

          end if;

        end if;

      end if;



      -- Split fonds rachat (inchangé)

      if driver_app_type = 'cession' and new.driver_rachat_fcfa > 0 then

        months_active := extract(epoch from (now() - driver_created_at)) / (30.0 * 86400);

        platform_rachat_share_pct := case when months_active < 12 then 0.30 else 0.20 end;

        platform_rachat_amount := floor(new.driver_rachat_fcfa * platform_rachat_share_pct)::int;

        driver_rachat_amount := new.driver_rachat_fcfa - platform_rachat_amount;



        select id into w_id from public.wallets

          where profile_id = driver_profile_id and kind = 'tamcar_rachat';

        if w_id is not null then

          update public.wallets

            set balance_fcfa = balance_fcfa + driver_rachat_amount

            where id = w_id;

          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)

          values (w_id, 'rachat_credit', driver_rachat_amount, new.id, 'success');

        end if;



        select v.dealer_partner_id into v_dealer_id

          from public.vehicles v where v.id = new.vehicle_id;



        if v_dealer_id is not null and platform_rachat_amount > 0 then

          update public.dealer_advances

          set refunded_fcfa = refunded_fcfa + platform_rachat_amount,

              updated_at = now()

          where dealer_partner_id = v_dealer_id

            and status = 'active';

        end if;



      elsif new.driver_rachat_fcfa > 0 then

        select id into w_id from public.wallets

          where profile_id = driver_profile_id and kind = 'tamcar_rachat';

        if w_id is not null then

          update public.wallets

            set balance_fcfa = balance_fcfa + new.driver_rachat_fcfa

            where id = w_id;

          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)

          values (w_id, 'rachat_credit', new.driver_rachat_fcfa, new.id, 'success');

        end if;

      end if;

    end if;



    -- 3. Part partenaire véhicule (inchangé)

    if new.dealer_partner_id is not null and new.dealer_share_fcfa > 0 then

      select profile_id into dealer_profile_id

        from public.dealer_partners where id = new.dealer_partner_id;

      select id into w_id from public.wallets

        where profile_id = dealer_profile_id and kind = 'tamcar_revenus';

      if w_id is not null then

        update public.wallets

          set balance_fcfa = balance_fcfa + new.dealer_share_fcfa

          where id = w_id;

        insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)

        values (w_id, 'dealer_share_credit', new.dealer_share_fcfa, new.id, 'success');

      end if;

    end if;



  end if;

  return new;

end;

$function$;


-- G. TamAssur : moitié sur le fonds de rachat -------------------------------
alter table public.driver_insurance_charges add column if not exists from_rachat_fcfa int not null default 0;

create or replace function public.charge_driver_insurance(p_period date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn_charge$
declare
  v_period date := coalesce(
    p_period,
    (now() at time zone 'Africa/Porto-Novo')::date
  );
  v_from date;
  v_drv record;
  v_rev_id uuid;
  v_rev_bal int;
  v_epargne_id uuid;
  v_fund_id uuid;
  v_fund_bal int;
  v_fund_share int;
  v_rev_debit int;
  v_amount int;
  v_charge_id uuid;
  v_new_bal int;
  v_drivers int := 0;
  v_debited int := 0;
  v_total int := 0;
  v_from_fund int := 0;
  v_negative int := 0;
begin
  -- Pas de prélèvement le dimanche
  if extract(dow from v_period) = 0 then
    return jsonb_build_object('period', v_period, 'skipped', 'sunday');
  end if;

  -- Pas de prélèvement avant la date d'activation
  select nullif(value, '')::date into v_from
    from public._push_settings where key = 'tamassur_debit_from';
  v_from := coalesce(v_from, date '2027-01-01');
  if v_period < v_from then
    return jsonb_build_object('period', v_period, 'skipped', 'not_started', 'starts_on', v_from);
  end if;

  for v_drv in
    select id, profile_id, coalesce(tamassur_fcfa, 1000) as amount
      from public.drivers where status = 'active'
  loop
    v_drivers := v_drivers + 1;
    v_amount := greatest(v_drv.amount, 1000);

    -- Calendrier : la ligne du jour est créée directement « paid » ;
    -- si elle l'est déjà (relance de la tâche), on ne prélève pas deux fois.
    v_charge_id := null;
    insert into public.driver_insurance_charges
      (driver_id, period, amount_fcfa, collected_fcfa, status, collected_at)
    values (v_drv.id, v_period, v_amount, v_amount, 'paid', now())
    on conflict (driver_id, period) do update
      set amount_fcfa = excluded.amount_fcfa,
          collected_fcfa = excluded.collected_fcfa,
          status = 'paid',
          collected_at = now()
      where driver_insurance_charges.status <> 'paid'
    returning id into v_charge_id;
    if v_charge_id is null then continue; end if;

    -- Poches Revenus et Épargne (création paresseuse), verrou sur Revenus
    select id into v_rev_id from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_revenus';
    if v_rev_id is null then
      insert into public.wallets (profile_id, kind, balance_fcfa)
      values (v_drv.profile_id, 'tamcar_revenus', 0)
      returning id into v_rev_id;
    end if;
    select balance_fcfa into v_rev_bal from public.wallets where id = v_rev_id for update;

    select id into v_epargne_id from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_epargne';
    if v_epargne_id is null then
      insert into public.wallets (profile_id, kind, balance_fcfa)
      values (v_drv.profile_id, 'tamcar_epargne', 0)
      returning id into v_epargne_id;
    end if;

    -- Moitié de la cotisation sur le fonds de rachat du chauffeur (jamais en négatif :
    -- s'il est insuffisant, la part manquante reste à la charge du portefeuille Revenus)
    v_fund_share := 0;
    select id, balance_fcfa into v_fund_id, v_fund_bal from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_rachat' for update;
    if v_fund_id is not null then
      v_fund_share := greatest(0, least(public._program_rule('tamassur_rachat_share_fcfa'), v_fund_bal, v_amount));
    end if;
    v_rev_debit := v_amount - v_fund_share;

    -- Prélèvement ferme sur Revenus : le solde peut devenir négatif
    v_new_bal := v_rev_bal - v_rev_debit;
    update public.wallets set balance_fcfa = v_new_bal, updated_at = now() where id = v_rev_id;
    if v_fund_share > 0 then
      update public.wallets set balance_fcfa = balance_fcfa - v_fund_share, updated_at = now() where id = v_fund_id;
    end if;
    update public.wallets set balance_fcfa = balance_fcfa + v_amount, updated_at = now()
     where id = v_epargne_id;
    update public.driver_insurance_charges set from_rachat_fcfa = v_fund_share where id = v_charge_id;

    if v_rev_debit > 0 then
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
      values (v_rev_id, 'insurance_premium', v_rev_debit, 'internal', 'success',
              jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm'));
    end if;
    if v_fund_share > 0 then
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
      values (v_fund_id, 'tamassur_from_rachat', v_fund_share, 'internal', 'success',
              jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm'));
    end if;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_epargne_id, 'tamassur_saving', v_amount, 'internal', 'success',
            jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm',
                               'from_rachat', v_fund_share, 'from_revenus', v_rev_debit));

    v_debited := v_debited + 1;
    v_total := v_total + v_amount;
    v_from_fund := v_from_fund + v_fund_share;
    if v_new_bal < 0 then v_negative := v_negative + 1; end if;
  end loop;

  return jsonb_build_object(
    'period', v_period,
    'drivers_scanned', v_drivers,
    'debited', v_debited,
    'saved_fcfa', v_total,
    'from_rachat_fcfa', v_from_fund,
    'balances_negative', v_negative
  );
end;
$fn_charge$;

revoke execute on function public.charge_driver_insurance(date) from public, anon, authenticated;
grant execute on function public.charge_driver_insurance(date) to service_role;

