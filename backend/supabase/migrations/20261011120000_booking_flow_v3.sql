-- ============================================================
-- TamCar — Réservations v3 : désistement, annulation, départ anticipé, pénalités (2026-10-11)
--
--   Constats de Terence (essais des 9 et 10 octobre) :
--   • un chauffeur qui se désistait APRÈS la bascule H-10 terminait la course (« annulée par le chauffeur ») au lieu de relancer
--     une recherche : le client restait devant « chauffeur trouvé » sans rien voir changer ;
--   • le client ne pouvait pas annuler une réservation déjà prise par un chauffeur (aucun bouton) ;
--   • le chauffeur ne pouvait rien faire sur une réservation tant qu'elle n'était pas passée en course (H-10) : ni partir vers le
--     client, ni signaler son arrivée comme sur une course ordinaire ;
--   • avant H-10 un désistement était gratuit pour les deux ; après, pénalité — mais la règle n'était appliquée que sur certains
--     chemins, et le montant était écrit en dur (200 F).
--
--   Règles (décisions du 2026-08-07, conservées) : rappels aux deux parties à H-30, H-20, H-10 et H-5 ; gratuit jusqu'à H-10 ;
--   moins de 10 minutes avant le départ : pénalité de 200 F (réglage booking_penalty_fcfa) débitée à celui qui annule et
--   reversée EN ENTIER à l'autre partie (client lésé ou chauffeur lésé). Un désistement relance TOUJOURS une recherche (le
--   chauffeur qui s'est désisté n'est plus proposé pour cette course).
-- ============================================================

-- A. Montant de la pénalité : réglage --------------------------------------------------------------------------------
insert into public.program_rules (key, value, label) values
  ('booking_penalty_fcfa', 200,
   'Réservation : pénalité d''annulation tardive (moins de 10 min avant le départ), en F. Débitée à celui qui annule et reversée en entier à l''autre partie (client ou chauffeur lésé).')
on conflict (key) do nothing;

create or replace function public._booking_penalty_amount()
returns int language sql stable security definer set search_path = public as $fn$
  select greatest(0, public._program_rule('booking_penalty_fcfa'));
$fn$;
revoke execute on function public._booking_penalty_amount() from public, anon, authenticated;

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

-- B. Le chauffeur qui s'est désisté n'est plus proposé pour cette course -----------------------------------------------
create table if not exists public.ride_driver_exclusions (
  ride_id uuid not null references public.rides(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (ride_id, driver_id)
);
alter table public.ride_driver_exclusions enable row level security;
revoke all on public.ride_driver_exclusions from anon, authenticated;

create or replace function public._guard_excluded_driver()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.driver_id is not null and new.driver_id is distinct from old.driver_id
     and exists (select 1 from public.ride_driver_exclusions x where x.ride_id = new.id and x.driver_id = new.driver_id) then
    raise exception 'Vous vous êtes désisté de cette course : elle est proposée à d''autres chauffeurs.';
  end if;
  return new;
end;
$fn$;
revoke execute on function public._guard_excluded_driver() from public, anon, authenticated;
drop trigger if exists rides_guard_excluded_driver on public.rides;
create trigger rides_guard_excluded_driver
  before update of driver_id on public.rides
  for each row execute function public._guard_excluded_driver();


-- Alerte de nouvelle course : sans le chauffeur qui s'est désisté
CREATE OR REPLACE FUNCTION public._notify_matching_drivers(p_ride_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.rides;
  drv record;
  category_label text;
  v_radius int;
begin
  select * into r from public.rides where id = p_ride_id;
  if r is null or r.status <> 'requested' then return; end if;
  -- Course directe : jamais en alerte générale.
  if r.requested_driver_id is not null then return; end if;

  category_label := case r.requested_category
    when 'moto'      then 'Moto'
    when 'tricycle'  then 'Tricycle'
    when 'essentiel' then 'Essentiel'
    when 'confort'   then 'Confort'
    when 'premium'   then 'VIP'
    else initcap(r.requested_category::text)
  end;

  -- Priorité de proximité : seul le premier cercle est alerté d'emblée ; les cercles suivants le
  -- sont à leur ouverture (_push_ring_openings).
  v_radius := public._ride_visible_radius_m(0);
  update public.rides set notified_radius_m = v_radius where id = p_ride_id;

  -- Seuls les chauffeurs de la catégorie demandée sont alertés d'emblée. Les
  -- catégories supérieures voient la demande dans leur pool après 30 s.
  for drv in
    select d.profile_id
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.is_online = true
      and d.status = 'active'
      and v.category = r.requested_category
      and not exists (select 1 from public.ride_driver_exclusions x where x.ride_id = r.id and x.driver_id = d.id)
      -- Position inconnue = notifié quand même (il jugera lui-même)
      and (d.current_location is null
           or st_dwithin(d.current_location, r.pickup_location, v_radius))
  loop
    perform public._push_notify(
      drv.profile_id,
      '🚗 Nouvelle course ' || category_label,
      'Un client attend près de vous. Ouvrez TamCar pour accepter.',
      '/',
      'new-ride:' || p_ride_id::text,
      true
    );
  end loop;
end;
$function$;


-- Ouverture des cercles : idem
CREATE OR REPLACE FUNCTION public._push_ring_openings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  drv record;
  v_new int;
  v_label text;
  v_pushed int := 0;
begin
  if public._program_rule('prio_enabled') <> 1 then return 0; end if;

  for r in
    select id, pickup_location, requested_category, requested_at, coalesce(notified_radius_m, 0) as done
      from public.rides
     where status = 'requested' and driver_id is null and requested_driver_id is null
       and requested_at > now() - interval '5 minutes'
  loop
    v_new := public._ride_visible_radius_m(extract(epoch from (now() - r.requested_at)));
    if v_new <= r.done then continue; end if;

    v_label := case r.requested_category
      when 'moto' then 'Moto' when 'tricycle' then 'Tricycle' when 'essentiel' then 'Essentiel'
      when 'confort' then 'Confort' when 'premium' then 'VIP'
      else initcap(r.requested_category::text) end;

    for drv in
      select d.profile_id
        from public.drivers d
        join public.vehicles v on v.id = d.current_vehicle_id
       where d.is_online = true and d.status = 'active'
         and v.category = r.requested_category
         and not exists (select 1 from public.ride_driver_exclusions x where x.ride_id = r.id and x.driver_id = d.id)
         and d.current_location is not null
         and st_dwithin(d.current_location, r.pickup_location, v_new)
         and not st_dwithin(d.current_location, r.pickup_location, r.done)
    loop
      perform public._push_notify(
        drv.profile_id,
        '🚗 Nouvelle course ' || v_label,
        'Un client attend. Ouvrez TamCar pour accepter.',
        '/',
        'new-ride:' || r.id::text,
        true
      );
      v_pushed := v_pushed + 1;
    end loop;

    update public.rides set notified_radius_m = v_new where id = r.id;
  end loop;
  return v_pushed;
end;
$function$;


-- Alerte des réservations : idem
CREATE OR REPLACE FUNCTION public._notify_scheduled_booking(p_ride_id uuid, p_force boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.rides; drv record; v_label text; v_hhmm text; v_from text;
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
    when 'moto' then 'Moto' when 'tricycle' then 'Tricycle'
    when 'essentiel' then 'Essentiel' when 'confort' then 'Confort'
    when 'premium' then 'VIP' else initcap(r.requested_category::text) end;
  v_hhmm := to_char(r.scheduled_at at time zone 'Africa/Porto-Novo', 'HH24:MI');
  v_from := left(coalesce(r.pickup_address, 'un point proche'), 45);

  for drv in
    select d.profile_id
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.is_online = true and d.status = 'active'
      and not exists (select 1 from public.ride_driver_exclusions x where x.ride_id = r.id and x.driver_id = d.id)
      and (v.category = r.requested_category
           or (v.category = 'confort' and r.requested_category = 'essentiel'))
      and (d.current_location is null
           or st_dwithin(d.current_location, r.pickup_location, 12000))
  loop
    perform public._push_notify(
      drv.profile_id,
      'Réservation ' || v_label || ' à ' || v_hhmm,
      'Départ de ' || v_from || '. Engage-toi avant qu''un autre chauffeur ne la prenne.',
      '/', 'booking-new:' || p_ride_id::text, true);
  end loop;

  update public.rides
    set booking_reminders_sent = case
          when 120 = any (booking_reminders_sent) then booking_reminders_sent
          else booking_reminders_sent || 120::smallint end,
        driver_search_started_at = now(),
        driver_search_prompted_at = null
    where id = p_ride_id;
end;
$function$;


-- Liste des courses proposées au chauffeur : idem
CREATE OR REPLACE FUNCTION public.pending_rides_for_driver(radius_km double precision DEFAULT 10.0)
 RETURNS TABLE(id uuid, pickup_address text, dropoff_address text, pickup_lat double precision, pickup_lng double precision, dropoff_lat double precision, dropoff_lng double precision, distance_from_driver_m double precision, distance_km numeric, duration_min integer, price_total_fcfa integer, driver_share_fcfa integer, requested_at timestamp with time zone, requested_category vehicle_category, downgrade_accepted_at timestamp with time zone, is_below_driver_category boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_drv_id uuid;
  v_drv_loc geography;
  v_drv_category vehicle_category;
  v_active_dropoff geography;
  v_active_count int;
  v_search_origin geography;
  v_effective_radius double precision;
begin
  -- Piggy-back : libère les scheduled dues
  perform public._release_due_scheduled_rides();

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

  select count(*)::int into v_active_count
   from public.rides r
   where r.driver_id = v_drv_id
     and r.status in ('matched', 'arrived', 'in_progress');
  if v_active_count >= 2 then return; end if;

  if v_active_count = 1 then
    select r.dropoff_location into v_active_dropoff
     from public.rides r
     where r.driver_id = v_drv_id
       and r.status in ('matched', 'arrived', 'in_progress')
     order by r.matched_at asc limit 1;
  end if;

  if v_active_dropoff is not null then
    v_search_origin := v_active_dropoff;
    v_effective_radius := 3.0;
  else
    v_search_origin := v_drv_loc;
    v_effective_radius := radius_km;
  end if;

  return query
  select
    r.id, r.pickup_address, r.dropoff_address,
    st_y(r.pickup_location::geometry) as pickup_lat,
    st_x(r.pickup_location::geometry) as pickup_lng,
    st_y(r.dropoff_location::geometry) as dropoff_lat,
    st_x(r.dropoff_location::geometry) as dropoff_lng,
    st_distance(r.pickup_location, v_search_origin) as distance_from_driver_m,
    r.distance_km, r.duration_min,
    r.price_total_fcfa, r.driver_share_fcfa,
    r.requested_at,
    r.requested_category, r.downgrade_accepted_at,
    (
      (v_drv_category = 'confort' and r.requested_category = 'essentiel')
      or (v_drv_category = 'premium' and r.requested_category = 'confort')
    ) as is_below_driver_category
  from public.rides r
  where r.status = 'requested'
    and r.driver_id is null
    and r.requested_driver_id is null
    and not exists (select 1 from public.ride_driver_exclusions x where x.ride_id = r.id and x.driver_id = v_drv_id)
    -- Priorité de proximité : le rayon visible grandit avec l'ancienneté de la demande.
    and st_dwithin(
          r.pickup_location, v_search_origin,
          case
            when v_active_dropoff is not null then v_effective_radius * 1000
            when public._program_rule('prio_enabled') = 1
              then public._ride_visible_radius_m(extract(epoch from (now() - r.requested_at)))
            else v_effective_radius * 1000
          end)
    and (
      v_drv_category = r.requested_category
      -- Catégorie inférieure : seulement après 30 s sans preneur.
      or (
        r.requested_at <= now() - interval '30 seconds'
        and (
          (v_drv_category = 'confort' and r.requested_category = 'essentiel')
          or (v_drv_category = 'premium' and r.requested_category = 'confort')
        )
      )
    )
    -- Calendrier : la course (approche ~10 min + durée) ne doit pas toucher une location.
    and not public._my_rental_conflict(
      now(), now() + make_interval(mins => coalesce(r.duration_min, 15) + 10)
    )
  order by st_distance(r.pickup_location, v_search_origin) asc
  limit 20;
end;
$function$;


-- C. Départ anticipé : « Partir vers le client » dès H-30 --------------------------------------------------------------
-- Avant H-10 une réservation engagée reste « scheduled » : le chauffeur ne pouvait ni se mettre en route ni signaler son arrivée.
-- Dès 30 minutes avant l'heure, il peut passer la course en « matched » : tout se déroule alors comme une course ordinaire
-- (arrivé, client à bord, fin). Aucune pénalité n'est créée par ce passage : elles dépendent seulement de l'heure (H-10).
create or replace function public.driver_start_booking(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  v_drv uuid;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_drv from public.drivers where profile_id = auth.uid() and status = 'active' limit 1;
  if v_drv is null then raise exception 'Chauffeur non actif'; end if;

  select * into r from public.rides where id = p_ride_id for update;
  if r is null then raise exception 'Réservation introuvable'; end if;
  if r.status <> 'scheduled' or r.driver_id is distinct from v_drv or r.scheduled_at is null then
    raise exception 'Pas votre réservation';
  end if;
  if now() < r.scheduled_at - interval '30 minutes' then
    raise exception 'Vous pourrez partir vers le client 30 minutes avant l''heure de la réservation.';
  end if;

  update public.rides
     set status = 'matched', matched_at = now(), requested_at = now(), updated_at = now()
   where id = p_ride_id
   returning * into result;

  perform public._push_notify(
    result.client_id,
    'Votre chauffeur est en route',
    'Il se dirige vers vous pour votre course de ' || to_char(result.scheduled_at at time zone 'Africa/Porto-Novo', 'HH24:MI') || '.',
    '/ride/' || result.id::text,
    'booking-started:' || result.id::text,
    false
  );
  return result;
end;
$fn$;
revoke execute on function public.driver_start_booking(uuid) from public, anon;
grant execute on function public.driver_start_booking(uuid) to authenticated;

-- D. Désistement du chauffeur : la recherche repart TOUJOURS ------------------------------------------------------------
create or replace function public.cancel_ride_by_driver(ride_id uuid, p_reason text default null)
returns public.rides
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  result public.rides;
  v_driver public.drivers;
  v_late boolean;
  v_amount int := public._booking_penalty_amount();
  v_new_status ride_status;
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

  -- RÉSERVATION : le désistement ne termine pas la course, elle repart en recherche. Gratuit avant H-10 ; après, pénalité
  -- au chauffeur, intégralement reversée au client, et avertissement (strike).
  if r.scheduled_at is not null then
    v_new_status := case when now() < r.scheduled_at - interval '10 minutes' then 'scheduled' else 'requested' end;

    insert into public.ride_driver_exclusions (ride_id, driver_id, reason)
    values (r.id, r.driver_id, coalesce(nullif(trim(p_reason), ''), 'désistement'))
    on conflict do nothing;

    update public.rides
       set status = v_new_status,
           driver_id = null,
           vehicle_id = null,
           matched_at = null,
           arrived_at = null,
           driver_distance_at_match_m = null,
           driver_location_at_match = null,
           requested_at = case when v_new_status = 'requested' then now() else requested_at end,
           notified_radius_m = 0,
           booking_reminders_sent = array_remove(booking_reminders_sent, 120::smallint),
           driver_search_started_at = now(),
           driver_search_prompted_at = null,
           updated_at = now()
     where id = r.id
     returning * into result;

    if v_late then
      update public.drivers
         set cancellations_driver_fault_count = cancellations_driver_fault_count + 1
       where id = r.driver_id;
      perform public._apply_driver_strike(r.driver_id, r.id, 'Désistement tardif sur une réservation');
      perform public._booking_penalty(r.id, auth.uid(), 'tamcar_revenus', r.client_id, 'tamcar_credit', v_amount, v_amount);
    end if;

    if v_new_status = 'scheduled' then
      perform public._notify_scheduled_booking(r.id, true);
    else
      perform public._notify_matching_drivers(r.id);
    end if;

    perform public._push_notify(
      r.client_id,
      'Chauffeur indisponible',
      case when v_late and v_amount > 0
        then 'Votre chauffeur s''est désisté à la dernière minute : ' || v_amount || ' F ont été crédités sur votre TamCar Crédit. Nous cherchons un remplaçant.'
        else 'Votre chauffeur s''est désisté. Nous cherchons un remplaçant.' end,
      case when v_new_status = 'scheduled' then '/reservation/' else '/ride/' end || r.id::text,
      'booking-released:' || r.id::text,
      true
    );
    return result;
  end if;

  -- COURSE IMMÉDIATE : comportement inchangé (course terminée « annulée par le chauffeur », geste commercial plafonné)
  update public.rides
  set status = 'cancelled_by_driver',
      ended_at = now(),
      cancel_reason = 'driver_cancelled',
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
  perform public._grant_goodwill_credit(r.client_id, r.driver_id, ride_id);
  return result;
end;
$fn$;
grant execute on function public.cancel_ride_by_driver(uuid, text) to authenticated;

-- E. Désistement avant la bascule (réservation encore « scheduled ») ---------------------------------------------------------
create or replace function public.cancel_scheduled_by_driver(p_ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  v_drv_id uuid;
  result public.rides;
  v_late boolean;
  v_amount int := public._booking_penalty_amount();
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_drv_id from public.drivers where profile_id = auth.uid() limit 1;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Réservation introuvable'; end if;
  if r.status <> 'scheduled' or r.driver_id is distinct from v_drv_id then
    raise exception 'Pas votre réservation';
  end if;

  v_late := public._booking_is_late(r);

  insert into public.ride_driver_exclusions (ride_id, driver_id, reason)
  values (r.id, v_drv_id, 'désistement') on conflict do nothing;

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

  -- Le client lésé est indemnisé intégralement ; le chauffeur reçoit un avertissement comme pour tout désistement tardif
  if v_late then
    update public.drivers
       set cancellations_driver_fault_count = cancellations_driver_fault_count + 1
     where id = v_drv_id;
    perform public._apply_driver_strike(v_drv_id, p_ride_id, 'Désistement tardif sur une réservation');
    perform public._booking_penalty(p_ride_id, auth.uid(), 'tamcar_revenus', result.client_id, 'tamcar_credit', v_amount, v_amount);
  end if;

  perform public._notify_scheduled_booking(p_ride_id, true);
  perform public._push_notify(
    result.client_id,
    'Chauffeur indisponible',
    case when v_late and v_amount > 0
      then 'Votre chauffeur s''est désisté à la dernière minute : ' || v_amount || ' F ont été crédités sur votre TamCar Crédit. Nous cherchons un remplaçant.'
      else 'Votre chauffeur s''est désisté. Nous cherchons un remplaçant : vous êtes prévenu dans un instant.' end,
    '/reservation/' || result.id::text,
    'booking-released:' || result.id::text,
    true
  );
  return result;
end;
$fn$;
grant execute on function public.cancel_scheduled_by_driver(uuid) to authenticated;

-- F. Annulation du client avant la bascule ----------------------------------------------------------------------------------
create or replace function public.cancel_scheduled_ride(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  v_driver_profile uuid;
  v_late boolean;
  v_amount int := public._booking_penalty_amount();
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

  -- Moins de 10 min avant le départ, avec un chauffeur engagé : pénalité au débit du client, reversée en entier au chauffeur
  -- qui avait bloqué son créneau. Sans chauffeur engagé, rien n'est prélevé.
  if v_late and r.driver_id is not null and v_amount > 0 then
    select profile_id into v_driver_profile from public.drivers where id = r.driver_id;
    perform public._booking_penalty(p_ride_id, r.client_id, 'tamcar_credit', v_driver_profile, 'tamcar_revenus', v_amount, v_amount);
    perform public._push_notify(
      v_driver_profile, 'Réservation annulée',
      'Le client a annulé à moins de 10 minutes du départ : ' || v_amount || ' F ont été crédités sur votre solde.',
      '/', 'booking-cancelled:' || p_ride_id::text, true);
  elsif r.driver_id is not null then
    select profile_id into v_driver_profile from public.drivers where id = r.driver_id;
    perform public._push_notify(
      v_driver_profile, 'Réservation annulée',
      'Le client a annulé sa réservation (sans frais, plus de 10 minutes avant le départ).',
      '/', 'booking-cancelled:' || p_ride_id::text, true);
  end if;
end;
$fn$;
grant execute on function public.cancel_scheduled_ride(uuid) to authenticated;


-- G. Frais d'annulation affichés au client : gratuit avant H-10 pour une réservation
CREATE OR REPLACE FUNCTION public.cancellation_fee_preview(p_ride_id uuid, p_user_reason text DEFAULT NULL::text)
 RETURNS TABLE(fee_fcfa integer, reason_code text, driver_share_fcfa integer, platform_share_fcfa integer, driver_still_busy_elsewhere boolean, is_driver_fault boolean, driver_fault_evidence text, will_be_disputed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.rides;
  drv public.drivers;
  v_fee int := 0;
  v_reason text := 'free';
  v_busy boolean := false;
  v_secs int;
  v_dist int;
  v_fee_amt int := public._program_rule('cancel_fee_fcfa');
  v_radius int := public._program_rule('cancel_fee_radius_m');
  v_pen int := public._booking_penalty_amount();
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r.id is null or r.client_id <> auth.uid() then raise exception 'Ride not found'; end if;

  -- Chauffeur encore engagé sur une course antérieure : gratuit
  if r.driver_id is not null then
    v_busy := exists (
      select 1 from public.rides other
      where other.driver_id = r.driver_id and other.id <> r.id
        and other.status in ('matched', 'arrived', 'in_progress')
        and other.matched_at < r.matched_at);
    if v_busy then
      return query select 0, 'free_driver_busy', 0, 0, true, false, null::text, false;
      return;
    end if;
  end if;

  -- Réservation : avant H-10 l'annulation est gratuite même si le chauffeur est déjà en route ; à moins de 10 minutes du départ,
  -- la pénalité annoncée dans les rappels s'applique (reversée en entier au chauffeur).
  if r.scheduled_at is not null and r.status in ('matched', 'arrived') then
    if public._booking_is_late(r) then
      return query select v_pen, 'booking_late', v_pen, 0, false, false, null::text, false;
    else
      return query select 0, 'free_booking_early', 0, 0, false, false, null::text, false;
    end if;
    return;
  end if;

  case
    when r.status = 'requested' then
      v_reason := 'free_no_match';
    when r.status = 'matched' then
      v_secs := extract(epoch from (now() - r.matched_at))::int;
      if v_secs <= 30 then
        v_reason := 'free_within_30s';
      else
        select * into drv from public.drivers where id = r.driver_id;
        v_dist := case when drv.current_location is null or r.pickup_location is null then null
                       else st_distance(drv.current_location, r.pickup_location)::int end;
        if v_dist is not null and v_dist <= v_radius then
          v_fee := v_fee_amt; v_reason := 'driver_near';
        else
          v_reason := 'free_driver_far';
        end if;
      end if;
    when r.status = 'arrived' then
      v_fee := v_fee_amt; v_reason := 'driver_arrived';
    when r.status = 'in_progress' then
      v_fee := public.round_to_50((r.price_total_fcfa * 0.50)::int); v_reason := 'ride_started';
    else
      v_reason := 'not_cancellable';
  end case;

  return query select v_fee, v_reason, (v_fee / 2)::int, v_fee - (v_fee / 2)::int, false, false, null::text, false;
end;
$function$;


-- H. Rappels H-30 / H-20 / H-10 / H-5 : montant de la pénalité issu du réglage, invitation à partir tôt
CREATE OR REPLACE FUNCTION public._remind_upcoming_bookings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rec record; rung record; v_title text; v_tail text; v_amount int := public._booking_penalty_amount();
begin
  -- Recherche ouverte depuis plus d'une minute, toujours sans chauffeur :
  -- la décision revient au client (continuer / alternative / annuler).
  for rec in
    select r.id, r.client_id from public.rides r
    where r.status = 'scheduled' and r.driver_id is null
      and r.driver_search_started_at is not null
      and r.driver_search_prompted_at is null
      and r.driver_search_started_at <= now() - interval '1 minute'
      and r.scheduled_at > now()
    for update skip locked
  loop
    perform public._push_notify(
      rec.client_id, 'Aucun chauffeur pour l''instant',
      'Personne n''a encore pris votre réservation. Continuer la recherche, voir une alternative ou annuler ?',
      '/reservation/' || rec.id::text, 'booking-search:' || rec.id::text, true);
    update public.rides set driver_search_prompted_at = now() where id = rec.id;
  end loop;

  for rung in select * from (values (30, 20), (20, 10), (10, 5), (5, 0)) as t(hi, lo)
  loop
    v_title := 'Course dans ' || rung.hi || ' minutes';
    v_tail := case when rung.hi > 10
      then 'Mais vous pouvez également annuler gratuitement.'
      else 'Mais l''annulation vous coûtera ' || v_amount || ' FCFA.' end;

    for rec in
      select r.id, r.client_id, r.driver_id, r.status as ride_status, d.profile_id as driver_profile_id
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
            || replace(replace(v_tail, 'vous pouvez', 'tu peux'), 'vous coûtera', 'te coûtera')
            || case when rec.ride_status = 'scheduled' and rung.hi >= 20 then ' Tu peux déjà partir vers le client depuis l''écran de la course.' else '' end,
          '/ride/' || rec.id::text, 'booking-r' || rung.hi || 'd:' || rec.id::text, true);
      end if;

      perform public._push_notify(
        rec.client_id, v_title,
        'Votre course est dans ' || rung.hi || ' minutes. Préparez-vous ! ' || v_tail,
        '/ride/' || rec.id::text, 'booking-r' || rung.hi || 'c:' || rec.id::text, true);

      update public.rides
        set booking_reminders_sent = booking_reminders_sent || rung.hi::smallint
        where id = rec.id;
    end loop;
  end loop;
end;
$function$;

