-- ============================================================
-- TamCar — Réservation, logique complète. Décision Terence 2026-08-07.
--
--   1. Plancher à 30 minutes. En deçà, c'est une course instantanée.
--      (Le serveur tolère 28 min : l'écran affiche 30, il faut absorber
--      le temps de saisie et l'aller-retour réseau.)
--   2. La recherche de chauffeur démarre À LA CRÉATION, dans un rayon de
--      12 km, quelle que soit la distance au départ. L'ancienne règle
--      « on n'alerte qu'à moins de 2 h » est supprimée : elle expliquait
--      qu'un chauffeur en ligne et dans la zone ne reçoive rien.
--   3. Sans repreneur au bout d'UNE MINUTE, la main revient au client :
--      continuer, alternative (chauffeurs autour + nouveau coût), annuler.
--   4. Rappels aux DEUX parties à H-30, H-20, H-10 et H-5. Gratuit
--      jusqu'à H-10, 200 FCFA ensuite — et la pénalité est réellement
--      prélevée, dans les deux sens.
--   5. La bascule H-10 passe sur le cron. Elle dépendait du sondage des
--      chauffeurs : sans personne en ligne, une réservation restait en
--      'scheduled' indéfiniment, disparaissait de l'écran du client
--      (my_scheduled_rides filtre sur scheduled_at > now()) et ne
--      partait jamais. Des réservations orphelines existent déjà en base.
--
--   PÉNALITÉ — arbitrage : les 200 FCFA vont intégralement à la partie
--   lésée, la plateforme ne prend rien. Ce n'est pas une ligne de
--   revenu, c'est un moyen de dissuasion.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Plancher de réservation : 30 minutes
-- ------------------------------------------------------------
create or replace function public.create_ride(
  p_category vehicle_category,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_pickup_address text,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_dropoff_address text,
  p_distance_km numeric,
  p_duration_min int,
  p_is_night boolean default false,
  p_with_ac boolean default false,
  p_scheduled_at timestamptz default null,
  p_payment_method payment_method default 'cash',
  p_promo_code text default null,
  p_passenger_name text default null,
  p_passenger_phone text default null
)
returns public.rides
language plpgsql security invoker as $fnr$
declare
  quote record;
  new_ride public.rides;
  v_status ride_status;
  v_promo record;
  v_final_price int;
  v_promo_code_norm text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
  v_discount int := 0;
  v_passenger_name text := nullif(trim(coalesce(p_passenger_name, '')), '');
  v_passenger_phone text := nullif(regexp_replace(coalesce(p_passenger_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  if v_passenger_name is not null and v_passenger_phone is null then
    raise exception 'Le téléphone du passager est requis.';
  end if;
  if v_passenger_phone is not null and v_passenger_name is null then
    raise exception 'Le nom du passager est requis.';
  end if;

  if not public._is_within_service_zone(p_pickup_lat, p_pickup_lng) then
    raise exception 'Point de départ hors zone de service.';
  end if;
  if not public._is_within_service_zone(p_dropoff_lat, p_dropoff_lng) then
    raise exception 'Destination hors zone de service.';
  end if;

  if p_scheduled_at is not null then
    -- 28 min côté serveur pour 30 min affichées : marge de saisie.
    if p_scheduled_at < now() + interval '28 minutes' then
      raise exception 'Réservation à 30 min minimum. Pour partir plus tôt, commandez une course immédiate.';
    end if;
    if p_scheduled_at > now() + interval '30 days' then
      raise exception 'Réservation max 30 jours à l''avance';
    end if;
    v_status := 'scheduled';
  else
    v_status := 'requested';
  end if;

  select * into quote from public.compute_price(
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
    p_distance_km, p_duration_min, p_category, p_is_night, p_with_ac
  ) limit 1;
  if quote is null or quote.price_total_fcfa is null then
    raise exception 'compute_price returned null';
  end if;

  v_final_price := quote.price_total_fcfa;

  if v_promo_code_norm is not null then
    select * into v_promo from public.preview_promo_code(v_promo_code_norm, quote.price_total_fcfa);
    if not v_promo.valid then
      raise exception 'Code promo invalide : %', v_promo.reason;
    end if;
    v_final_price := v_promo.final_price_fcfa;
    v_discount := v_promo.discount_fcfa;
  end if;

  insert into public.rides (
    client_id,
    pickup_location, pickup_address,
    dropoff_location, dropoff_address,
    distance_km, duration_min,
    price_total_fcfa,
    driver_share_fcfa, driver_rachat_fcfa, dealer_share_fcfa, platform_share_fcfa,
    status, payment_method, scheduled_at, requested_at,
    requested_category, with_ac,
    promo_code, promo_discount_fcfa,
    passenger_name, passenger_phone
  ) values (
    auth.uid(),
    st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    p_pickup_address,
    st_setsrid(st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_dropoff_address,
    p_distance_km, p_duration_min,
    v_final_price,
    quote.driver_cash_fcfa, quote.driver_rachat_fcfa,
    quote.dealer_share_fcfa, quote.platform_share_fcfa,
    v_status, p_payment_method, p_scheduled_at, now(),
    p_category, p_with_ac,
    v_promo_code_norm, v_discount,
    v_passenger_name, v_passenger_phone
  ) returning * into new_ride;

  if v_promo_code_norm is not null and v_discount > 0 then
    insert into public.promo_code_redemptions (code, profile_id, ride_id, discount_applied_fcfa)
      values (v_promo_code_norm, auth.uid(), new_ride.id, v_discount);
  end if;

  return new_ride;
end;
$fnr$;

grant execute on function public.create_ride(
  vehicle_category, double precision, double precision, text,
  double precision, double precision, text, numeric, int,
  boolean, boolean, timestamptz, payment_method, text, text, text
) to authenticated;

-- ------------------------------------------------------------
-- 2. Alerte chauffeurs : plus de fenêtre de 2 h
--    Le compte à rebours d'une minute démarre au moment où les
--    chauffeurs sont RÉELLEMENT alertés, pas à la création.
-- ------------------------------------------------------------
create or replace function public._notify_scheduled_booking(
  p_ride_id uuid,
  p_force boolean default false
)
returns void
language plpgsql security definer set search_path = public as $fn_nsb$
declare
  r public.rides;
  drv record;
  v_label text;
  v_hhmm text;
  v_from text;
begin
  select * into r from public.rides where id = p_ride_id;
  if r is null then return; end if;
  if r.status <> 'scheduled' or r.driver_id is not null or r.scheduled_at is null then
    return;
  end if;
  if r.scheduled_at <= now() then return; end if;
  -- Sentinelle 120 : « les chauffeurs ont déjà été alertés pour cette
  -- recherche ». p_force la lève (désistement, relance, changement de
  -- catégorie ouvrent une nouvelle recherche).
  if not p_force and 120 = any (r.booking_reminders_sent) then return; end if;

  v_label := case r.requested_category
    when 'moto'      then 'Moto'
    when 'tricycle'  then 'Tricycle'
    when 'essentiel' then 'Essentiel'
    when 'confort'   then 'Confort'
    when 'premium'   then 'VIP'
    else initcap(r.requested_category::text)
  end;
  -- Le Bénin est à UTC+1 toute l'année (WAT, pas d'heure d'été).
  v_hhmm := to_char(r.scheduled_at at time zone 'Africa/Porto-Novo', 'HH24:MI');
  v_from := left(coalesce(r.pickup_address, 'un point proche'), 45);

  for drv in
    select d.profile_id
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.is_online = true
      and d.status = 'active'
      and (
        v.category = r.requested_category
        or (v.category = 'confort' and r.requested_category = 'essentiel')
      )
      and (d.current_location is null
           or st_dwithin(d.current_location, r.pickup_location, 12000))
  loop
    perform public._push_notify(
      drv.profile_id,
      'Réservation ' || v_label || ' à ' || v_hhmm,
      'Départ de ' || v_from || '. Engage-toi avant qu''un autre chauffeur ne la prenne.',
      '/',
      'booking-new:' || p_ride_id::text,
      true
    );
  end loop;

  update public.rides
    set booking_reminders_sent = case
          when 120 = any (booking_reminders_sent) then booking_reminders_sent
          else booking_reminders_sent || 120::smallint
        end,
        driver_search_started_at = now(),
        driver_search_prompted_at = null
    where id = p_ride_id;
end;
$fn_nsb$;

revoke all on function public._notify_scheduled_booking(uuid, boolean) from public, anon, authenticated;

comment on function public._notify_scheduled_booking is
  'Alerte les chauffeurs éligibles (12 km, catégorie compatible, en ligne et actifs) d''une réservation sans chauffeur, et démarre le compte à rebours d''une minute. p_force => true pour rouvrir une recherche (désistement, relance, changement de catégorie).';

-- ------------------------------------------------------------
-- 3. Pénalité de réservation : 200 FCFA, intégralement à la partie lésée
-- ------------------------------------------------------------
-- STABLE et non IMMUTABLE : la fonction lit now(). Déclarée immutable,
-- le planificateur serait en droit de la replier en constante.
create or replace function public._booking_is_late(p_ride public.rides)
returns boolean
language sql stable as $$
  select p_ride.scheduled_at is not null
     and now() >= p_ride.scheduled_at - interval '10 minutes';
$$;

revoke all on function public._booking_is_late(public.rides) from public, anon, authenticated;

create or replace function public._booking_penalty(
  p_ride_id uuid,
  p_from_profile uuid,
  p_from_kind wallet_kind,
  p_to_profile uuid,
  p_to_kind wallet_kind,
  p_amount int
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from_wallet uuid;
  v_to_wallet uuid;
begin
  if p_amount <= 0 or p_from_profile is null then return; end if;

  insert into public.wallets (profile_id, kind, balance_fcfa)
    values (p_from_profile, p_from_kind, 0)
    on conflict (profile_id, kind) do nothing;
  select id into v_from_wallet
    from public.wallets where profile_id = p_from_profile and kind = p_from_kind;
  update public.wallets
    set balance_fcfa = balance_fcfa - p_amount, updated_at = now()
    where id = v_from_wallet;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
    values (v_from_wallet, 'cancellation_fee', p_amount, p_ride_id, 'success');

  if p_to_profile is null then return; end if;

  insert into public.wallets (profile_id, kind, balance_fcfa)
    values (p_to_profile, p_to_kind, 0)
    on conflict (profile_id, kind) do nothing;
  select id into v_to_wallet
    from public.wallets where profile_id = p_to_profile and kind = p_to_kind;
  update public.wallets
    set balance_fcfa = balance_fcfa + p_amount, updated_at = now()
    where id = v_to_wallet;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
    values (v_to_wallet, 'cancellation_reimbursement', p_amount, p_ride_id, 'success');
end;
$$;

revoke all on function public._booking_penalty(uuid, uuid, wallet_kind, uuid, wallet_kind, int)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Annulation client d'une réservation : gratuite avant H-10
-- ------------------------------------------------------------
create or replace function public.cancel_scheduled_ride(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn_cancel_sched$
declare
  r public.rides;
  v_driver_profile uuid;
  v_late boolean;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status <> 'scheduled' then
    raise exception 'Course déjà libérée aux chauffeurs — utilise l''annulation standard';
  end if;

  v_late := public._booking_is_late(r);

  update public.rides
    set status = 'cancelled_by_client',
        cancel_reason = case when v_late then 'booking_late' else 'free_scheduled' end,
        ended_at = now(),
        updated_at = now()
    where id = p_ride_id;

  -- Moins de 10 min avant le départ : 200 FCFA au chauffeur engagé, qui
  -- avait bloqué son créneau. Sans chauffeur engagé, rien n'est prélevé.
  if v_late and r.driver_id is not null then
    select profile_id into v_driver_profile from public.drivers where id = r.driver_id;
    perform public._booking_penalty(
      p_ride_id, r.client_id, 'tamcar_credit', v_driver_profile, 'tamcar_revenus', 200
    );
  end if;
end;
$fn_cancel_sched$;
grant execute on function public.cancel_scheduled_ride to authenticated;

-- ------------------------------------------------------------
-- 5. Désistement chauffeur : relance automatique + pénalité si tardif
-- ------------------------------------------------------------
create or replace function public.cancel_scheduled_by_driver(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  v_drv_id uuid;
  result public.rides;
  v_late boolean;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_drv_id from public.drivers where profile_id = auth.uid() limit 1;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Réservation introuvable'; end if;
  if r.status <> 'scheduled' or r.driver_id is distinct from v_drv_id then
    raise exception 'Pas votre réservation';
  end if;

  v_late := public._booking_is_late(r);

  update public.rides
    set driver_id = null,
        booking_reminder_30_sent_at = null,
        booking_reminder_15_sent_at = null,
        booking_reminders_sent = array_remove(booking_reminders_sent, 120::smallint),
        driver_search_started_at = now(),
        driver_search_prompted_at = null,
        updated_at = now()
    where id = p_ride_id
    returning * into result;

  if v_late then
    perform public._booking_penalty(
      p_ride_id, auth.uid(), 'tamcar_revenus', result.client_id, 'tamcar_credit', 200
    );
  end if;

  -- Nouvelle recherche immédiate. _notify_matching_drivers ne traite que
  -- le statut 'requested' : la course restant en 'scheduled', elle ne
  -- faisait rien du tout ici.
  perform public._notify_scheduled_booking(p_ride_id, true);
  perform public._push_notify(
    result.client_id,
    'Chauffeur indisponible',
    'Votre chauffeur s''est désisté. Nous recherchons un remplaçant — vous êtes prévenu dans un instant.',
    '/reservation/' || result.id::text,
    'booking-released:' || result.id::text,
    true
  );
  return result;
end;
$$;
grant execute on function public.cancel_scheduled_by_driver(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. Après la bascule H-10, la course suit le cycle ordinaire : les deux
--    RPC d'annulation standard doivent connaître le tarif réservation.
-- ------------------------------------------------------------
drop function if exists public.cancellation_fee_preview(uuid);
drop function if exists public.cancellation_fee_preview(uuid, text);

create or replace function public.cancellation_fee_preview(
  p_ride_id uuid,
  p_user_reason text default null
)
returns table (
  fee_fcfa int,
  reason_code text,
  driver_share_fcfa int,
  platform_share_fcfa int,
  driver_still_busy_elsewhere boolean,
  is_driver_fault boolean,
  driver_fault_evidence text,
  will_be_disputed boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rides;
  v_secs_since_matched int;
  v_fee int := 0;
  v_reason text := 'free';
  v_driver_busy_elsewhere boolean := false;
  v_fault record;
  v_disputed boolean := false;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null or r.client_id <> auth.uid() then
    raise exception 'Ride not found';
  end if;

  if r.driver_id is not null then
    v_driver_busy_elsewhere := exists (
      select 1 from public.rides other
      where other.driver_id = r.driver_id
        and other.id <> r.id
        and other.status in ('matched', 'arrived', 'in_progress')
        and other.matched_at < r.matched_at
    );
    if v_driver_busy_elsewhere then
      return query select 0, 'free_driver_busy', 0, 0, true, false, null::text, false;
      return;
    end if;
  end if;

  if p_user_reason in ('driver_not_moving', 'wrong_direction', 'wait_too_long', 'driver_asked') then
    select * into v_fault from public._eval_driver_fault(p_ride_id, p_user_reason);
    if v_fault.is_driver_fault then
      return query select 0, 'free_driver_fault', 0, 0, false, true, v_fault.evidence, false;
      return;
    end if;
    v_disputed := true;
  end if;

  -- Réservation à moins de 10 min du départ : tarif annoncé dans les
  -- rappels H-10 et H-5, il prime sur la grille des courses immédiates.
  if public._booking_is_late(r) and r.status in ('matched', 'arrived') then
    return query select 200, 'booking_late', 200, 0, false, false, null::text, v_disputed;
    return;
  end if;

  case
    when r.status = 'requested' then
      v_fee := 0;
      v_reason := 'free_no_match';
    when r.status = 'matched' then
      v_secs_since_matched := extract(epoch from (now() - r.matched_at))::int;
      if v_secs_since_matched <= 30 then
        v_fee := 0;
        v_reason := 'free_within_30s';
      else
        v_fee := public.round_to_50(300);
        v_reason := 'driver_on_way';
      end if;
    when r.status = 'arrived' then
      v_fee := public.round_to_50(500);
      v_reason := 'driver_arrived';
    when r.status = 'in_progress' then
      v_fee := public.round_to_50((r.price_total_fcfa * 0.50)::int);
      v_reason := 'ride_started';
    else
      v_fee := 0;
      v_reason := 'not_cancellable';
  end case;

  return query select
    v_fee,
    v_reason,
    (v_fee / 2)::int,
    v_fee - (v_fee / 2)::int,
    false,
    false,
    case when v_disputed and v_fault.evidence is not null then v_fault.evidence else null end,
    v_disputed;
end;
$$;

comment on function public.cancellation_fee_preview is
  'v4 : ajoute le tarif réservation (200 FCFA intégralement au chauffeur) quand la course est issue d''une réservation et qu''on est à moins de 10 min du départ.';

-- Côté chauffeur, l'annulation d'une course acceptée passe par le crédit
-- d'excuse (_grant_goodwill_credit, financé par le chauffeur à hauteur de
-- 200 F) — mais celui-ci est PLAFONNÉ à deux fois par semaine et par
-- client : au-delà, le chauffeur ne payait plus rien. Sur une réservation
-- tardive la pénalité doit tomber à tous les coups.
create or replace function public.cancel_ride_by_driver(
  ride_id uuid,
  p_reason text default null
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  result public.rides;
  v_driver public.drivers;
  v_late boolean;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Course introuvable'; end if;
  if r.driver_id is null then raise exception 'Aucun chauffeur sur cette course'; end if;

  select * into v_driver from public.drivers where id = r.driver_id;
  if v_driver.profile_id is null or v_driver.profile_id <> auth.uid() then
    raise exception 'Ce n''est pas votre course';
  end if;
  if r.status not in ('matched', 'arrived') then
    raise exception 'Annulation impossible à ce stade';
  end if;

  v_late := public._booking_is_late(r);

  update public.rides
  set status = 'cancelled_by_driver',
      ended_at = now(),
      cancel_reason = case when v_late then 'booking_late' else 'driver_cancelled' end,
      cancel_reason_user = p_reason,
      cancel_attributed_to = 'driver',
      cancel_driver_fault_evidence =
        'Annulation volontaire du chauffeur' || coalesce(' : ' || nullif(trim(p_reason), ''), ''),
      updated_at = now()
  where id = ride_id
  returning * into result;

  update public.drivers
    set cancellations_driver_fault_count = cancellations_driver_fault_count + 1
    where id = r.driver_id;
  perform public._apply_driver_strike(r.driver_id, ride_id, 'Annulation volontaire du chauffeur');

  if v_late then
    perform public._booking_penalty(
      ride_id, auth.uid(), 'tamcar_revenus', r.client_id, 'tamcar_credit', 200
    );
  else
    perform public._grant_goodwill_credit(r.client_id, r.driver_id, ride_id);
  end if;

  return result;
end;
$$;
grant execute on function public.cancel_ride_by_driver(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 7. Rappels H-30 / H-20 / H-10 / H-5, aux deux parties
--    + la main au client après une minute de recherche vaine
-- ------------------------------------------------------------
create or replace function public._remind_upcoming_bookings()
returns void
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  rung record;
  v_title text;
  v_tail text;
begin
  -- Recherche ouverte depuis plus d'une minute, toujours sans chauffeur :
  -- la décision revient au client (continuer / alternative / annuler).
  for rec in
    select r.id, r.client_id
    from public.rides r
    where r.status = 'scheduled'
      and r.driver_id is null
      and r.driver_search_started_at is not null
      and r.driver_search_prompted_at is null
      and r.driver_search_started_at <= now() - interval '1 minute'
      and r.scheduled_at > now()
    for update skip locked
  loop
    perform public._push_notify(
      rec.client_id,
      'Aucun chauffeur pour l''instant',
      'Personne n''a encore pris votre réservation. Continuer la recherche, voir une alternative ou annuler ?',
      '/reservation/' || rec.id::text,
      'booking-search:' || rec.id::text,
      true
    );
    update public.rides set driver_search_prompted_at = now() where id = rec.id;
  end loop;

  -- Chaque rappel ne vaut que dans SA fenêtre : une réservation prise à
  -- 31 min du départ ne doit pas recevoir « dans 30 minutes » ET
  -- « dans 20 minutes » dans la même minute.
  for rung in
    select * from (values (30, 20), (20, 10), (10, 5), (5, 0)) as t(hi, lo)
  loop
    v_title := 'Course dans ' || rung.hi || ' minutes';
    v_tail := case
      when rung.hi > 10 then 'Mais vous pouvez également annuler gratuitement.'
      else 'Mais l''annulation vous coûtera 200 FCFA.'
    end;

    for rec in
      select r.id, r.client_id, r.driver_id, d.profile_id as driver_profile_id
      from public.rides r
      left join public.drivers d on d.id = r.driver_id
      where r.scheduled_at is not null
        and r.status in ('scheduled', 'matched', 'requested')
        and not (rung.hi::smallint = any (r.booking_reminders_sent))
        and r.scheduled_at >  now() + (rung.lo || ' minutes')::interval
        and r.scheduled_at <= now() + (rung.hi || ' minutes')::interval
      for update of r skip locked
    loop
      if rec.driver_profile_id is not null then
        perform public._push_notify(
          rec.driver_profile_id, v_title,
          'Ta course est dans ' || rung.hi || ' minutes. Prépare-toi ! '
            || replace(replace(v_tail, 'vous pouvez', 'tu peux'), 'vous coûtera', 'te coûtera'),
          '/ride/' || rec.id::text,
          'booking-r' || rung.hi || 'd:' || rec.id::text,
          true
        );
      end if;

      perform public._push_notify(
        rec.client_id, v_title,
        'Votre course est dans ' || rung.hi || ' minutes. Préparez-vous ! ' || v_tail,
        '/ride/' || rec.id::text,
        'booking-r' || rung.hi || 'c:' || rec.id::text,
        true
      );

      update public.rides
        set booking_reminders_sent = booking_reminders_sent || rung.hi::smallint
        where id = rec.id;
    end loop;
  end loop;
end;
$$;

revoke all on function public._remind_upcoming_bookings() from public, anon, authenticated;

-- Le rappel H-10 dit déjà « prépare-toi » : le push « Départ maintenant »
-- de la bascule faisait doublon dans la même minute.
create or replace function public._on_ride_released_from_schedule()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'scheduled' and new.status = 'requested' then
    perform public._notify_matching_drivers(new.id);
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 8. Alternatives : la fonction existante sert déjà les courses
--    immédiates (catégorie, nouveau prix, écart, chauffeurs autour).
--    Deux ajustements pour les réservations :
--      • rayon 12 km, celui du matching des réservations, au lieu de 10 ;
--      • chauffeur sans position connue compté, comme dans l'alerte.
-- ------------------------------------------------------------
create or replace function public.preview_alternative_offers(p_ride_id uuid)
returns table (
  category vehicle_category,
  new_price_fcfa int,
  delta_fcfa int,          -- négatif = économie, positif = supplément
  drivers_online_nearby int
)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rides;
  pickup_g geography;
  cat vehicle_category;
  candidate_cats vehicle_category[];
  quote record;
  v_radius_m int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;

  pickup_g := r.pickup_location;
  v_radius_m := case when r.scheduled_at is not null then 12000 else 10000 end;

  if r.requested_category = 'essentiel' then
    candidate_cats := array['moto','tricycle','confort']::vehicle_category[];
  elsif r.requested_category = 'confort' then
    candidate_cats := array['moto','tricycle','essentiel']::vehicle_category[];
  elsif r.requested_category = 'moto' then
    candidate_cats := array['tricycle','essentiel','confort']::vehicle_category[];
  elsif r.requested_category = 'tricycle' then
    candidate_cats := array['moto','essentiel','confort']::vehicle_category[];
  elsif r.requested_category = 'premium' then
    candidate_cats := array['confort','essentiel']::vehicle_category[];
  else
    candidate_cats := array[]::vehicle_category[];
  end if;

  foreach cat in array candidate_cats loop
    select * into quote from public.compute_price(
      st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
      st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
      r.distance_km, r.duration_min, cat, false, false
    ) limit 1;

    return query
    select
      cat,
      quote.price_total_fcfa,
      quote.price_total_fcfa - r.price_total_fcfa,
      (
        select count(*)::int from public.drivers d
        join public.vehicles v on v.id = d.current_vehicle_id
        where d.is_online = true
          and d.status = 'active'
          and v.category = cat
          and (d.current_location is null
               or st_dwithin(d.current_location, pickup_g, v_radius_m))
      );
  end loop;
end;
$$;
grant execute on function public.preview_alternative_offers(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9. Le tick planifié fait TOUT : rappels puis bascule.
--    Les rappels d'abord, pour que le rappel H-10 parte avant que la
--    course ne change de statut.
-- ------------------------------------------------------------
create or replace function public._scheduled_rides_tick()
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._remind_upcoming_bookings();
  perform public._release_due_scheduled_rides();
end;
$$;

revoke all on function public._scheduled_rides_tick() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('booking-reminders');
exception when others then
  null;
end $$;

select cron.schedule(
  'booking-reminders',
  '* * * * *',
  $$select public._scheduled_rides_tick()$$
);

-- ------------------------------------------------------------
-- 10. Rattrapage : les réservations dont le départ est déjà passé et qui
--     n'ont jamais été libérées (la bascule dépendait du sondage des
--     chauffeurs). Elles sont invisibles côté client depuis leur heure
--     de départ — on les clôture proprement.
-- ------------------------------------------------------------
update public.rides
  set status = 'expired',
      cancel_reason = 'never_released',
      ended_at = now(),
      updated_at = now()
  where status = 'scheduled'
    and scheduled_at < now() - interval '30 minutes';
