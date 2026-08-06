-- ============================================================
-- TamCar — Alerte chauffeurs sur les réservations à moins de 2 h
-- Décision Terence 2026-08-06.
--
--   ÉTAT ANTÉRIEUR
--   Une réservation créée en statut 'scheduled' n'envoyait AUCUNE
--   notification : les chauffeurs ne la découvraient qu'en ouvrant
--   TamCar Pro (liste pending_scheduled_rides_for_driver). Une course
--   réservée pour dans 40 minutes pouvait donc rester sans chauffeur
--   jusqu'au filet de H-10, simplement parce que personne n'avait
--   l'application au premier plan.
--
--   RÈGLE RETENUE
--   Pousser une alerte uniquement à moins de 2 h du départ. Au-delà,
--   la liste dans l'application suffit : réveiller tous les chauffeurs
--   pour une course dans trois jours n'est que du bruit.
--
--   Deux déclencheurs, un seul envoi garanti :
--     1. à la création, si le départ est déjà à moins de 2 h ;
--     2. par pg_cron, quand une réservation plus lointaine entre dans
--        la fenêtre des 2 h sans chauffeur engagé.
--   L'envoi est marqué par la valeur sentinelle 120 dans
--   rides.booking_reminders_sent — le même tableau que les rappels
--   H-30/H-20/H-10, remis à zéro si le chauffeur se désiste.
--
--   BUG CORRIGÉ AU PASSAGE
--   cancel_scheduled_by_driver (désistement) appelait
--   _notify_matching_drivers, qui commence par « if r.status <>
--   'requested' then return ». La course désistée restant en
--   'scheduled', l'appel ne faisait rien : AUCUN chauffeur n'était
--   prévenu qu'une réservation venait de se libérer.
-- ============================================================

-- Filet si 20260806150000 n'a pas encore été joué.
alter table public.rides
  add column if not exists booking_reminders_sent smallint[] not null default '{}'::smallint[];

-- ------------------------------------------------------------
-- 1. Alerte aux chauffeurs éligibles d'une réservation libre
--    Ciblage identique à pending_scheduled_rides_for_driver (12 km,
--    catégorie compatible) : inutile de notifier un chauffeur pour une
--    course qu'il ne verra pas dans sa liste.
-- ------------------------------------------------------------
create or replace function public._notify_scheduled_booking(p_ride_id uuid)
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
  -- Hors fenêtre : la liste dans l'application fait le travail.
  if r.scheduled_at <= now() or r.scheduled_at > now() + interval '2 hours' then
    return;
  end if;
  if 120 = any (r.booking_reminders_sent) then return; end if;

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
      -- Position inconnue = notifié quand même (il jugera lui-même),
      -- cohérent avec _notify_matching_drivers.
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
    set booking_reminders_sent = booking_reminders_sent || 120::smallint
    where id = p_ride_id
      and not (120 = any (booking_reminders_sent));
end;
$fn_nsb$;

revoke all on function public._notify_scheduled_booking(uuid) from public, anon, authenticated;

comment on function public._notify_scheduled_booking is
  'Alerte les chauffeurs éligibles d''une réservation sans chauffeur à moins de 2 h du départ. Idempotent (sentinelle 120 dans rides.booking_reminders_sent).';

-- ------------------------------------------------------------
-- 2. À la création : course immédiate OU réservation proche
-- ------------------------------------------------------------
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
-- 3. Désistement chauffeur : prévenir réellement les autres
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
        booking_reminders_sent = '{}'::smallint[],
        updated_at = now()
    where id = p_ride_id
    returning * into result;

  -- La course reste en 'scheduled' : _notify_matching_drivers sortait
  -- immédiatement (elle ne traite que le statut 'requested').
  perform public._notify_scheduled_booking(p_ride_id);
  perform public._push_notify(
    result.client_id,
    'Chauffeur indisponible',
    'Votre chauffeur s''est désisté — on réengage un autre chauffeur.',
    '/ride/' || result.id::text,
    'booking-released:' || result.id::text,
    true
  );
  return result;
end;
$$;
grant execute on function public.cancel_scheduled_by_driver(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Balayage horaire : les réservations lointaines qui entrent dans
--    la fenêtre des 2 h. Greffé sur la tâche des rappels, qui tourne
--    déjà chaque minute.
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
