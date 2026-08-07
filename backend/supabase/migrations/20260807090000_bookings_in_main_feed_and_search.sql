-- ============================================================
-- TamCar — Réservations dans le fil principal + recherche après
-- désistement. Décision Terence 2026-08-07.
--
--   1. OFFRE AU CHAUFFEUR
--      La réservation n'est plus reléguée dans une section à part : elle
--      s'affiche dans le fil des courses, comme une course ordinaire,
--      avec une pastille « Réservation », l'heure de départ, le prénom
--      du client, le prix et la part chauffeur. L'RPC gagne donc le
--      prénom du client et l'indicateur de catégorie inférieure, pour
--      que la carte porte exactement les mêmes informations que
--      pending_rides_for_driver.
--
--   2. DÉSISTEMENT
--      Le client est prévenu ET informé qu'une recherche est lancée.
--      Les chauffeurs éligibles sont réellement alertés (alerte forcée,
--      quelle que soit la distance au départ : perdre son chauffeur est
--      un événement, pas une réservation ordinaire).
--      Au bout d'UNE MINUTE sans repreneur, la main revient au client :
--      continuer la recherche, changer de catégorie, ou annuler.
--      Dès qu'un chauffeur s'engage, la recherche s'arrête et le client
--      reçoit « Réservation confirmée » — la course suit son cours.
--
--   Deux colonnes portent l'état de la recherche :
--     driver_search_started_at   quand la recherche en cours a démarré
--     driver_search_prompted_at  quand le client a été invité à décider
--   Toutes deux remises à null dès qu'un chauffeur s'engage.
-- ============================================================

alter table public.rides
  add column if not exists driver_search_started_at  timestamptz,
  add column if not exists driver_search_prompted_at timestamptz;

comment on column public.rides.driver_search_started_at is
  'Réservation sans chauffeur : instant de démarrage de la recherche active (désistement, changement de catégorie, relance client). Null = pas de recherche en cours.';

-- ------------------------------------------------------------
-- 1. rides_view : requested_category manquait (ajout EN FIN de vue)
-- ------------------------------------------------------------
create or replace view public.rides_view
with (security_invoker = true)
as
select
  r.id,
  r.client_id,
  r.driver_id,
  r.vehicle_id,
  r.dealer_partner_id,
  r.pickup_address,
  st_x(r.pickup_location::geometry) as pickup_lng,
  st_y(r.pickup_location::geometry) as pickup_lat,
  r.dropoff_address,
  st_x(r.dropoff_location::geometry) as dropoff_lng,
  st_y(r.dropoff_location::geometry) as dropoff_lat,
  r.distance_km,
  r.duration_min,
  r.price_total_fcfa,
  r.driver_share_fcfa,
  r.driver_rachat_fcfa,
  r.dealer_share_fcfa,
  r.platform_share_fcfa,
  r.status,
  r.payment_method,
  r.scheduled_at,
  r.requested_at,
  r.matched_at,
  r.started_at,
  r.ended_at,
  r.cancelled_at,
  r.cancel_reason,
  r.arrived_at,
  r.arrival_distance_m,
  r.arrival_flagged,
  r.completion_requested_at,
  r.completion_requested_lat,
  r.completion_requested_lng,
  r.completion_distance_from_dropoff_m,
  r.completion_recomputed_price_fcfa,
  r.completion_auto_accept_at,
  r.stops_count,
  r.stops_extra_price_fcfa,
  r.stops_waiting_fee_fcfa,
  r.created_at,
  r.updated_at,
  r.passenger_name,
  r.passenger_phone,
  -- Position live du client (20260730170000) : conserver l'ordre exact des
  -- colonnes existantes, `create or replace view` ne sait que les prolonger.
  r.client_live_lat,
  r.client_live_lng,
  r.client_live_at,
  r.requested_category,
  r.driver_search_started_at,
  r.driver_search_prompted_at
from public.rides r;

grant select on public.rides_view to authenticated, anon;

-- ------------------------------------------------------------
-- 2. Alerte chauffeurs : variante forcée (désistement / relance)
--    p_force ignore la fenêtre des 2 h et la sentinelle : la
--    réservation vient de perdre son chauffeur, il faut la remettre en
--    circulation tout de suite.
-- ------------------------------------------------------------
drop function if exists public._notify_scheduled_booking(uuid);

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
  if not p_force then
    -- Hors fenêtre : la liste dans l'application fait le travail.
    if r.scheduled_at > now() + interval '2 hours' then return; end if;
    if 120 = any (r.booking_reminders_sent) then return; end if;
  end if;

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
        end
    where id = p_ride_id;
end;
$fn_nsb$;

revoke all on function public._notify_scheduled_booking(uuid, boolean) from public, anon, authenticated;

comment on function public._notify_scheduled_booking is
  'Alerte les chauffeurs éligibles d''une réservation sans chauffeur. Par défaut : seulement à moins de 2 h du départ et une seule fois (sentinelle 120 dans rides.booking_reminders_sent). p_force => true pour un désistement ou une relance client.';

create or replace function public._on_ride_created()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'requested' and new.driver_id is null then
    perform public._notify_matching_drivers(new.id);
  elsif new.status = 'scheduled' and new.driver_id is null then
    perform public._notify_scheduled_booking(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ride_created_push on public.rides;
create trigger trg_ride_created_push
  after insert on public.rides
  for each row
  execute function public._on_ride_created();

-- ------------------------------------------------------------
-- 3. Offre chauffeur : mêmes informations qu'une course ordinaire
--    (drop obligatoire : le type de retour change)
-- ------------------------------------------------------------
drop function if exists public.pending_scheduled_rides_for_driver(double precision);

create or replace function public.pending_scheduled_rides_for_driver(
  radius_km double precision default 12.0
)
returns table (
  id uuid,
  pickup_address text,
  dropoff_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  distance_from_driver_m double precision,
  distance_km numeric,
  duration_min int,
  price_total_fcfa int,
  driver_share_fcfa int,
  scheduled_at timestamptz,
  requested_category vehicle_category,
  client_first_name text,
  is_below_driver_category boolean
)
language plpgsql stable security invoker as $fn_psr$
declare
  v_drv_id uuid;
  v_drv_loc geography;
  v_drv_category vehicle_category;
begin
  select d.id, d.current_location, v.category
    into v_drv_id, v_drv_loc, v_drv_category
  from public.drivers d
  left join public.vehicles v on v.id = d.current_vehicle_id
  where d.profile_id = auth.uid()
    and d.is_online = true
    and d.status = 'active'
  limit 1;

  if v_drv_id is null or v_drv_loc is null or v_drv_category is null then
    return;
  end if;

  return query
  select
    r.id, r.pickup_address, r.dropoff_address,
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    st_distance(r.pickup_location, v_drv_loc),
    r.distance_km, r.duration_min, r.price_total_fcfa, r.driver_share_fcfa,
    r.scheduled_at, r.requested_category,
    -- Prénom seul : le chauffeur n'a pas besoin de l'identité complète
    -- avant de s'engager. Le passager prime s'il s'agit d'un proche.
    split_part(
      coalesce(nullif(trim(r.passenger_name), ''), cp.full_name, 'Client'),
      ' ', 1
    ),
    (v_drv_category = 'confort' and r.requested_category = 'essentiel')
  from public.rides r
  left join public.profiles cp on cp.id = r.client_id
  where r.status = 'scheduled'
    and r.driver_id is null
    and r.scheduled_at > now()
    and st_dwithin(r.pickup_location, v_drv_loc, radius_km * 1000)
    and (
      v_drv_category = r.requested_category
      or (v_drv_category = 'confort' and r.requested_category = 'essentiel')
    )
  order by r.scheduled_at asc
  limit 20;
end;
$fn_psr$;
grant execute on function public.pending_scheduled_rides_for_driver(double precision) to authenticated;

-- ------------------------------------------------------------
-- 4. Engagement : la recherche s'arrête
-- ------------------------------------------------------------
create or replace function public.accept_scheduled_ride(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  v_drv_id uuid;
  v_drv_category vehicle_category;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select d.id, v.category into v_drv_id, v_drv_category
  from public.drivers d
  left join public.vehicles v on v.id = d.current_vehicle_id
  where d.profile_id = auth.uid() and d.status = 'active'
  limit 1;
  if v_drv_id is null then raise exception 'Chauffeur non actif'; end if;
  if v_drv_category is null then raise exception 'Aucun véhicule courant'; end if;

  select * into r from public.rides where id = p_ride_id for update;
  if r is null then raise exception 'Réservation introuvable'; end if;
  if r.status <> 'scheduled' then raise exception 'Réservation non disponible'; end if;
  if r.driver_id is not null then raise exception 'Déjà prise par un autre chauffeur'; end if;
  if not (v_drv_category = r.requested_category
          or (v_drv_category = 'confort' and r.requested_category = 'essentiel')) then
    raise exception 'Catégorie de véhicule incompatible';
  end if;

  update public.rides
    set driver_id = v_drv_id,
        driver_search_started_at = null,
        driver_search_prompted_at = null,
        updated_at = now()
    where id = p_ride_id and status = 'scheduled' and driver_id is null
    returning * into result;
  if result.id is null then raise exception 'Déjà prise'; end if;

  perform public._push_notify(
    result.client_id,
    'Réservation confirmée',
    'Un chauffeur est engagé pour votre course programmée.',
    '/ride/' || result.id::text,
    'booking-accepted:' || result.id::text,
    false
  );
  return result;
end;
$$;
grant execute on function public.accept_scheduled_ride(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. Désistement : le client est prévenu, la recherche démarre
-- ------------------------------------------------------------
create or replace function public.cancel_scheduled_by_driver(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  v_drv_id uuid;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_drv_id from public.drivers where profile_id = auth.uid() limit 1;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Réservation introuvable'; end if;
  if r.status <> 'scheduled' or r.driver_id is distinct from v_drv_id then
    raise exception 'Pas votre réservation';
  end if;

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

  -- Alerte forcée : la course reste en 'scheduled', donc
  -- _notify_matching_drivers (statut 'requested' uniquement) ne faisait
  -- rien. Et perdre son chauffeur justifie de sortir de la fenêtre 2 h.
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
-- 6. Client : relancer la recherche (bouton « Continuer »)
-- ------------------------------------------------------------
create or replace function public.scheduled_search_continue(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Réservation introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Pas votre réservation'; end if;
  if r.status <> 'scheduled' then raise exception 'Réservation déjà libérée aux chauffeurs'; end if;
  if r.driver_id is not null then raise exception 'Un chauffeur est déjà engagé'; end if;

  update public.rides
    set booking_reminders_sent = array_remove(booking_reminders_sent, 120::smallint),
        driver_search_started_at = now(),
        driver_search_prompted_at = null,
        updated_at = now()
    where id = p_ride_id
    returning * into result;

  perform public._notify_scheduled_booking(p_ride_id, true);
  return result;
end;
$$;
grant execute on function public.scheduled_search_continue(uuid) to authenticated;

comment on function public.scheduled_search_continue is
  'Le client relance la recherche d''un chauffeur sur sa réservation : les chauffeurs éligibles sont ré-alertés et le compte à rebours d''une minute repart.';

-- ------------------------------------------------------------
-- 7. Changer de catégorie : ouvert aux réservations
--    (jusqu'ici réservé au statut 'requested')
-- ------------------------------------------------------------
create or replace function public.client_switch_category(
  p_ride_id uuid,
  p_new_category vehicle_category
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  quote record;
  delta int;
  client_wallet_id uuid;
  result public.rides;
  v_tx_type wallet_tx_type;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('requested', 'scheduled') then
    raise exception 'Course déjà matchée ou terminée';
  end if;
  if r.status = 'scheduled' and r.driver_id is not null then
    raise exception 'Un chauffeur est déjà engagé sur cette réservation';
  end if;
  if r.requested_category = p_new_category then
    raise exception 'Déjà dans cette catégorie';
  end if;

  select * into quote from public.compute_price(
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    r.distance_km, r.duration_min, p_new_category, false, false
  ) limit 1;
  if quote is null or quote.price_total_fcfa is null then
    raise exception 'Tarif indisponible pour cette catégorie';
  end if;

  delta := r.price_total_fcfa - quote.price_total_fcfa;

  update public.rides set
    requested_category = p_new_category,
    price_total_fcfa   = quote.price_total_fcfa,
    driver_share_fcfa  = quote.driver_cash_fcfa,
    driver_rachat_fcfa = quote.driver_rachat_fcfa,
    dealer_share_fcfa  = quote.dealer_share_fcfa,
    platform_share_fcfa= quote.platform_share_fcfa,
    downgrade_accepted_at = case
      when p_new_category in ('moto','tricycle') then now()
      when p_new_category = 'essentiel' and r.requested_category in ('confort') then now()
      else downgrade_accepted_at
    end,
    -- Réservation : la nouvelle catégorie relance une recherche neuve.
    booking_reminders_sent = case
      when r.status = 'scheduled'
        then array_remove(booking_reminders_sent, 120::smallint)
      else booking_reminders_sent
    end,
    driver_search_started_at = case
      when r.status = 'scheduled' then now() else driver_search_started_at
    end,
    driver_search_prompted_at = case
      when r.status = 'scheduled' then null else driver_search_prompted_at
    end,
    updated_at = now()
  where id = p_ride_id
  returning * into result;

  if delta <> 0 then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (r.client_id, 'tamcar_credit', 0)
      on conflict (profile_id, kind) do nothing;
    select id into client_wallet_id
      from public.wallets
      where profile_id = r.client_id and kind = 'tamcar_credit';
    update public.wallets
      set balance_fcfa = balance_fcfa + delta,
          updated_at = now()
      where id = client_wallet_id;
    -- Cast explicite du type (le CASE renvoie un text non typé)
    v_tx_type := case when delta > 0 then 'refund'::wallet_tx_type
                                     else 'payment'::wallet_tx_type end;
    insert into public.wallet_transactions
      (wallet_id, type, amount_fcfa, ride_id, status)
      values (client_wallet_id, v_tx_type, abs(delta), p_ride_id, 'success');
  end if;

  return result;
end;
$$;
grant execute on function public.client_switch_category(uuid, vehicle_category) to authenticated;

-- Le déclencheur de re-notification ne couvrait que le statut 'requested'
create or replace function public._on_ride_category_switch()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.requested_category is not distinct from new.requested_category then
    return new;
  end if;
  if new.status = 'requested' then
    perform public._notify_matching_drivers(new.id);
  elsif new.status = 'scheduled' and new.driver_id is null then
    perform public._notify_scheduled_booking(new.id, true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ride_category_switch on public.rides;
create trigger trg_ride_category_switch
  after update of requested_category on public.rides
  for each row
  execute function public._on_ride_category_switch();

-- ------------------------------------------------------------
-- 8. Cron : la main revient au client au bout d'une minute
-- ------------------------------------------------------------
create or replace function public._remind_upcoming_bookings()
returns void
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  v_min smallint;
  v_title text;
  v_driver_body text;
  v_client_body text;
begin
  -- H-2 : la réservation entre dans la fenêtre d'alerte sans chauffeur
  for rec in
    select r.id
    from public.rides r
    where r.status = 'scheduled'
      and r.driver_id is null
      and r.scheduled_at is not null
      and not (120 = any (r.booking_reminders_sent))
      and r.scheduled_at >  now()
      and r.scheduled_at <= now() + interval '2 hours'
    for update skip locked
  loop
    perform public._notify_scheduled_booking(rec.id);
  end loop;

  -- Recherche en cours depuis plus d'une minute, toujours sans chauffeur :
  -- la décision revient au client (continuer / changer / annuler).
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
      'Personne n''a encore repris votre réservation. Continuer la recherche, changer de catégorie ou annuler ?',
      '/reservation/' || rec.id::text,
      'booking-search:' || rec.id::text,
      true
    );
    update public.rides set driver_search_prompted_at = now() where id = rec.id;
  end loop;

  foreach v_min in array array[30, 20, 10]::smallint[] loop
    v_title := 'Course dans ' || v_min || ' min';

    for rec in
      select r.id, r.client_id, r.driver_id, d.profile_id as driver_profile_id
      from public.rides r
      left join public.drivers d on d.id = r.driver_id
      where r.scheduled_at is not null
        and r.status in ('scheduled', 'matched', 'requested')
        and not (v_min = any (r.booking_reminders_sent))
        -- Chaque rappel ne vaut que dans SA fenêtre de 10 minutes : une
        -- réservation prise 16 min à l'avance ne doit pas recevoir
        -- « Course dans 30 min ». Elle reçoit le rappel 20 puis le 10.
        and r.scheduled_at >  now() + ((v_min - 10) || ' minutes')::interval
        and r.scheduled_at <= now() + (v_min || ' minutes')::interval
      for update of r skip locked
    loop
      if rec.driver_profile_id is not null then
        v_driver_body := case v_min
          when 30 then 'Ta réservation part dans 30 min. Prépare-toi.'
          when 20 then 'Ta réservation part dans 20 min. Mets-toi en route bientôt.'
          else 'Départ maintenant — va chercher le client.'
        end;
        perform public._push_notify(
          rec.driver_profile_id, v_title, v_driver_body,
          '/ride/' || rec.id::text,
          'booking-r' || v_min || 'd:' || rec.id::text,
          true
        );
      end if;

      if rec.driver_id is not null then
        v_client_body := case v_min
          when 30 then 'Votre chauffeur est confirmé. Annulation gratuite encore 20 min.'
          when 20 then 'Votre chauffeur est confirmé. Annulation gratuite encore 10 min.'
          else 'Votre chauffeur se met en route.'
        end;
      else
        v_client_body := case v_min
          when 30 then 'Nous cherchons encore un chauffeur. Annulation gratuite.'
          when 20 then 'Recherche de chauffeur toujours en cours. Annulation gratuite.'
          else 'Votre course est proposée à tous les chauffeurs disponibles.'
        end;
      end if;
      perform public._push_notify(
        rec.client_id, v_title, v_client_body,
        '/ride/' || rec.id::text,
        'booking-r' || v_min || 'c:' || rec.id::text,
        true
      );

      update public.rides
        set booking_reminders_sent = booking_reminders_sent || v_min
        where id = rec.id;
    end loop;
  end loop;
end;
$$;

revoke all on function public._remind_upcoming_bookings() from public, anon, authenticated;
