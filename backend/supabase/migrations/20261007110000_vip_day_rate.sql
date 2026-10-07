-- ============================================================
-- Location VIP : forfait journée (2026-10-07)
--
-- Décisions de Terence (2026-10-07) :
--   • FORFAIT JOURNÉE FIXE : 45 000 F pour la plage 7 h - 22 h (heure du Bénin), quelle que soit la durée
--     d'utilisation dans la plage (pas de plafond horaire : 4 h ou 15 h, c'est 45 000 F) ;
--   • hors de la plage 7 h - 22 h : 3 500 F de l'heure ;
--   • repos d'un chauffeur seul : 2 h entre deux locations ;
--   • 150 km inclus par journée (inchangé).
--
-- Règle de calcul (_rental_breakdown) : on parcourt la location minute par minute en heure locale ;
--   - chaque JOUR CIVIL dont au moins une minute tombe dans la plage 7 h - 22 h compte pour un forfait ;
--   - les minutes hors plage sont facturées à l'heure (arrondie à l'heure supérieure sur l'ensemble) ;
--   - une location entièrement hors plage garde le minimum de min_hours heures.
--   Exemples : 7 h-22 h = 45 000 ; 9 h-13 h = 45 000 ; 6 h-23 h = 45 000 + 2 h x 3 500 = 52 000 ;
--   22 h-6 h = 8 h x 3 500 = 28 000. Une location continue sur plusieurs jours facture donc aussi les nuits
--   hors plage ; pour ne payer que les journées, réserver chaque journée séparément.
--
-- Repos du chauffeur : _rental_conflict_reason impose rest_min (120 min) entre la fin d'une location et le début
-- de la suivante pour le MÊME chauffeur (le véhicule seul garde un tampon de 30 min). Le chauffeur reste libre
-- de prendre des courses ordinaires pendant ce repos (il peut se mettre hors ligne).
--
-- Les 4 fonctions recréées en fin de fichier sont les définitions EXACTES de production avec une seule ligne
-- modifiée chacune (prix ou nombre de jours de kilométrage inclus).
-- ============================================================

alter table public.rental_rates
  add column if not exists day_fcfa       int check (day_fcfa is null or day_fcfa > 0),
  add column if not exists day_start_hour int not null default 7  check (day_start_hour between 0 and 23),
  add column if not exists day_end_hour   int not null default 22 check (day_end_hour between 1 and 24),
  add column if not exists rest_min       int not null default 120 check (rest_min >= 0);

comment on column public.rental_rates.day_fcfa is
  'Forfait d''une journée (plage day_start_hour - day_end_hour, heure du Bénin). Null = tarif horaire seul.';
comment on column public.rental_rates.hour_fcfa is
  'Tarif de l''heure : appliqué hors de la plage du forfait journée (ou partout si day_fcfa est nul).';
comment on column public.rental_rates.rest_min is
  'Repos minimal d''un chauffeur entre deux locations (minutes).';

update public.rental_rates
   set day_fcfa = 45000, day_start_hour = 7, day_end_hour = 22, rest_min = 120,
       hour_fcfa = 3500, max_hours = 120, updated_at = now()
 where category = 'premium';

-- ------------------------------------------------------------
-- Calcul du prix : jours de forfait + heures hors plage
-- ------------------------------------------------------------
create or replace function public._rental_breakdown(
  p_category vehicle_category,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns table (days int, off_hours int, price int)
language plpgsql stable security definer set search_path = public as $fn_bd$
declare
  rr public.rental_rates;
  v_total_min int;
  v_in_min int;
  v_days int;
  v_off_hours int;
  v_local_start timestamp;
begin
  select * into rr from public.rental_rates where category = p_category;
  if rr.category is null then raise exception 'Pas de tarif de location pour cette catégorie.'; end if;
  v_total_min := ceil(extract(epoch from (p_ends_at - p_starts_at)) / 60.0)::int;
  if v_total_min <= 0 then raise exception 'Durée invalide.'; end if;

  -- Tarif horaire seul (pas de forfait journée configuré).
  if rr.day_fcfa is null then
    v_off_hours := ceil(v_total_min / 60.0)::int;
    return query select 0, v_off_hours, rr.hour_fcfa * greatest(v_off_hours, rr.min_hours);
    return;
  end if;

  v_local_start := p_starts_at at time zone 'Africa/Porto-Novo';
  select count(*) filter (where s.in_win),
         count(distinct s.d) filter (where s.in_win)
    into v_in_min, v_days
    from (
      select m::date as d,
             (extract(hour from m) >= rr.day_start_hour and extract(hour from m) < rr.day_end_hour) as in_win
        from generate_series(v_local_start, v_local_start + make_interval(mins => v_total_min - 1), interval '1 minute') m
    ) s;

  v_off_hours := ceil((v_total_min - v_in_min) / 60.0)::int;
  if v_days = 0 then v_off_hours := greatest(v_off_hours, rr.min_hours); end if;

  return query select v_days, v_off_hours, v_days * rr.day_fcfa + v_off_hours * rr.hour_fcfa;
end;
$fn_bd$;

revoke all on function public._rental_breakdown(vehicle_category, timestamptz, timestamptz) from public, anon, authenticated;

-- Nombre de journées facturées (kilométrage inclus : 150 km par journée) ; au moins 1.
create or replace function public._rental_days(
  p_category vehicle_category,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns int
language plpgsql stable security definer set search_path = public as $fn_rd$
declare
  rr public.rental_rates;
  v int;
begin
  select * into rr from public.rental_rates where category = p_category;
  if rr.category is null or rr.day_fcfa is null then
    return greatest(1, ceil(extract(epoch from (p_ends_at - p_starts_at)) / 86400.0)::int);
  end if;
  select b.days into v from public._rental_breakdown(p_category, p_starts_at, p_ends_at) b;
  return greatest(1, coalesce(v, 1));
end;
$fn_rd$;

revoke all on function public._rental_days(vehicle_category, timestamptz, timestamptz) from public, anon, authenticated;

-- Devis pour l'écran de réservation (client connecté) : mêmes règles que la demande.
create or replace function public.rental_quote(
  p_starts_at timestamptz,
  p_hours int,
  p_category vehicle_category default 'premium'
)
returns table (days int, off_hours int, price_fcfa int)
language plpgsql stable security definer set search_path = public as $fn_q$
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_starts_at is null or p_hours is null or p_hours <= 0 or p_hours > 500 then
    raise exception 'Durée invalide.';
  end if;
  return query
    select b.days, b.off_hours, b.price
      from public._rental_breakdown(p_category, p_starts_at, p_starts_at + make_interval(hours => p_hours)) b;
end;
$fn_q$;

revoke all on function public.rental_quote(timestamptz, int, vehicle_category) from public, anon;
grant execute on function public.rental_quote(timestamptz, int, vehicle_category) to authenticated;

-- ------------------------------------------------------------
-- Raison d'un conflit : repos de 2 h pour le chauffeur, tampon de 30 min pour le véhicule
-- ------------------------------------------------------------
create or replace function public._rental_conflict_reason(
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_exclude uuid default null
)
returns text
language plpgsql stable security definer set search_path = public as $fn_rcr$
declare
  v_rest int;
begin
  -- Même chauffeur : chevauchement, ou moins de rest_min minutes entre deux locations.
  select rr.rest_min into v_rest
    from public.vehicle_rentals vr
    join public.rental_rates rr on rr.category = vr.category
   where vr.status in ('confirmed', 'in_progress')
     and (p_exclude is null or vr.id <> p_exclude)
     and vr.driver_id = p_driver_id
     and tstzrange(vr.starts_at - make_interval(mins => rr.rest_min),
                   vr.ends_at + make_interval(mins => rr.rest_min), '[)')
         && tstzrange(p_from, p_to, '[)')
   order by vr.starts_at
   limit 1;
  if found then
    return 'Ce chauffeur a déjà une location sur ce créneau ou doit se reposer ' || replace(regexp_replace((v_rest / 60.0)::numeric(4,1)::text, '\.0$', ''), '.', ',')
           || ' h entre deux locations.';
  end if;

  -- Même véhicule (autre chauffeur) : tampon de 30 min.
  if p_vehicle_id is not null and exists (
    select 1 from public.vehicle_rentals vr
     where vr.status in ('confirmed', 'in_progress')
       and (p_exclude is null or vr.id <> p_exclude)
       and vr.vehicle_id = p_vehicle_id
       and tstzrange(vr.starts_at - interval '30 minutes', vr.ends_at + interval '30 minutes', '[)')
           && tstzrange(p_from, p_to, '[)')
  ) then
    return 'Ce véhicule a déjà une location sur ce créneau.';
  end if;

  if exists (
    select 1 from public.rides r
     where r.driver_id = p_driver_id
       and r.status = 'scheduled'
       and r.scheduled_at is not null
       and r.scheduled_at >= p_from - interval '60 minutes'
       and r.scheduled_at <= p_to
  ) then
    return 'Ce chauffeur a une réservation de course sur ce créneau.';
  end if;

  return null;
end;
$fn_rcr$;

revoke all on function public._rental_conflict_reason(uuid, uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- Fonctions de production, une ligne modifiée chacune
-- ------------------------------------------------------------
-- request_vehicle_rental : prix = forfaits + heures hors plage
CREATE OR REPLACE FUNCTION public.request_vehicle_rental(p_starts_at timestamp with time zone, p_hours integer, p_pickup_address text, p_pickup_lat double precision, p_pickup_lng double precision, p_notes text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_category vehicle_category DEFAULT 'premium'::vehicle_category)
 RETURNS vehicle_rentals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rr public.rental_rates;
  v_row public.vehicle_rentals;
  v_name text := nullif(trim(coalesce(p_contact_name, '')), '');
  v_phone text := nullif(regexp_replace(coalesce(p_contact_phone, ''), '[^0-9+]', '', 'g'), '');
  v_open int;
  v_client text;
  adm record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into rr from public.rental_rates where category = p_category and active;
  if rr.category is null then
    raise exception 'La location n''est pas proposée pour cette catégorie.';
  end if;
  if p_hours is null or p_hours < rr.min_hours or p_hours > rr.max_hours then
    raise exception 'Durée : de % à % heures.', rr.min_hours, rr.max_hours;
  end if;
  if p_starts_at is null or p_starts_at < now() + make_interval(mins => rr.lead_minutes) then
    raise exception 'Réservez au moins % minutes à l''avance.', rr.lead_minutes;
  end if;
  if p_starts_at > now() + interval '90 days' then
    raise exception 'Réservation possible jusqu''à 90 jours à l''avance.';
  end if;
  if nullif(trim(coalesce(p_pickup_address, '')), '') is null then
    raise exception 'Adresse de prise en charge requise.';
  end if;
  if not public._is_within_service_zone(p_pickup_lat, p_pickup_lng) then
    raise exception 'Point de départ hors zone de service.';
  end if;
  if v_name is not null and v_phone is null then
    raise exception 'Le téléphone du contact sur place est requis.';
  end if;

  select count(*)::int into v_open
    from public.vehicle_rentals
   where client_id = auth.uid()
     and status in ('requested', 'confirmed')
     and ends_at > now();
  if v_open >= 3 then
    raise exception 'Vous avez déjà 3 locations en attente ou à venir.';
  end if;

  insert into public.vehicle_rentals (
    client_id, category, status, source,
    starts_at, ends_at, hours,
    pickup_address, pickup_location,
    contact_name, contact_phone, notes,
    price_fcfa, payment_mode,
    km_included_per_day, km_extra_fcfa, fuel_by_client,
    created_by
  ) values (
    auth.uid(), p_category, 'requested', 'client',
    p_starts_at, p_starts_at + make_interval(hours => p_hours), p_hours,
    trim(p_pickup_address),
    st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    v_name, v_phone, nullif(trim(coalesce(p_notes, '')), ''),
    (select b.price from public._rental_breakdown(p_category, p_starts_at, p_starts_at + make_interval(hours => p_hours)) b), 'prepaid',
    rr.km_included_per_day, rr.km_extra_fcfa, true,
    auth.uid()
  ) returning * into v_row;

  -- L'équipe est prévenue : une demande attend sa confirmation.
  select split_part(coalesce(full_name, 'Un client'), ' ', 1) into v_client
    from public.profiles where id = auth.uid();
  for adm in select id from public.profiles where role = 'admin' loop
    perform public._push_notify(
      adm.id,
      'Demande de location VIP',
      coalesce(v_client, 'Un client') || ' · '
        || to_char(p_starts_at at time zone 'Africa/Porto-Novo', 'DD/MM "à" HH24"h"MI')
        || ' · ' || p_hours || ' h · ' || v_row.price_fcfa || ' F',
      '/admin/locations',
      'rental-req:' || v_row.id::text,
      true
    );
  end loop;

  return v_row;
end;
$function$;

-- admin_create_vehicle_rental : prix suggéré = forfaits + heures hors plage
CREATE OR REPLACE FUNCTION public.admin_create_vehicle_rental(p_client_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_pickup_address text, p_pickup_lat double precision, p_pickup_lng double precision, p_driver_id uuid, p_price_fcfa integer DEFAULT NULL::integer, p_payment_mode text DEFAULT 'prepaid'::text, p_paid_fcfa integer DEFAULT 0, p_notes text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_category vehicle_category DEFAULT 'premium'::vehicle_category)
 RETURNS vehicle_rentals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rr public.rental_rates;
  v_vehicle uuid;
  v_hours int;
  v_price int;
  v_reason text;
  v_row public.vehicle_rentals;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;

  select * into rr from public.rental_rates where category = p_category;
  if rr.category is null then raise exception 'Pas de tarif de location pour cette catégorie.'; end if;
  if not exists (select 1 from public.profiles where id = p_client_id) then
    raise exception 'Client introuvable.';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'La fin doit être après le début.';
  end if;
  if p_starts_at < now() - interval '1 hour' then
    raise exception 'Le début est déjà passé.';
  end if;
  if nullif(trim(coalesce(p_pickup_address, '')), '') is null then
    raise exception 'Adresse de prise en charge requise.';
  end if;
  if p_payment_mode not in ('cash', 'prepaid') then
    raise exception 'Mode de paiement invalide.';
  end if;

  v_hours := ceil(extract(epoch from (p_ends_at - p_starts_at)) / 3600.0)::int;
  v_price := coalesce(p_price_fcfa, (select b.price from public._rental_breakdown(p_category, p_starts_at, p_ends_at) b));

  select d.current_vehicle_id into v_vehicle
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = p_driver_id and d.status = 'active' and v.category = p_category;
  if v_vehicle is null then
    raise exception 'Ce chauffeur n''a pas de véhicule de cette catégorie.';
  end if;

  perform pg_advisory_xact_lock(hashtext('rental:' || p_driver_id::text));
  v_reason := public._rental_conflict_reason(p_driver_id, v_vehicle, p_starts_at, p_ends_at, null);
  if v_reason is not null then raise exception '%', v_reason; end if;

  insert into public.vehicle_rentals (
    client_id, category, status, source,
    starts_at, ends_at, hours,
    pickup_address, pickup_location,
    contact_name, contact_phone, notes,
    driver_id, vehicle_id,
    price_fcfa, payment_mode, paid_fcfa,
    km_included_per_day, km_extra_fcfa, fuel_by_client,
    created_by, confirmed_at
  ) values (
    p_client_id, p_category, 'confirmed', 'team',
    p_starts_at, p_ends_at, v_hours,
    trim(p_pickup_address),
    st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    nullif(trim(coalesce(p_contact_name, '')), ''),
    nullif(regexp_replace(coalesce(p_contact_phone, ''), '[^0-9+]', '', 'g'), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_driver_id, v_vehicle,
    v_price, p_payment_mode, greatest(coalesce(p_paid_fcfa, 0), 0),
    rr.km_included_per_day, rr.km_extra_fcfa, true,
    auth.uid(), now()
  ) returning * into v_row;

  perform public._notify_rental_confirmed(v_row.id);
  return v_row;
end;
$function$;

-- driver_complete_vehicle_rental : km inclus = 150 km par journée facturée
CREATE OR REPLACE FUNCTION public.driver_complete_vehicle_rental(p_id uuid, p_odometer_end integer, p_photo_path text)
 RETURNS vehicle_rentals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.vehicle_rentals;
  v_drv uuid;
  v_ride uuid;
  v_used int;
  v_extra_km int := 0;
  v_days int;
  v_client text;
  adm record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_drv from public.drivers where profile_id = auth.uid() limit 1;

  select * into r from public.vehicle_rentals where id = p_id for update;
  if r.id is null or r.driver_id is distinct from v_drv then raise exception 'Ce n''est pas ta location.'; end if;
  if r.status <> 'in_progress' then raise exception 'Cette location n''est pas en cours.'; end if;
  if p_odometer_end is null or p_odometer_end < 0 then
    raise exception 'Indique le kilométrage du compteur.';
  end if;
  if r.odometer_start is not null and p_odometer_end < r.odometer_start then
    raise exception 'Le kilométrage de fin ne peut pas être inférieur à celui du départ.';
  end if;
  if p_photo_path is null or split_part(p_photo_path, '/', 1) <> p_id::text then
    raise exception 'La photo du compteur est obligatoire.';
  end if;

  if r.odometer_start is not null then
    v_used := p_odometer_end - r.odometer_start;
    v_days := public._rental_days(r.category, r.starts_at, r.ends_at);
    v_extra_km := greatest(0, v_used - r.km_included_per_day * v_days);
  end if;

  v_ride := public._create_rental_ride(r.id, r.price_fcfa, 'Location VIP · ' || r.hours || ' h');

  update public.vehicle_rentals
     set status = 'completed',
         completed_at = now(),
         ride_id = v_ride,
         odometer_end = p_odometer_end,
         odometer_end_photo = p_photo_path,
         km_used = v_used,
         extra_km = v_extra_km,
         extra_fcfa = v_extra_km * km_extra_fcfa,
         -- Dans le forfait : rien à valider. Au-delà : l'équipe contrôle les photos puis encaisse.
         km_status = case when v_extra_km > 0 then 'pending' else 'validated' end,
         km_validated_at = case when v_extra_km > 0 then null else now() end,
         updated_at = now()
   where id = p_id
   returning * into r;

  if v_extra_km > 0 then
    select split_part(coalesce(full_name, 'Client'), ' ', 1) into v_client
      from public.profiles where id = r.client_id;
    for adm in select id from public.profiles where role = 'admin' loop
      perform public._push_notify(
        adm.id,
        'Location VIP : kilomètres à valider',
        coalesce(v_client, 'Client') || ' · ' || v_extra_km || ' km au-delà du forfait ('
          || (v_extra_km * r.km_extra_fcfa) || ' F). Contrôlez les photos du compteur.',
        '/admin/locations',
        'rental-km:' || r.id::text,
        true
      );
    end loop;
  end if;

  return r;
end;
$function$;

-- admin_validate_rental_km : idem
CREATE OR REPLACE FUNCTION public.admin_validate_rental_km(p_id uuid, p_odometer_start integer, p_odometer_end integer)
 RETURNS vehicle_rentals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.vehicle_rentals;
  v_used int;
  v_days int;
  v_extra_km int;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;
  if p_odometer_start is null or p_odometer_end is null or p_odometer_start < 0 or p_odometer_end < p_odometer_start then
    raise exception 'Kilométrages invalides (la fin doit être supérieure ou égale au départ).';
  end if;

  select * into r from public.vehicle_rentals where id = p_id for update;
  if r.id is null then raise exception 'Location introuvable.'; end if;
  if r.status <> 'completed' then raise exception 'La location n''est pas terminée.'; end if;
  if r.extra_settled_at is not null then
    raise exception 'Le supplément est déjà encaissé : modification impossible.';
  end if;

  v_used := p_odometer_end - p_odometer_start;
  v_days := public._rental_days(r.category, r.starts_at, r.ends_at);
  v_extra_km := greatest(0, v_used - r.km_included_per_day * v_days);

  update public.vehicle_rentals
     set odometer_start = p_odometer_start,
         odometer_end = p_odometer_end,
         km_used = v_used,
         extra_km = v_extra_km,
         extra_fcfa = v_extra_km * km_extra_fcfa,
         km_status = 'validated',
         km_validated_at = now(),
         km_validated_by = auth.uid(),
         updated_at = now()
   where id = p_id
   returning * into r;

  if r.extra_fcfa > 0 then
    perform public._push_notify(
      r.client_id,
      'Supplément kilométrique',
      r.extra_km || ' km au-delà du forfait : ' || r.extra_fcfa || ' F à régler à TamCar.',
      '/reservations',
      'rental-extra:' || r.id::text,
      true
    );
  end if;
  return r;
end;
$function$;
