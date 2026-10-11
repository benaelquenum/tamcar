-- ============================================================
-- TamCar — Rendez-vous des candidats chauffeurs : nouveaux horaires et correctifs (2026-10-11)
--
--   Décision de Terence : accueil de 9h00 à 11h30, puis de 14h00 à 18h00 (créneaux de 30 min, lundi à vendredi).
--
--   Correctifs faits au passage :
--   1. Fuseau horaire. La base tourne en UTC : « 09:00 » était lu comme 09:00 UTC, soit 10h00 à Cotonou. Les créneaux sont
--      maintenant construits à l'heure de Porto-Novo (UTC+1, sans changement d'heure) ; le « jour » et les 2 h de préavis aussi.
--   2. Créneaux déjà pris. available_slots s'exécutait avec les droits du candidat, qui ne voit que SES rendez-vous (RLS) :
--      les créneaux réservés par d'autres restaient affichés comme libres. Elle est maintenant « security definer » (elle ne
--      renvoie que des horaires libres, aucune donnée personnelle).
--   3. book_appointment : refuse un horaire qui n'est pas proposé (un appel direct pouvait réserver 03h00 un dimanche) et
--      renvoie un message clair si deux candidats prennent le même créneau en même temps (index unique).
--   4. La limite de 200 créneaux coupait la liste à ~2 semaines avec 15 créneaux par jour : portée à 1000.
-- ============================================================

create or replace function public.available_slots(days_ahead int default 30)
returns table (slot_at timestamptz, day_label text)
language sql stable security definer set search_path = public as $fn$
  with slot_hours as (
    select unnest(array[
      '09:00','09:30','10:00','10:30','11:00','11:30',
      '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00'
    ]::text[])::time as hh
  ),
  dates as (
    select ((now() at time zone 'Africa/Porto-Novo')::date + g) as d
      from generate_series(1, least(greatest(coalesce(days_ahead, 30), 1), 60)) g
  ),
  candidates as (
    select ((d.d + sh.hh) at time zone 'Africa/Porto-Novo') as slot_at
      from dates d
     cross join slot_hours sh
     where extract(dow from d.d) between 1 and 5
  )
  select
    c.slot_at,
    to_char(c.slot_at at time zone 'Africa/Porto-Novo', 'FMDay DD FMMonth à HH24:MI') as day_label
  from candidates c
  where c.slot_at > now() + interval '2 hours'
    and not exists (
      select 1 from public.driver_appointments a
      where a.slot_at = c.slot_at
        and a.status in ('scheduled', 'confirmed')
    )
  order by c.slot_at
  limit 1000;
$fn$;

comment on function public.available_slots is
  'Créneaux libres pour prendre RDV chauffeur. Lun-Ven 9h00-11h30 et 14h00-18h00 (heure de Porto-Novo), tranches de 30 min, min 2 h de préavis.';

create or replace function public.book_appointment(
  p_application_type driver_application_type,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_slot_at timestamptz
)
returns driver_appointments
language plpgsql set search_path = public as $fn$
declare
  result public.driver_appointments;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  -- Refuse si déjà un RDV actif
  if exists (
    select 1 from public.driver_appointments
    where profile_id = auth.uid()
      and status in ('scheduled', 'confirmed')
  ) then
    raise exception 'Tu as déjà un rendez-vous en cours. Annule-le si tu veux le changer.';
  end if;

  -- Créneau dans le futur (min 2h)
  if p_slot_at < now() + interval '2 hours' then
    raise exception 'Créneau trop proche (min 2h de préavis).';
  end if;

  -- Le créneau doit être l'un de ceux proposés (bons jours, bonnes heures) et encore libre
  if not exists (select 1 from public.available_slots(60) s where s.slot_at = p_slot_at) then
    raise exception 'Ce créneau n''est plus disponible. Choisis-en un autre.';
  end if;

  begin
    insert into public.driver_appointments (
      profile_id, application_type, first_name, last_name, phone, email, slot_at
    ) values (
      auth.uid(), p_application_type,
      trim(p_first_name), trim(p_last_name), trim(p_phone),
      nullif(trim(coalesce(p_email, '')), ''),
      p_slot_at
    ) returning * into result;
  exception when unique_violation then
    raise exception 'Ce créneau vient d''être réservé. Choisis-en un autre.';
  end;

  return result;
end;
$fn$;
