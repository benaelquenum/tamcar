-- ============================================================
-- TamCar — Rappels de réservation : 3 rappels, toutes les 10 minutes
-- Décision Terence 2026-08-06.
--
--   AVANT : 2 rappels (H-30 et H-15), déclenchés en « piggy-back » de
--   pending_rides_for_driver — donc uniquement si un chauffeur avait
--   l'application ouverte. Aucun chauffeur en ligne = aucun rappel.
--
--   APRÈS : 3 rappels à H-30, H-20 et H-10, au client ET au chauffeur,
--   déclenchés par pg_cron toutes les minutes (indépendant de l'app).
--   Le piggy-back est conservé comme filet.
--
--   H-10 est aussi l'instant où _release_due_scheduled_rides bascule la
--   course (→ 'matched' si un chauffeur est engagé, → 'requested' sinon).
--   Le 3e rappel accepte donc les statuts 'matched' et 'requested', sans
--   quoi il serait perdu selon l'ordre d'exécution du tick.
--
--   Si aucun chauffeur n'est encore engagé, le client est prévenu quand
--   même — avec un message honnête (recherche en cours), pas un message
--   de confirmation.
--
--   Une réservation prise à moins de 30 min du départ (le plancher est de
--   15 min) reçoit seulement les rappels encore pertinents : 2 rappels si
--   elle est prise entre 20 et 30 min avant, 1 seul en dessous.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Suivi des rappels envoyés : un tableau plutôt qu'une colonne par
--    échéance (les colonnes 30/15 de juillet ne tenaient pas au premier
--    changement de cadence).
-- ------------------------------------------------------------
alter table public.rides
  add column if not exists booking_reminders_sent smallint[] not null default '{}'::smallint[];

comment on column public.rides.booking_reminders_sent is
  'Échéances de rappel déjà envoyées, en minutes avant le départ (30, 20, 10). Remis à zéro si le chauffeur se désiste.';

-- ------------------------------------------------------------
-- 2. Rappels H-30 / H-20 / H-10
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
      -- Message chauffeur (seulement s'il y en a un d'engagé)
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

      -- Message client — le contenu dépend de l'engagement d'un chauffeur
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

-- ------------------------------------------------------------
-- 3. Désistement chauffeur → les rappels doivent repartir de zéro
--    pour le chauffeur suivant.
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

  perform public._notify_matching_drivers(p_ride_id);
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
-- 4. Déclenchement horaire indépendant de l'activité des chauffeurs
-- ------------------------------------------------------------
do $$
begin
  perform cron.unschedule('booking-reminders');
exception when others then
  null;  -- la tâche n'existait pas encore
end $$;

select cron.schedule(
  'booking-reminders',
  '* * * * *',
  $$select public._remind_upcoming_bookings()$$
);
