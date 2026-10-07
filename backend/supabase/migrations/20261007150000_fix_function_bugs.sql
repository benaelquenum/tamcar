-- ============================================================
-- Correction de défauts de fonctions trouvés par analyse statique (plpgsql_check) et test de contrat (2026-10-07)
--
--  1. driver_bookings (réservations du chauffeur) et my_pending_oneshot (demande directe en attente du client)
--     échouaient à chaque appel : « column reference ... is ambiguous » (colonnes de sortie homonymes de colonnes de
--     tables). Correction : #variable_conflict use_column.
--  2. tampass_nightly (tâche planifiée de 19 h) échouait chaque soir : « function generate_subscription_rides(date) is
--     not unique » (surcharge à 1 argument et surcharge à 2 arguments avec valeur par défaut). L'ancienne surcharge à
--     1 argument est supprimée : l'appel à 1 argument se résout sur la version à 2 arguments (minuit par défaut).
--  3. tampass_monitor (tâche de chaque minute) : la garde de ponctualité TamPass écrivait le statut de course
--     'cancelled', valeur inexistante de l'énumération ride_status : la tâche aurait échoué à chaque minute dès qu'une
--     course d'abonnement restait sans chauffeur 20 min après son créneau. Statut corrigé : cancelled_by_admin.
-- ============================================================

drop function if exists public.generate_subscription_rides(date);

CREATE OR REPLACE FUNCTION public.driver_bookings(p_scope text DEFAULT 'all'::text)
 RETURNS TABLE(id uuid, status ride_status, scheduled_at timestamp with time zone, pickup_address text, dropoff_address text, price_total_fcfa integer, driver_share_fcfa integer, requested_category vehicle_category, client_first_name text, client_phone text, is_upcoming boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_drv_id uuid;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_drv_id from public.drivers where profile_id = auth.uid() limit 1;
  if v_drv_id is null then return; end if;

  return query
  select
    r.id, r.status, r.scheduled_at, r.pickup_address, r.dropoff_address,
    r.price_total_fcfa, r.driver_share_fcfa, r.requested_category,
    split_part(
      coalesce(nullif(trim(r.passenger_name), ''), cp.full_name, 'Client'), ' ', 1
    ),
    case when public._booking_is_live(r.status)
         then coalesce(nullif(trim(r.passenger_phone), ''), cp.phone) end,
    public._booking_is_live(r.status)
  from public.rides r
  left join public.profiles cp on cp.id = r.client_id
  where r.driver_id = v_drv_id
    and r.scheduled_at is not null
    and (
      p_scope = 'all'
      or (p_scope = 'upcoming' and public._booking_is_live(r.status))
      or (p_scope = 'past' and not public._booking_is_live(r.status))
    )
  order by
    public._booking_is_live(r.status) desc,
    case when public._booking_is_live(r.status) then r.scheduled_at end asc,
    r.scheduled_at desc
  limit 100;
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_pending_oneshot()
 RETURNS TABLE(request_id uuid, driver_name text, pickup_address text, dropoff_address text, price_total_fcfa integer, status text, expires_at timestamp with time zone, ride_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  update public.driver_requests
  set status = 'expired'
  where client_id = auth.uid()
    and status = 'pending' and expires_at <= now();

  return query
  select dr.id, pr.full_name, dr.pickup_address, dr.dropoff_address,
         dr.price_total_fcfa, dr.status, dr.expires_at, dr.ride_id
  from public.driver_requests dr
  join public.drivers d on d.id = dr.driver_id
  join public.profiles pr on pr.id = d.profile_id
  where dr.client_id = auth.uid()
    and (dr.status = 'pending'
         or dr.responded_at > now() - interval '3 minutes')
  order by dr.created_at desc
  limit 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tampass_monitor()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
