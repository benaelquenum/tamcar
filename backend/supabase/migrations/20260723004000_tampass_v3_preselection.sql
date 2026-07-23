-- ============================================================
-- TamPass v3 — chauffeur PRÉSÉLECTIONNÉ avant paiement
-- (modèle validé par Terence 2026-07-23)
--
-- Nouveau cycle de vie d'un abonnement :
--   1. pending_driver   : le client a défini trajet + fréquence, la
--      recherche du chauffeur est lancée (fenêtre 3 h). Les chauffeurs
--      proches et de la bonne catégorie sont notifiés ; l'offre affiche
--      le revenu estimé sur la période.
--   2. awaiting_payment : un chauffeur a accepté (il devient l'attitré).
--      Le client est notifié et a 24 h pour confirmer en payant.
--   3. active           : payé → les trajets se génèrent chaque soir.
--   (échec : recherche expirée ou paiement non confirmé → cancelled)
--
-- La recherche 1-3 h a lieu À LA SOUSCRIPTION. En exploitation, si
-- l'attitré est défaillant un jour donné, le secours par course reste :
-- priorité titulaire H-16→H-5, matching général à H-15 (ouverture
-- anticipée 3 h uniquement pour les abonnements sans attitré).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Statuts + colonnes du nouveau cycle
-- ------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('pending_driver', 'awaiting_payment', 'active',
                    'paused', 'expired', 'cancelled'));

alter table public.subscriptions
  add column if not exists searching_until timestamptz,
  add column if not exists payment_deadline timestamptz,
  add column if not exists preferred_driver_name text,
  add column if not exists preferred_driver_rating numeric(3,2);

-- ------------------------------------------------------------
-- 2. Demande de souscription : PAS de débit — lance la recherche
-- ------------------------------------------------------------
create or replace function public.request_subscription_flex(
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
language plpgsql security definer set search_path = public as $fn_req$
declare
  v_trips_per_day int;
  v_rides_total int;
  v_discount numeric;
  v_unit int;
  v_total int;
  v_sub public.subscriptions;
  v_starts date := current_date + 1;
  v_drv record;
  v_notified int := 0;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_days is null or cardinality(p_days) = 0 then
    raise exception 'Choisissez au moins un jour';
  end if;
  if exists (select 1 from unnest(p_days) d where d < 1 or d > 7) then
    raise exception 'Jours invalides (1 = lundi … 7 = dimanche)';
  end if;
  if p_slot_out is null then raise exception 'Un créneau de départ est requis'; end if;
  if p_weeks < 1 or p_weeks > 8 then raise exception 'Durée : entre 1 et 8 semaines'; end if;

  -- Une seule recherche à la fois par client
  if exists (select 1 from public.subscriptions
             where client_id = auth.uid()
               and status in ('pending_driver', 'awaiting_payment')) then
    raise exception 'Vous avez déjà une demande TamPass en cours';
  end if;

  v_trips_per_day := case when p_slot_return is not null then 2 else 1 end;
  v_rides_total := cardinality(p_days) * v_trips_per_day * p_weeks;
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

  insert into public.subscriptions (
    client_id, plan_code, category, status,
    origin_location, origin_address, dropoff_location, dropoff_address,
    distance_km, duration_min,
    days_of_week, slot_out, slot_return,
    rides_total, rides_remaining,
    reports_month, reports_per_month, pauses_max,
    unit_price_fcfa, discount_pct, total_price_fcfa,
    starts_on, expires_on, searching_until
  ) values (
    auth.uid(), null, p_category, 'pending_driver',
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
    v_starts, v_starts + p_weeks * 7,
    now() + interval '3 hours'
  )
  returning * into v_sub;

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'search_started',
          jsonb_build_object('total_fcfa', v_total, 'rides_total', v_rides_total,
                             'searching_until', v_sub.searching_until));

  -- Notifie les 10 chauffeurs éligibles les plus proches de l'origine
  for v_drv in
    select d.profile_id
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.status = 'active'
      and d.is_online = true
      and d.current_location is not null
      and (v.category = p_category
           or (v.category = 'confort' and p_category = 'essentiel'))
      and st_dwithin(d.current_location, v_sub.origin_location, 10000)
    order by st_distance(d.current_location, v_sub.origin_location)
    limit 10
  loop
    perform public._push_notify(
      v_drv.profile_id,
      'Nouvelle offre TamPass',
      v_rides_total || ' trajets réguliers · ~' ||
        round(0.4 * v_unit * v_rides_total) || ' FCFA sur la période. Premier arrivé, premier servi.',
      '/tampass', 'tampass-offer', true
    );
    v_notified := v_notified + 1;
  end loop;

  return v_sub;
end;
$fn_req$;

grant execute on function public.request_subscription_flex to authenticated;

-- ------------------------------------------------------------
-- 3. Côté chauffeur : offres ouvertes + acceptation
-- ------------------------------------------------------------
create or replace function public.tampass_open_offers()
returns table (
  subscription_id uuid,
  origin_address text,
  dropoff_address text,
  category vehicle_category,
  days_count int,
  slot_out time,
  slot_return time,
  rides_total int,
  weeks int,
  driver_estimate_fcfa int,
  distance_from_driver_km numeric,
  searching_until timestamptz
)
language sql stable security definer set search_path = public as $fn_offers$
  select
    s.id,
    s.origin_address,
    s.dropoff_address,
    s.category,
    cardinality(s.days_of_week),
    s.slot_out,
    s.slot_return,
    s.rides_total,
    ((s.expires_on - s.starts_on) / 7)::int,
    round(0.4 * s.unit_price_fcfa * s.rides_total)::int,
    round((st_distance(d.current_location, s.origin_location) / 1000.0)::numeric, 1),
    s.searching_until
  from public.subscriptions s
  join public.drivers d on d.profile_id = auth.uid()
  join public.vehicles v on v.id = d.current_vehicle_id
  where s.status = 'pending_driver'
    and s.searching_until > now()
    and (v.category = s.category
         or (v.category = 'confort' and s.category = 'essentiel'))
    and (d.current_location is null
         or st_dwithin(d.current_location, s.origin_location, 15000))
  order by s.searching_until;
$fn_offers$;

grant execute on function public.tampass_open_offers to authenticated;

create or replace function public.tampass_accept_offer(p_subscription_id uuid)
returns public.subscriptions
language plpgsql security definer set search_path = public as $fn_accept$
declare
  v_drv record;
  v_sub public.subscriptions;
begin
  select d.id, d.rating_avg, d.current_vehicle_id, v.category as vehicle_category,
         split_part(coalesce(p.full_name, 'Chauffeur'), ' ', 1) as first_name
    into v_drv
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  left join public.vehicles v on v.id = d.current_vehicle_id
  where d.profile_id = auth.uid() and d.status = 'active';
  if v_drv.id is null then raise exception 'Compte chauffeur actif requis'; end if;

  -- Premier arrivé, premier servi (le guard sur status évite les doublons)
  update public.subscriptions
  set status = 'awaiting_payment',
      preferred_driver_id = v_drv.id,
      preferred_driver_name = v_drv.first_name,
      preferred_driver_rating = v_drv.rating_avg,
      payment_deadline = now() + interval '24 hours'
  where id = p_subscription_id
    and status = 'pending_driver'
    and searching_until > now()
    and (v_drv.vehicle_category = category
         or (v_drv.vehicle_category = 'confort' and category = 'essentiel'))
  returning * into v_sub;

  if v_sub.id is null then
    raise exception 'Offre expirée, déjà prise, ou catégorie incompatible';
  end if;

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'driver_accepted',
          jsonb_build_object('driver_id', v_drv.id, 'driver', v_drv.first_name));

  perform public._push_notify(
    v_sub.client_id,
    'Chauffeur trouvé pour votre TamPass !',
    v_drv.first_name || ' (' || coalesce(v_drv.rating_avg::text, 'nouveau') ||
      '★) sera votre chauffeur. Confirmez en payant sous 24 h.',
    '/tampass', 'tampass-driver-found', true
  );

  return v_sub;
end;
$fn_accept$;

grant execute on function public.tampass_accept_offer to authenticated;

-- ------------------------------------------------------------
-- 4. Confirmation client : paiement wallet → activation
-- ------------------------------------------------------------
create or replace function public.confirm_subscription_payment(p_subscription_id uuid)
returns public.subscriptions
language plpgsql security definer set search_path = public as $fn_confirm$
declare
  v_sub public.subscriptions;
  v_wallet public.wallets;
begin
  select * into v_sub from public.subscriptions
  where id = p_subscription_id and client_id = auth.uid()
  for update;
  if not found then raise exception 'Abonnement introuvable'; end if;
  if v_sub.status <> 'awaiting_payment' then
    raise exception 'Cet abonnement n''attend pas de paiement';
  end if;
  if v_sub.payment_deadline < now() then
    raise exception 'Délai de confirmation dépassé — relancez une recherche';
  end if;

  select * into v_wallet from public.wallets
  where profile_id = auth.uid() and kind = 'tamcar_credit'
  for update;
  if not found or v_wallet.balance_fcfa < v_sub.total_price_fcfa then
    raise exception 'Solde TamCar Crédit insuffisant (requis : % FCFA). Rechargez votre wallet.',
      v_sub.total_price_fcfa;
  end if;

  update public.wallets
  set balance_fcfa = balance_fcfa - v_sub.total_price_fcfa, updated_at = now()
  where id = v_wallet.id;

  insert into public.wallet_transactions
    (wallet_id, type, amount_fcfa, provider, status, meta)
  values
    (v_wallet.id, 'payment', -v_sub.total_price_fcfa, 'internal', 'success',
     jsonb_build_object('subscription_id', v_sub.id, 'kind', 'tampass'));

  update public.subscriptions
  set status = 'active',
      starts_on = greatest(starts_on, current_date + 1),
      expires_on = greatest(starts_on, current_date + 1)
                   + (expires_on - starts_on)
  where id = v_sub.id
  returning * into v_sub;

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'purchased',
          jsonb_build_object('total_fcfa', v_sub.total_price_fcfa));

  perform public._push_notify(
    (select d.profile_id from public.drivers d where d.id = v_sub.preferred_driver_id),
    'Abonné TamPass confirmé !',
    'Votre abonné a payé — les trajets démarrent dès demain. Retrouvez votre planning dans TamPass.',
    '/tampass', 'tampass-confirmed', true
  );

  return v_sub;
end;
$fn_confirm$;

grant execute on function public.confirm_subscription_payment to authenticated;

-- ------------------------------------------------------------
-- 5. Annulation d'une demande (avant paiement)
-- ------------------------------------------------------------
create or replace function public.cancel_subscription_request(p_subscription_id uuid)
returns public.subscriptions
language plpgsql security definer set search_path = public as $fn_cancel$
declare
  v_sub public.subscriptions;
begin
  update public.subscriptions
  set status = 'cancelled'
  where id = p_subscription_id
    and client_id = auth.uid()
    and status in ('pending_driver', 'awaiting_payment')
  returning * into v_sub;

  if v_sub.id is null then raise exception 'Demande introuvable'; end if;

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'cancelled', '{}'::jsonb);

  if v_sub.preferred_driver_id is not null then
    perform public._push_notify(
      (select d.profile_id from public.drivers d where d.id = v_sub.preferred_driver_id),
      'Offre TamPass annulée',
      'Le client a annulé sa demande avant paiement.',
      '/tampass', 'tampass-cancelled', false
    );
  end if;

  return v_sub;
end;
$fn_cancel$;

grant execute on function public.cancel_subscription_request to authenticated;

-- ------------------------------------------------------------
-- 6. Monitor v3 : expirations (recherche 3 h / paiement 24 h) +
--    ouverture anticipée 3 h réservée aux abonnements SANS attitré
-- ------------------------------------------------------------
create or replace function public.tampass_monitor()
returns jsonb
language plpgsql security definer set search_path = public as $fn_tm$
declare
  v_exp record;
  v_sr record;
  v_slot_ts timestamptz;
  v_drv record;
  v_expired int := 0;
  v_released int := 0;
  v_assigned int := 0;
  v_locked int := 0;
  v_recredited int := 0;
  v_wallet_id uuid;
begin
  -- Recherche expirée (3 h sans chauffeur)
  for v_exp in
    select id, client_id from public.subscriptions
    where status = 'pending_driver' and searching_until < now()
  loop
    update public.subscriptions set status = 'cancelled'
    where id = v_exp.id and status = 'pending_driver';
    if found then
      insert into public.subscription_events (subscription_id, event_type, payload)
      values (v_exp.id, 'search_expired', '{}'::jsonb);
      perform public._push_notify(
        v_exp.client_id,
        'Aucun chauffeur trouvé',
        'La recherche pour votre TamPass n''a pas abouti. Réessayez à un autre créneau ou une autre catégorie.',
        '/tampass', 'tampass-expired', true
      );
      v_expired := v_expired + 1;
    end if;
  end loop;

  -- Paiement non confirmé sous 24 h
  for v_exp in
    select s.id, s.client_id, d.profile_id as driver_profile
    from public.subscriptions s
    left join public.drivers d on d.id = s.preferred_driver_id
    where s.status = 'awaiting_payment' and s.payment_deadline < now()
  loop
    update public.subscriptions set status = 'cancelled'
    where id = v_exp.id and status = 'awaiting_payment';
    if found then
      insert into public.subscription_events (subscription_id, event_type, payload)
      values (v_exp.id, 'payment_expired', '{}'::jsonb);
      perform public._push_notify(
        v_exp.client_id, 'Demande TamPass expirée',
        'Le délai de confirmation est dépassé. Relancez une recherche quand vous voulez.',
        '/tampass', 'tampass-expired', false
      );
      if v_exp.driver_profile is not null then
        perform public._push_notify(
          v_exp.driver_profile, 'Offre TamPass expirée',
          'Le client n''a pas confirmé à temps — vous êtes libéré de cette offre.',
          '/tampass', 'tampass-expired', false
        );
      end if;
      v_expired := v_expired + 1;
    end if;
  end loop;

  -- Ouverture anticipée 3 h : uniquement si l'abonnement n'a pas d'attitré
  update public.rides r
  set status = 'requested', requested_at = now(), updated_at = now()
  from public.subscription_rides sr
  join public.subscriptions s on s.id = sr.subscription_id
  where sr.ride_id = r.id
    and sr.status = 'generated'
    and r.status = 'scheduled'
    and s.preferred_driver_id is null
    and r.scheduled_at <= now() + interval '3 hours';
  get diagnostics v_released = row_count;

  -- Boucle par trajet du jour (priorité titulaire H-16→H-5, garantie ponctualité)
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

    if v_sr.ride_driver_id is not null and v_sr.final_driver_id is null then
      update public.subscription_rides
      set final_driver_id = v_sr.ride_driver_id,
          locked_at = case when now() >= v_slot_ts - interval '5 minutes'
                           then now() else locked_at end
      where id = v_sr.sr_id;
      v_locked := v_locked + 1;
      continue;
    end if;

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

    if v_sr.locked_at is null
       and now() >= v_slot_ts - interval '5 minutes' then
      update public.subscription_rides
      set locked_at = now(), final_driver_id = coalesce(final_driver_id, v_sr.ride_driver_id)
      where id = v_sr.sr_id;
    end if;
  end loop;

  return jsonb_build_object('expired', v_expired, 'released', v_released,
                            'assigned', v_assigned, 'locked', v_locked,
                            'recredited', v_recredited);
end;
$fn_tm$;
