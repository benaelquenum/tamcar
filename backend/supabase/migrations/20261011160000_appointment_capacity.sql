-- ============================================================
-- TamCar — Rendez-vous des candidats chauffeurs : jusqu'à 3 candidats par créneau (2026-10-11)
--
--   Décision de Terence : « accepte au plus 3 chauffeurs par créneau ». Le plafond est un réglage (rdv_capacity_per_slot,
--   3 par défaut, entre 1 et 20) : un créneau reste proposé tant qu'il compte moins de candidats que ce plafond.
--   L'ancien index unique (un seul rendez-vous actif par créneau) est supprimé ; book_appointment verrouille le créneau le temps
--   de compter pour que deux candidats simultanés ne dépassent jamais le plafond.
-- ============================================================

insert into public.program_rules (key, value, label) values
  ('rdv_capacity_per_slot', 3, 'Rendez-vous candidats : nombre maximal de candidats par créneau (1 à 20)')
on conflict (key) do update set label = excluded.label;

create or replace function public.admin_set_program_rule(p_key text, p_value int)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_value is null or p_value < 0 then raise exception 'Valeur invalide'; end if;
  if (p_key like 'share_%' or p_key in ('surplus_cede_pct', 'tamassur_fund_pct')) and p_value > 100 then
    raise exception 'Un pourcentage ne peut pas dépasser 100.';
  end if;
  if p_key like 'tamassur_months_%' then
    if p_value < 1 or p_value > 120 then raise exception 'Une durée doit être comprise entre 1 et 120 mois.'; end if;
  elsif p_key like 'tamassur_%' and p_key <> 'tamassur_fund_pct' and p_value < 100 then
    raise exception 'Une cotisation quotidienne doit être d''au moins 100 F.';
  end if;
  if p_key in ('payments_test_mode', 'payouts_auto', 'payments_provider') and p_value not in (0, 1) then
    raise exception 'Ce réglage se règle sur 1 (activé) ou 0 (désactivé).';
  end if;
  if p_key = 'booking_penalty_fcfa' and p_value > 5000 then
    raise exception 'La pénalité de réservation ne peut pas dépasser 5 000 F.';
  end if;
  if p_key = 'rdv_capacity_per_slot' and (p_value < 1 or p_value > 20) then
    raise exception 'Entre 1 et 20 candidats par créneau.';
  end if;
  if p_key in ('gadget_driver_min_rating', 'gadget_client_min_rating') and p_value > 50 then
    raise exception 'Une note minimale s''exprime en dixièmes d''étoile (47 = 4,7) et ne peut pas dépasser 50.';
  end if;
  if p_key in ('gadget_winners_drivers', 'gadget_winners_clients') and p_value > 50 then
    raise exception 'Au plus 50 gagnants par catégorie.';
  end if;
  if p_key = 'prio_enabled' and p_value not in (0, 1) then
    raise exception 'La priorité de proximité se règle sur 1 (active) ou 0 (désactivée).';
  end if;
  if p_key like 'prio_r%_m' and (p_value < 500 or p_value > 50000) then
    raise exception 'Un rayon doit être compris entre 500 m et 50 000 m.';
  end if;
  if p_key like 'prio_d%_s' and p_value > 300 then
    raise exception 'Un délai ne peut pas dépasser 300 secondes.';
  end if;
  update public.program_rules set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'Réglage inconnu'; end if;
end;
$fn$;
revoke execute on function public.admin_set_program_rule(text, int) from public, anon;
grant execute on function public.admin_set_program_rule(text, int) to authenticated;

drop index if exists public.driver_appointments_slot_uniq;

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
    and (
      select count(*) from public.driver_appointments a
      where a.slot_at = c.slot_at
        and a.status in ('scheduled', 'confirmed')
    ) < greatest(public._program_rule('rdv_capacity_per_slot'), 1)
  order by c.slot_at
  limit 1000;
$fn$;

comment on function public.available_slots is
  'Créneaux de RDV chauffeur encore ouverts. Lun-Ven 9h00-11h30 et 14h00-18h00 (heure de Porto-Novo), tranches de 30 min, min 2 h de préavis, au plus rdv_capacity_per_slot candidats par créneau.';

-- Annulation par le candidat : la politique RLS de mise à jour (qui exige que la NOUVELLE ligne soit encore « scheduled » ou « confirmed »)
-- refusait tout passage à « cancelled_by_user » : le bouton « Annuler mon rendez-vous » échouait. La fonction s'exécute avec ses
-- propres droits mais ne touche que le rendez-vous actif de l'appelant.
create or replace function public.cancel_appointment(app_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  update public.driver_appointments
     set status = 'cancelled_by_user', updated_at = now()
   where id = app_id
     and profile_id = auth.uid()
     and status in ('scheduled', 'confirmed');
end;
$fn$;

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
  v_constraint text;
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

  -- Un seul candidat à la fois réserve ce créneau : le comptage ci-dessous voit alors les réservations déjà validées
  perform pg_advisory_xact_lock(hashtext('rdv_slot'), floor(extract(epoch from p_slot_at) / 60)::int);

  -- Le créneau doit être l'un de ceux proposés (bons jours, bonnes heures) et ne pas être complet
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
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'driver_appointments_active_uniq' then
      raise exception 'Tu as déjà un rendez-vous en cours. Annule-le si tu veux le changer.';
    end if;
    raise;
  end;

  return result;
end;
$fn$;
