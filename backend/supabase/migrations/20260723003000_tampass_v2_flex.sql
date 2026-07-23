-- ============================================================
-- TamPass v2 — pass 100 % flexible (décisions Terence 2026-07-23)
--
--   1. Plus de formules prédéfinies : le client définit trajet, jours,
--      heures et durée (semaines). La remise découle de la FRÉQUENCE :
--        ≥ 40 trajets : −15 % · ≥ 20 : −10 % · ≥ 10 : −5 % · sinon 0 %.
--   2. Recherche de chauffeur élargie : les courses TamPass sont
--      ouvertes au matching 3 HEURES avant le créneau (au lieu de 15 min)
--      — les chauffeurs proches sont notifiés dès l'ouverture (trigger
--      push existant), la priorité attitré H-16→H-5 reste inchangée.
--   3. Chauffeur habituel ÉMERGENT : au premier trajet complété, le
--      chauffeur devient l'attitré de l'abonnement (s'il n'y en a pas).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Limites (jokers/pauses) portées par l'abonnement lui-même
-- ------------------------------------------------------------
alter table public.subscriptions alter column plan_code drop not null;
alter table public.subscriptions
  add column if not exists reports_per_month int not null default 2,
  add column if not exists pauses_max int not null default 1;

update public.subscriptions s
set reports_per_month = p.reports_per_month,
    pauses_max = p.pauses_max
from public.subscription_plans p
where p.code = s.plan_code;

-- ------------------------------------------------------------
-- 2. Achat flexible : fréquence libre, remise calculée côté serveur
-- ------------------------------------------------------------
create or replace function public.purchase_subscription_flex(
  p_category vehicle_category,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_origin_address text,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_dropoff_address text,
  p_distance_km numeric,
  p_duration_min int,
  p_days int[],
  p_slot_out time,
  p_slot_return time default null,
  p_weeks int default 4
)
returns public.subscriptions
language plpgsql security definer set search_path = public as $fn_flex$
declare
  v_trips_per_day int;
  v_rides_total int;
  v_discount numeric;
  v_unit int;
  v_total int;
  v_wallet public.wallets;
  v_sub public.subscriptions;
  v_starts date := current_date + 1;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_days is null or cardinality(p_days) = 0 then
    raise exception 'Choisissez au moins un jour';
  end if;
  if exists (select 1 from unnest(p_days) d where d < 1 or d > 7) then
    raise exception 'Jours invalides (1 = lundi … 7 = dimanche)';
  end if;
  if p_slot_out is null then
    raise exception 'Un créneau de départ est requis';
  end if;
  if p_weeks < 1 or p_weeks > 8 then
    raise exception 'Durée : entre 1 et 8 semaines';
  end if;

  v_trips_per_day := case when p_slot_return is not null then 2 else 1 end;
  v_rides_total := cardinality(p_days) * v_trips_per_day * p_weeks;

  -- Barème de remise par fréquence
  v_discount := case
    when v_rides_total >= 40 then 15
    when v_rides_total >= 20 then 10
    when v_rides_total >= 10 then 5
    else 0
  end;

  select price_total_fcfa into v_unit
  from public.compute_price(
    p_origin_lat, p_origin_lng, p_dropoff_lat, p_dropoff_lng,
    p_distance_km, p_duration_min, p_category, false, false
  );
  if v_unit is null or v_unit <= 0 then
    raise exception 'Impossible de calculer le prix du trajet';
  end if;

  v_total := round(v_unit * v_rides_total * (1 - v_discount / 100.0))::int;

  select * into v_wallet from public.wallets
  where profile_id = auth.uid() and kind = 'tamcar_credit'
  for update;
  if not found or v_wallet.balance_fcfa < v_total then
    raise exception 'Solde TamCar Crédit insuffisant (requis : % FCFA). Rechargez votre wallet.', v_total;
  end if;

  update public.wallets
  set balance_fcfa = balance_fcfa - v_total, updated_at = now()
  where id = v_wallet.id;

  insert into public.subscriptions (
    client_id, plan_code, category,
    origin_location, origin_address, dropoff_location, dropoff_address,
    distance_km, duration_min,
    days_of_week, slot_out, slot_return,
    rides_total, rides_remaining,
    reports_month, reports_per_month,
    pauses_max,
    unit_price_fcfa, discount_pct, total_price_fcfa,
    starts_on, expires_on
  ) values (
    auth.uid(), null, p_category,
    st_setsrid(st_makepoint(p_origin_lng, p_origin_lat), 4326)::geography,
    p_origin_address,
    st_setsrid(st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_dropoff_address,
    p_distance_km, p_duration_min,
    (select array_agg(distinct d order by d) from unnest(p_days) d),
    p_slot_out, p_slot_return,
    v_rides_total, v_rides_total,
    date_trunc('month', v_starts)::date, 2,
    case when p_weeks >= 4 then 1 else 0 end,
    v_unit, v_discount, v_total,
    v_starts, v_starts + p_weeks * 7
  )
  returning * into v_sub;

  insert into public.wallet_transactions
    (wallet_id, type, amount_fcfa, provider, status, meta)
  values
    (v_wallet.id, 'payment', -v_total, 'internal', 'success',
     jsonb_build_object('subscription_id', v_sub.id, 'kind', 'tampass',
                        'rides_total', v_rides_total, 'discount_pct', v_discount));

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'purchased',
          jsonb_build_object('total_fcfa', v_total, 'unit_fcfa', v_unit,
                             'rides_total', v_rides_total,
                             'discount_pct', v_discount, 'weeks', p_weeks));

  return v_sub;
end;
$fn_flex$;

grant execute on function public.purchase_subscription_flex to authenticated;

-- ------------------------------------------------------------
-- 3. Pause + joker : limites lues sur l'abonnement (plus sur le plan)
-- ------------------------------------------------------------
create or replace function public.pause_subscription(p_subscription_id uuid)
returns public.subscriptions
language plpgsql security definer set search_path = public as $fn_pause$
declare
  v_sub public.subscriptions;
  v_cancelled int := 0;
begin
  select * into v_sub from public.subscriptions
  where id = p_subscription_id and client_id = auth.uid()
  for update;
  if not found then raise exception 'Abonnement introuvable'; end if;
  if v_sub.status <> 'active' then raise exception 'Abonnement non actif'; end if;
  if v_sub.pauses_used >= v_sub.pauses_max then
    raise exception 'Nombre maximal de pauses atteint';
  end if;

  update public.subscriptions
  set status = 'paused',
      paused_until = current_date + 7,
      pauses_used = pauses_used + 1,
      expires_on = expires_on + 7
  where id = v_sub.id
  returning * into v_sub;

  update public.subscription_rides
  set status = 'cancelled'
  where subscription_id = v_sub.id
    and status = 'planned'
    and travel_date <= current_date + 7;
  get diagnostics v_cancelled = row_count;

  if v_cancelled > 0 then
    update public.subscriptions
    set rides_remaining = rides_remaining + v_cancelled
    where id = v_sub.id;
  end if;

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'paused',
          jsonb_build_object('until', v_sub.paused_until, 'recredited', v_cancelled));

  return v_sub;
end;
$fn_pause$;

create or replace function public.report_subscription_ride(p_subscription_ride_id uuid)
returns public.subscription_rides
language plpgsql security definer set search_path = public as $fn_report$
declare
  v_sr public.subscription_rides;
  v_sub public.subscriptions;
begin
  select sr.* into v_sr
  from public.subscription_rides sr
  join public.subscriptions s on s.id = sr.subscription_id
  where sr.id = p_subscription_ride_id and s.client_id = auth.uid()
  for update of sr;
  if not found then raise exception 'Trajet introuvable'; end if;
  if v_sr.status <> 'missed' then
    raise exception 'Seul un trajet manqué peut être reporté';
  end if;

  select * into v_sub from public.subscriptions
  where id = v_sr.subscription_id for update;

  if v_sub.reports_month is distinct from date_trunc('month', current_date)::date then
    update public.subscriptions
    set reports_used_month = 0,
        reports_month = date_trunc('month', current_date)::date
    where id = v_sub.id;
    v_sub.reports_used_month := 0;
  end if;

  if v_sub.reports_used_month >= v_sub.reports_per_month then
    raise exception 'Jokers du mois épuisés (% max)', v_sub.reports_per_month;
  end if;

  update public.subscription_rides
  set status = 'reported'
  where id = v_sr.id
  returning * into v_sr;

  update public.subscriptions
  set rides_remaining = rides_remaining + 1,
      reports_used_month = reports_used_month + 1
  where id = v_sub.id;

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'report_used', jsonb_build_object('subscription_ride_id', v_sr.id));

  return v_sr;
end;
$fn_report$;

-- ------------------------------------------------------------
-- 4. Monitor v2 : ouverture au matching 3 h avant le créneau
--    (le trigger existant notifie les chauffeurs proches à l'ouverture ;
--     la priorité attitré H-16→H-5 et la garantie ponctualité restent)
-- ------------------------------------------------------------
create or replace function public.tampass_monitor()
returns jsonb
language plpgsql security definer set search_path = public as $fn_tm$
declare
  v_sr record;
  v_slot_ts timestamptz;
  v_drv record;
  v_released int := 0;
  v_assigned int := 0;
  v_locked int := 0;
  v_recredited int := 0;
  v_wallet_id uuid;
begin
  -- Ouverture élargie : les courses TamPass partent au matching 3 h avant
  update public.rides r
  set status = 'requested', requested_at = now(), updated_at = now()
  from public.subscription_rides sr
  where sr.ride_id = r.id
    and sr.status = 'generated'
    and r.status = 'scheduled'
    and r.scheduled_at <= now() + interval '3 hours';
  get diagnostics v_released = row_count;

  for v_sr in
    select sr.id as sr_id, sr.ride_id, sr.travel_date, sr.slot_time,
           sr.fallback_started_at, sr.locked_at, sr.final_driver_id,
           s.id as sub_id, s.client_id, s.preferred_driver_id,
           r.status as ride_status, r.driver_id as ride_driver_id,
           r.pickup_location
    from public.subscription_rides sr
    join public.subscriptions s on s.id = sr.subscription_id
    join public.rides r on r.id = sr.ride_id
    where sr.status = 'generated'
      and sr.travel_date = (now() at time zone 'Africa/Porto-Novo')::date
      and r.status in ('scheduled', 'requested', 'matched')
  loop
    v_slot_ts := (v_sr.travel_date::timestamp + v_sr.slot_time) at time zone 'Africa/Porto-Novo';

    continue when now() < v_slot_ts - interval '16 minutes';

    -- Sync : un chauffeur a été assigné (titulaire ou remplaçant)
    if v_sr.ride_driver_id is not null and v_sr.final_driver_id is null then
      update public.subscription_rides
      set final_driver_id = v_sr.ride_driver_id,
          locked_at = case when now() >= v_slot_ts - interval '5 minutes'
                           then now() else locked_at end
      where id = v_sr.sr_id;
      v_locked := v_locked + 1;
      continue;
    end if;

    -- Garantie ponctualité : slot + 20 min sans chauffeur
    if v_sr.ride_driver_id is null
       and now() > v_slot_ts + interval '20 minutes' then

      update public.rides
      set status = 'cancelled', cancelled_at = now(),
          cancel_reason = 'tampass_garantie_ponctualite'
      where id = v_sr.ride_id and driver_id is null
        and status in ('scheduled', 'requested');

      if found then
        update public.subscription_rides
        set status = 'recredited' where id = v_sr.sr_id;

        update public.subscriptions
        set rides_remaining = rides_remaining + 1 where id = v_sr.sub_id;

        select id into v_wallet_id from public.wallets
        where profile_id = v_sr.client_id and kind = 'tamcar_credit';
        if v_wallet_id is not null then
          update public.wallets
          set balance_fcfa = balance_fcfa + 500, updated_at = now()
          where id = v_wallet_id;
          insert into public.wallet_transactions
            (wallet_id, type, amount_fcfa, provider, status, meta)
          values (v_wallet_id, 'refund', 500, 'internal', 'success',
                  jsonb_build_object('kind', 'tampass_ponctualite',
                                     'subscription_ride_id', v_sr.sr_id));
        end if;

        insert into public.subscription_events (subscription_id, event_type, payload)
        values (v_sr.sub_id, 'recredited',
                jsonb_build_object('subscription_ride_id', v_sr.sr_id, 'geste_fcfa', 500));

        perform public._push_notify(
          v_sr.client_id,
          'Trajet non assuré — trajet recrédité',
          'Aucun chauffeur disponible pour votre créneau. Le trajet est recrédité sur votre pass + 500 F offerts.',
          '/', 'tampass-ponctualite', true
        );
        v_recredited := v_recredited + 1;
      end if;
      continue;
    end if;

    -- Priorité titulaire : H-16 → H-5, re-vérifiée chaque minute
    if v_sr.preferred_driver_id is not null
       and v_sr.ride_driver_id is null
       and now() >= v_slot_ts - interval '16 minutes'
       and now() <  v_slot_ts - interval '5 minutes' then

      select d.id, d.profile_id, d.current_vehicle_id, v.dealer_partner_id
        into v_drv
      from public.drivers d
      left join public.vehicles v on v.id = d.current_vehicle_id
      where d.id = v_sr.preferred_driver_id
        and d.is_online = true
        and d.status = 'active'
        and d.current_vehicle_id is not null
        and d.current_location is not null
        and st_dwithin(d.current_location, v_sr.pickup_location, 5000)
        and (select count(*) from public.rides r2
             where r2.driver_id = d.id
               and r2.status in ('matched', 'arrived', 'in_progress')) < 2;

      if v_drv.id is not null then
        update public.rides
        set driver_id = v_drv.id,
            vehicle_id = v_drv.current_vehicle_id,
            dealer_partner_id = v_drv.dealer_partner_id,
            status = 'matched', matched_at = now(), updated_at = now()
        where id = v_sr.ride_id
          and driver_id is null
          and status in ('scheduled', 'requested');

        if found then
          update public.subscription_rides
          set final_driver_id = v_drv.id
          where id = v_sr.sr_id;

          perform public._push_notify(
            v_drv.profile_id, 'Trajet TamPass dans 15 min',
            'Votre abonné vous attend au créneau habituel.',
            '/dashboard', 'tampass-assign', true
          );
          perform public._push_notify(
            v_sr.client_id, 'Votre chauffeur arrive',
            'Votre chauffeur habituel prend en charge votre trajet TamPass.',
            '/', 'tampass-assign', false
          );
          v_assigned := v_assigned + 1;
        end if;
      elsif v_sr.fallback_started_at is null then
        update public.subscription_rides
        set fallback_started_at = now() where id = v_sr.sr_id;
      end if;
    end if;

    -- H-5 : verrouillage
    if v_sr.locked_at is null
       and now() >= v_slot_ts - interval '5 minutes' then
      update public.subscription_rides
      set locked_at = now(), final_driver_id = coalesce(final_driver_id, v_sr.ride_driver_id)
      where id = v_sr.sr_id;
    end if;
  end loop;

  return jsonb_build_object('released', v_released, 'assigned', v_assigned,
                            'locked', v_locked, 'recredited', v_recredited);
end;
$fn_tm$;

-- ------------------------------------------------------------
-- 5. Nightly v2 : + chauffeur habituel émergent (1er trajet complété)
-- ------------------------------------------------------------
create or replace function public.tampass_nightly()
returns jsonb
language plpgsql security definer set search_path = public as $fn_tn$
declare
  v_date date := (now() at time zone 'Africa/Porto-Novo')::date + 1;
  v_generated int;
  v_created int;
  v_completed int;
  v_missed int;
  v_adopted int;
begin
  update public.subscription_rides sr
  set status = 'completed'
  from public.rides r
  where r.id = sr.ride_id
    and sr.status = 'generated'
    and r.status = 'completed';
  get diagnostics v_completed = row_count;

  update public.subscription_rides sr
  set status = 'missed'
  from public.rides r
  where r.id = sr.ride_id
    and sr.status = 'generated'
    and sr.travel_date < (now() at time zone 'Africa/Porto-Novo')::date
    and r.status not in ('completed', 'matched', 'arrived', 'in_progress');
  get diagnostics v_missed = row_count;

  -- Chauffeur habituel émergent : le dernier chauffeur ayant complété
  -- un trajet devient l'attitré de l'abonnement (si aucun défini)
  update public.subscriptions s
  set preferred_driver_id = x.driver_id
  from (
    select distinct on (sr.subscription_id)
           sr.subscription_id, r.driver_id
    from public.subscription_rides sr
    join public.rides r on r.id = sr.ride_id
    where sr.status = 'completed' and r.driver_id is not null
    order by sr.subscription_id, r.ended_at desc nulls last
  ) x
  where x.subscription_id = s.id
    and s.preferred_driver_id is null;
  get diagnostics v_adopted = row_count;

  v_generated := public.generate_subscription_rides(v_date);
  v_created := public.tampass_create_rides(v_date);
  return jsonb_build_object(
    'date', v_date, 'generated', v_generated, 'rides_created', v_created,
    'swept_completed', v_completed, 'swept_missed', v_missed,
    'preferred_adopted', v_adopted
  );
end;
$fn_tn$;
