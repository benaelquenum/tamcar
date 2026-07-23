-- ============================================================
-- TamPass — scheduler (génération J-1 + boucle H-15/H-5 + garantie ponctualité)
--
-- Architecture 100 % SQL + pg_cron (aucune Edge Function nécessaire) :
--   - tampass_nightly()  : cron 19h UTC (20h Bénin) — génère les trajets
--     du lendemain et crée les rides réelles (status 'scheduled', la
--     machinerie existante _release_due_scheduled_rides + push s'applique).
--   - tampass_monitor()  : cron chaque minute — règle de réassignation
--     validée par Terence :
--       * H-16 : si le chauffeur attitré est en ligne et proche (≤ 5 km),
--         assignation directe (il a accepté le trajet récurrent en amont) ;
--         sinon fallback_started_at, la course part au matching général
--         (flip H-15 existant) MAIS le titulaire est re-vérifié chaque
--         minute jusqu'à H-5 : s'il redevient viable et que personne n'a
--         accepté, il reprend son trajet.
--       * H-5 : verrouillage (locked_at, final_driver_id).
--       * Slot + 20 min sans chauffeur : garantie ponctualité — course
--         annulée, trajet recrédité, geste 500 F wallet, push client.
--
-- NOTE INTÉGRATION PAIEMENT : les rides TamPass sont créées avec
-- payment_method NULL (le pass est déjà payé à l'achat). Ne PAS mettre
-- 'tamcar_credit' ici : le flux de fin de course débiterait le client
-- une seconde fois. L'UI affiche « Payé par TamPass » via la jointure
-- subscription_rides.ride_id.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Création des rides réelles pour les trajets planifiés d'une date
-- ------------------------------------------------------------
create or replace function public.tampass_create_rides(p_for_date date)
returns int
language plpgsql security definer set search_path = public as $fn_tcr$
declare
  v_sr record;
  v_quote record;
  v_ride public.rides;
  v_when timestamptz;
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
    -- Aller = origine → destination ; retour = destination → origine
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

    insert into public.rides (
      client_id,
      pickup_location, pickup_address,
      dropoff_location, dropoff_address,
      distance_km, duration_min,
      price_total_fcfa,
      driver_share_fcfa, driver_rachat_fcfa, dealer_share_fcfa, platform_share_fcfa,
      status, payment_method, scheduled_at, requested_at,
      requested_category, with_ac
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
      v_sr.category, false
    ) returning * into v_ride;

    update public.subscription_rides
    set ride_id = v_ride.id, status = 'generated'
    where id = v_sr.sr_id;

    v_count := v_count + 1;

    -- Push au chauffeur attitré : planning du lendemain
    if v_sr.preferred_driver_id is not null then
      perform public._push_notify(
        (select d.profile_id from public.drivers d where d.id = v_sr.preferred_driver_id),
        'Trajet TamPass demain',
        to_char(v_when at time zone 'Africa/Porto-Novo', 'HH24hMI') || ' — ' ||
          case when v_sr.direction = 'aller' then v_sr.origin_address else v_sr.dropoff_address end,
        '/dashboard', 'tampass-planning', false
      );
    end if;
  end loop;

  return v_count;
end;
$fn_tcr$;

-- ------------------------------------------------------------
-- 2. Job nocturne : génération + création des rides du lendemain
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
begin
  -- Balayage des trajets passés : statuts définitifs
  update public.subscription_rides sr
  set status = 'completed'
  from public.rides r
  where r.id = sr.ride_id
    and sr.status = 'generated'
    and r.status = 'completed';
  get diagnostics v_completed = row_count;

  -- Course annulée ou restée sans suite (hors garantie ponctualité,
  -- déjà 'recredited') → trajet manqué, décompté ; le client peut
  -- utiliser un joker via report_subscription_ride.
  update public.subscription_rides sr
  set status = 'missed'
  from public.rides r
  where r.id = sr.ride_id
    and sr.status = 'generated'
    and sr.travel_date < (now() at time zone 'Africa/Porto-Novo')::date
    and r.status not in ('completed', 'matched', 'arrived', 'in_progress');
  get diagnostics v_missed = row_count;

  v_generated := public.generate_subscription_rides(v_date);
  v_created := public.tampass_create_rides(v_date);
  return jsonb_build_object(
    'date', v_date, 'generated', v_generated, 'rides_created', v_created,
    'swept_completed', v_completed, 'swept_missed', v_missed
  );
end;
$fn_tn$;

-- ------------------------------------------------------------
-- 3. Boucle minute : priorité titulaire H-16→H-5, verrouillage H-5,
--    garantie ponctualité slot+20
-- ------------------------------------------------------------
create or replace function public.tampass_monitor()
returns jsonb
language plpgsql security definer set search_path = public as $fn_tm$
declare
  v_sr record;
  v_slot_ts timestamptz;
  v_drv record;
  v_assigned int := 0;
  v_locked int := 0;
  v_recredited int := 0;
  v_wallet_id uuid;
begin
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

    -- Hors fenêtre utile → suivant
    continue when now() < v_slot_ts - interval '16 minutes';

    -- ── Sync : un chauffeur a été assigné (titulaire ou remplaçant) ──
    if v_sr.ride_driver_id is not null and v_sr.final_driver_id is null then
      update public.subscription_rides
      set final_driver_id = v_sr.ride_driver_id,
          locked_at = case when now() >= v_slot_ts - interval '5 minutes'
                           then now() else locked_at end
      where id = v_sr.sr_id;
      v_locked := v_locked + 1;
      continue;
    end if;

    -- ── Garantie ponctualité : slot + 20 min sans chauffeur ──
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

        -- Geste commercial 500 F sur le wallet TamCar Crédit
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

    -- ── Priorité titulaire : H-16 → H-5, re-vérifiée chaque minute ──
    -- (tant que personne n'a accepté ; le flip générique H-15 ouvre en
    --  parallèle au matching général = la « recherche de remplaçant »)
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
        -- Titulaire non viable pour l'instant : on trace le début de la
        -- recherche parallèle (le flip générique H-15 fait le matching).
        update public.subscription_rides
        set fallback_started_at = now() where id = v_sr.sr_id;
      end if;
    end if;

    -- ── H-5 : verrouillage même sans chauffeur (fin de la fenêtre titulaire) ──
    if v_sr.locked_at is null
       and now() >= v_slot_ts - interval '5 minutes' then
      update public.subscription_rides
      set locked_at = now(), final_driver_id = coalesce(final_driver_id, v_sr.ride_driver_id)
      where id = v_sr.sr_id;
    end if;
  end loop;

  return jsonb_build_object('assigned', v_assigned, 'locked', v_locked, 'recredited', v_recredited);
end;
$fn_tm$;

-- ------------------------------------------------------------
-- 4. Droits + planification pg_cron
-- ------------------------------------------------------------
revoke execute on function public.tampass_create_rides from public, authenticated, anon;
revoke execute on function public.tampass_nightly from public, authenticated, anon;
revoke execute on function public.tampass_monitor from public, authenticated, anon;
grant execute on function public.tampass_create_rides to service_role;
grant execute on function public.tampass_nightly to service_role;
grant execute on function public.tampass_monitor to service_role;

-- pg_cron (heures en UTC — Bénin = UTC+1 : 19h UTC = 20h locale)
create extension if not exists pg_cron;

select cron.unschedule('tampass-nightly')
where exists (select 1 from cron.job where jobname = 'tampass-nightly');
select cron.schedule('tampass-nightly', '0 19 * * *', $$select public.tampass_nightly()$$);

select cron.unschedule('tampass-monitor')
where exists (select 1 from cron.job where jobname = 'tampass-monitor');
select cron.schedule('tampass-monitor', '* * * * *', $$select public.tampass_monitor()$$);
