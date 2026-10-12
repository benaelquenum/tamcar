-- ============================================================
-- TamCar — TamPass : chauffeur titulaire engagé sur TOUTES les courses de l'abonnement + pilotage admin (2026-10-12)
--
--   Règle de Terence (2026-10-12) : quand la commande TamPass est lancée, le chauffeur qui a accepté l'offre accepte POUR TOUTES les
--   courses de l'abonnement. Ce n'est que lorsqu'il se désiste d'UNE course qu'un nouveau chauffeur est recherché, pour cette course
--   seulement : il reste titulaire des autres.
--
--   Avant : le titulaire n'était affecté qu'à H-16 s'il était en ligne à moins de 5 km, sinon la course partait au matching général.
--   Maintenant : chaque course est créée DÉJÀ affectée au titulaire (statut `scheduled` + driver_id, comme une réservation acceptée) ;
--   les rappels H-30/20/10/5, le départ anticipé H-30 et le désistement (cancel_scheduled_by_driver / cancel_ride_by_driver, qui relancent
--   la recherche et excluent le chauffeur désisté pour CETTE course) sont ceux des réservations. Le moniteur n'affecte plus personne :
--   il synchronise le chauffeur final, verrouille à H-5 et applique la garantie de ponctualité (slot + 20 min sans chauffeur).
--
--   Objectif journalier : rien à changer, les courses TamPass sont des courses terminées comme les autres — driver_today_volume,
--   _floor_day_totals (versement du jour), award_performance_bonus et les classements les comptent au jour de leur fin (ended_at, heure de
--   Porto-Novo). Vérifié par backend/tests/tampass_flow.sql.
--
--   Pilotage admin : admin_tampass_list() (tous les abonnements) et admin_cancel_subscription() (arrêt d'un abonnement, annulation des
--   courses non commencées, remboursement facultatif des trajets non effectués).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Création des courses : déjà affectées au titulaire (s'il est actif)
-- ------------------------------------------------------------
create or replace function public.tampass_create_rides(p_for_date date)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_sr record;
  v_quote record;
  v_ride public.rides;
  v_when timestamptz;
  v_tit uuid;
  v_count int := 0;
begin
  for v_sr in
    select sr.id as sr_id, sr.slot_time, sr.direction,
           s.id as sub_id, s.client_id, s.category, s.distance_km, s.duration_min,
           s.preferred_driver_id,
           s.origin_location, s.origin_address,
           s.dropoff_location, s.dropoff_address
    from public.subscription_rides sr
    join public.subscriptions s on s.id = sr.subscription_id
    where sr.travel_date = p_for_date
      and sr.status = 'planned'
      and sr.ride_id is null
  loop
    v_when := (p_for_date::timestamp + v_sr.slot_time) at time zone 'Africa/Porto-Novo';

    select * into v_quote from public.compute_price(
      st_y(case when v_sr.direction = 'aller' then v_sr.origin_location::geometry else v_sr.dropoff_location::geometry end),
      st_x(case when v_sr.direction = 'aller' then v_sr.origin_location::geometry else v_sr.dropoff_location::geometry end),
      st_y(case when v_sr.direction = 'aller' then v_sr.dropoff_location::geometry else v_sr.origin_location::geometry end),
      st_x(case when v_sr.direction = 'aller' then v_sr.dropoff_location::geometry else v_sr.origin_location::geometry end),
      v_sr.distance_km, v_sr.duration_min, v_sr.category, false, false
    ) limit 1;
    if v_quote is null or v_quote.price_total_fcfa is null then
      continue;  -- trajet ignoré, restera 'planned' (visible en admin)
    end if;

    -- Le titulaire est engagé d'avance : la course naît affectée à lui, comme une réservation acceptée. S'il n'est plus actif
    -- (suspendu, désactivé), la course naît sans chauffeur et part en recherche générale.
    v_tit := null;
    if v_sr.preferred_driver_id is not null then
      select d.id into v_tit from public.drivers d where d.id = v_sr.preferred_driver_id and d.status = 'active';
    end if;

    insert into public.rides (
      client_id,
      pickup_location, pickup_address,
      dropoff_location, dropoff_address,
      distance_km, duration_min,
      price_total_fcfa,
      driver_share_fcfa, driver_rachat_fcfa, dealer_share_fcfa, platform_share_fcfa,
      status, payment_method, scheduled_at, requested_at,
      requested_category, with_ac, driver_id
    ) values (
      v_sr.client_id,
      case when v_sr.direction = 'aller' then v_sr.origin_location else v_sr.dropoff_location end,
      case when v_sr.direction = 'aller' then v_sr.origin_address else v_sr.dropoff_address end,
      case when v_sr.direction = 'aller' then v_sr.dropoff_location else v_sr.origin_location end,
      case when v_sr.direction = 'aller' then v_sr.dropoff_address else v_sr.origin_address end,
      v_sr.distance_km, v_sr.duration_min,
      v_quote.price_total_fcfa,
      v_quote.driver_cash_fcfa, v_quote.driver_rachat_fcfa,
      v_quote.dealer_share_fcfa, v_quote.platform_share_fcfa,
      'scheduled', null, v_when, now(),
      v_sr.category, false, v_tit
    ) returning * into v_ride;

    update public.subscription_rides
    set ride_id = v_ride.id, status = 'generated', final_driver_id = v_tit
    where id = v_sr.sr_id;

    v_count := v_count + 1;

    -- Planning du lendemain pour le titulaire
    if v_tit is not null then
      perform public._push_notify(
        (select d.profile_id from public.drivers d where d.id = v_tit),
        'Trajet TamPass demain',
        to_char(v_when at time zone 'Africa/Porto-Novo', 'HH24hMI') || ' — ' ||
          case when v_sr.direction = 'aller' then v_sr.origin_address else v_sr.dropoff_address end,
        '/dashboard', 'tampass-planning', false
      );
    end if;
  end loop;

  return v_count;
end;
$fn$;

-- ------------------------------------------------------------
-- 2. Moniteur : plus d'affectation conditionnelle (le titulaire est affecté d'avance) ; il synchronise le chauffeur
--    final (y compris après un désistement et un remplacement), verrouille à H-5 et applique la garantie de ponctualité.
-- ------------------------------------------------------------
create or replace function public.tampass_monitor()
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_exp record;
  v_sr record;
  v_slot_ts timestamptz;
  v_expired int := 0;
  v_released int := 0;
  v_locked int := 0;
  v_recredited int := 0;
  v_wallet_id uuid;
begin
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

  -- Abonnement SANS titulaire : la course part au matching général 3 h avant. (Avec titulaire, la course reste affectée jusqu'à
  -- H-10 ; si le titulaire s'est désisté, elle est en recherche et suit le parcours des réservations.)
  update public.rides r
  set status = 'requested', requested_at = now(), updated_at = now()
  from public.subscription_rides sr
  join public.subscriptions s on s.id = sr.subscription_id
  where sr.ride_id = r.id
    and sr.status = 'generated'
    and r.status = 'scheduled'
    and r.driver_id is null
    and s.preferred_driver_id is null
    and r.scheduled_at <= now() + interval '3 hours';
  get diagnostics v_released = row_count;

  for v_sr in
    select sr.id as sr_id, sr.ride_id, sr.travel_date, sr.slot_time,
           sr.locked_at, sr.final_driver_id,
           s.id as sub_id, s.client_id,
           r.status as ride_status, r.driver_id as ride_driver_id
    from public.subscription_rides sr
    join public.subscriptions s on s.id = sr.subscription_id
    join public.rides r on r.id = sr.ride_id
    where sr.status = 'generated'
      and sr.travel_date = (now() at time zone 'Africa/Porto-Novo')::date
      and r.status in ('scheduled', 'requested', 'matched')
  loop
    v_slot_ts := (v_sr.travel_date::timestamp + v_sr.slot_time) at time zone 'Africa/Porto-Novo';
    continue when now() < v_slot_ts - interval '16 minutes';

    -- Chauffeur final = chauffeur actuel de la course (titulaire, ou remplaçant après un désistement)
    if v_sr.ride_driver_id is not null and v_sr.final_driver_id is distinct from v_sr.ride_driver_id then
      update public.subscription_rides
      set final_driver_id = v_sr.ride_driver_id,
          locked_at = case when now() >= v_slot_ts - interval '5 minutes'
                           then coalesce(locked_at, now()) else locked_at end
      where id = v_sr.sr_id;
      v_locked := v_locked + 1;
      continue;
    end if;

    -- Garantie de ponctualité : aucun chauffeur 20 min après l'heure du créneau → course annulée, trajet recrédité + geste de 500 F
    if v_sr.ride_driver_id is null
       and now() > v_slot_ts + interval '20 minutes' then
      update public.rides
      set status = 'cancelled_by_admin', cancelled_at = now(),
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

    if v_sr.locked_at is null
       and now() >= v_slot_ts - interval '5 minutes' then
      update public.subscription_rides
      set locked_at = now(), final_driver_id = coalesce(final_driver_id, v_sr.ride_driver_id)
      where id = v_sr.sr_id;
    end if;
  end loop;

  return jsonb_build_object('expired', v_expired, 'released', v_released,
                            'locked', v_locked, 'recredited', v_recredited);
end;
$fn$;

-- ------------------------------------------------------------
-- 3. Admin : liste de tous les abonnements TamPass
-- ------------------------------------------------------------
drop function if exists public.admin_tampass_list();
create function public.admin_tampass_list()
returns table (
  subscription_id uuid, status text, category text,
  client_id uuid, client_name text, client_email text, client_role text,
  origin_address text, dropoff_address text, days_of_week int[], slot_out time, slot_return time,
  rides_total int, rides_remaining int, rides_done int, rides_missed int,
  starts_on date, expires_on date, total_price_fcfa int, unit_price_fcfa int,
  driver_id uuid, driver_name text,
  next_ride_at timestamptz, next_ride_status text, next_ride_has_driver boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $fn$
  select s.id, s.status::text, s.category::text,
         s.client_id, p.full_name, u.email::text, p.role::text,
         s.origin_address, s.dropoff_address, s.days_of_week, s.slot_out, s.slot_return,
         s.rides_total, s.rides_remaining,
         (select count(*)::int from public.subscription_rides sr where sr.subscription_id = s.id and sr.status = 'completed'),
         (select count(*)::int from public.subscription_rides sr where sr.subscription_id = s.id and sr.status in ('missed', 'recredited')),
         s.starts_on, s.expires_on, s.total_price_fcfa, s.unit_price_fcfa,
         s.preferred_driver_id, coalesce(dp.full_name, s.preferred_driver_name),
         nx.scheduled_at, nx.status, nx.has_driver,
         s.created_at
    from public.subscriptions s
    left join public.profiles p on p.id = s.client_id
    left join auth.users u on u.id = s.client_id
    left join public.drivers d on d.id = s.preferred_driver_id
    left join public.profiles dp on dp.id = d.profile_id
    left join lateral (
      select r.scheduled_at, r.status::text as status, (r.driver_id is not null) as has_driver
        from public.subscription_rides sr
        join public.rides r on r.id = sr.ride_id
       where sr.subscription_id = s.id and sr.status = 'generated'
         and r.status in ('scheduled', 'requested', 'matched', 'arrived', 'in_progress')
       order by r.scheduled_at
       limit 1
    ) nx on true
   where public.is_admin()
   order by (s.status in ('pending_driver', 'awaiting_payment', 'active', 'paused')) desc, s.created_at desc;
$fn$;
revoke execute on function public.admin_tampass_list() from public, anon;
grant execute on function public.admin_tampass_list() to authenticated;

-- ------------------------------------------------------------
-- 4. Admin : arrêt d'un abonnement
--    - abonnement → cancelled ; trajets planifiés → cancelled ;
--    - courses générées et NON commencées (scheduled / requested / matched) → cancelled_by_admin, chauffeur prévenu ;
--    - p_refund : rembourse sur le TamCar Crédit du client les trajets non effectués (restants + courses annulées ici) × prix unitaire.
-- ------------------------------------------------------------
drop function if exists public.admin_cancel_subscription(uuid, text, boolean);
create function public.admin_cancel_subscription(p_subscription_id uuid, p_reason text default null, p_refund boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_sub public.subscriptions;
  r record;
  v_cancelled int := 0;
  v_planned int := 0;
  v_refund int := 0;
  v_wallet uuid;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'arrêt par l''administration');
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if v_sub.id is null then raise exception 'Abonnement introuvable'; end if;
  if v_sub.status in ('cancelled', 'expired') then
    raise exception 'Cet abonnement est déjà terminé (%).', v_sub.status;
  end if;

  update public.subscriptions set status = 'cancelled', updated_at = now() where id = v_sub.id;

  for r in
    select sr.id as sr_id, sr.ride_id, d.profile_id as driver_profile, rd.scheduled_at
      from public.subscription_rides sr
      join public.rides rd on rd.id = sr.ride_id
      left join public.drivers d on d.id = rd.driver_id
     where sr.subscription_id = v_sub.id and sr.status = 'generated'
       and rd.status in ('scheduled', 'requested', 'matched')
     for update of sr, rd
  loop
    update public.rides
       set status = 'cancelled_by_admin', cancelled_at = now(), ended_at = coalesce(ended_at, now()),
           cancel_reason = 'tampass_cancelled_by_admin', updated_at = now()
     where id = r.ride_id;
    update public.subscription_rides set status = 'cancelled' where id = r.sr_id;
    v_cancelled := v_cancelled + 1;
    if r.driver_profile is not null then
      perform public._push_notify(
        r.driver_profile, 'Trajet TamPass annulé',
        'Le trajet TamPass du ' || to_char(r.scheduled_at at time zone 'Africa/Porto-Novo', 'DD/MM à HH24"h"MI') || ' est annulé : l''abonnement a été arrêté. Aucune pénalité pour vous.',
        '/dashboard', 'tampass-cancelled:' || r.ride_id::text, false
      );
    end if;
  end loop;

  update public.subscription_rides set status = 'cancelled'
   where subscription_id = v_sub.id and status = 'planned';
  get diagnostics v_planned = row_count;

  if p_refund then
    v_refund := (v_sub.rides_remaining + v_cancelled) * v_sub.unit_price_fcfa;
    if v_refund > 0 then
      select id into v_wallet from public.wallets where profile_id = v_sub.client_id and kind = 'tamcar_credit';
      if v_wallet is not null then
        update public.wallets set balance_fcfa = balance_fcfa + v_refund, updated_at = now() where id = v_wallet;
        insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
        values (v_wallet, 'refund', v_refund, 'internal', 'success',
                jsonb_build_object('kind', 'tampass_admin_cancel', 'subscription_id', v_sub.id));
      else
        v_refund := 0;
      end if;
    end if;
  end if;

  update public.subscriptions set rides_remaining = 0, updated_at = now() where id = v_sub.id;

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'admin_cancelled',
          jsonb_build_object('reason', v_reason, 'rides_cancelled', v_cancelled, 'planned_cancelled', v_planned, 'refund_fcfa', v_refund));

  perform public._push_notify(
    v_sub.client_id, 'Votre TamPass a été arrêté',
    case when v_refund > 0 then 'Votre abonnement a été arrêté par TamCar. ' || v_refund || ' F ont été recrédités sur votre TamCar Crédit.'
         else 'Votre abonnement a été arrêté par TamCar.' end,
    '/tampass', 'tampass-cancelled:' || v_sub.id::text, false
  );

  return jsonb_build_object('subscription_id', v_sub.id, 'rides_cancelled', v_cancelled,
                            'planned_cancelled', v_planned, 'refund_fcfa', v_refund);
end;
$fn$;
revoke execute on function public.admin_cancel_subscription(uuid, text, boolean) from public, anon;
grant execute on function public.admin_cancel_subscription(uuid, text, boolean) to authenticated;
