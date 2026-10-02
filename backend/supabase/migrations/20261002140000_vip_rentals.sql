-- ============================================================
-- Locations VIP avec chauffeur (« mise à disposition ») + calendrier de
-- disponibilité des véhicules (2026-10-02)
--
-- Décisions Terence :
--   • VIP sous contrat d'abord : le véhicule est loué avec son chauffeur
--     (3 500 F/h, minimum 4 h) ; carburant à la charge du client ;
--     150 km/jour inclus.
--   • L'équipe TamCar peut créer une location ; le client peut aussi
--     la demander depuis l'application (l'équipe la confirme et affecte le
--     chauffeur).
--   • Pendant une location, et 45 min avant, le véhicule ne reçoit plus de
--     demandes ; avant ce créneau il ne voit que les courses qui se
--     terminent à temps.
--   • La location figure dans les « courses à venir » du client et du chauffeur.
--
-- Principe : la location vit dans sa propre table (aucun risque pour le flux
-- des courses). À la fin de la location, UNE course « terminée » est créée avec
-- le prix de la location : c'est elle qui déclenche le partage 40/10/30/20, le
-- crédit des portefeuilles, la jauge de volume du chauffeur, l'historique et la
-- note du client — la comptabilité existante, sans la dupliquer.
--
-- Ce fichier REMPLACE aussi (versions complètes) : pending_rides_for_driver,
-- accept_ride, pending_scheduled_rides_for_driver, accept_scheduled_ride et
-- driver_go_online, pour y ajouter le blocage. Les règles de la cascade de
-- catégories (20261002130000) y sont conservées.
--
-- Valeurs par défaut de rental_rates (tarif horaire, km en plus, délai de
-- réservation) : HYPOTHÈSES de départ, modifiables sans code (update).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tarifs de location par catégorie
-- ------------------------------------------------------------
create table if not exists public.rental_rates (
  category            vehicle_category primary key,
  hour_fcfa           int  not null check (hour_fcfa > 0),
  min_hours           int  not null default 4  check (min_hours > 0),
  max_hours           int  not null default 12 check (max_hours >= min_hours),
  km_included_per_day int  not null default 150,
  km_extra_fcfa       int  not null default 200,
  lead_minutes        int  not null default 120,  -- délai minimal avant le début (client)
  block_before_min    int  not null default 45,   -- le véhicule ne reçoit plus de demandes avant le début
  late_cancel_hours   int  not null default 12,   -- annulation « tardive » sous ce délai
  active              boolean not null default true,
  updated_at          timestamptz not null default now()
);

insert into public.rental_rates (category, hour_fcfa)
values ('premium', 3500)
on conflict (category) do nothing;

alter table public.rental_rates enable row level security;
drop policy if exists rental_rates_read on public.rental_rates;
create policy rental_rates_read on public.rental_rates for select to authenticated using (true);

-- ------------------------------------------------------------
-- 2. Locations
-- ------------------------------------------------------------
create table if not exists public.vehicle_rentals (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.profiles(id) on delete restrict,
  category             vehicle_category not null default 'premium',
  status               text not null default 'requested'
                         check (status in ('requested', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  source               text not null default 'client' check (source in ('client', 'team')),

  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  hours                int not null check (hours > 0),

  pickup_address       text not null,
  pickup_location      geography(point, 4326) not null,
  contact_name         text,
  contact_phone        text,
  notes                text,

  driver_id            uuid references public.drivers(id) on delete set null,
  vehicle_id           uuid references public.vehicles(id) on delete set null,

  price_fcfa           int not null check (price_fcfa >= 0),
  -- 'prepaid' (défaut) : le client règle TamCar (virement, Mobile Money) — TamCar
  -- détient l'argent et crédite le chauffeur de sa part. 'cash' : le client règle
  -- le chauffeur, qui doit ensuite reverser la part TamCar (60 % : elle est
  -- prélevée sur son portefeuille — sur une location de 35 000 F, 21 000 F de dette).
  payment_mode         text not null default 'prepaid' check (payment_mode in ('cash', 'prepaid')),
  paid_fcfa            int not null default 0 check (paid_fcfa >= 0),

  km_included_per_day  int not null default 150,
  km_extra_fcfa        int not null default 200,
  fuel_by_client       boolean not null default true,

  odometer_start       int,
  odometer_end         int,
  km_used              int,
  extra_km             int,
  extra_fcfa           int,   -- à facturer par l'équipe (non inclus dans le prix crédité)

  ride_id              uuid references public.rides(id) on delete set null,
  late_cancel          boolean not null default false,
  cancel_reason        text,
  cancelled_by         text,
  reminders_sent       smallint[] not null default '{}',

  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  confirmed_at         timestamptz,
  started_at           timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  updated_at           timestamptz not null default now(),

  constraint vehicle_rentals_ends_after_start check (ends_at > starts_at)
);

create index if not exists vehicle_rentals_driver_idx
  on public.vehicle_rentals (driver_id, status, starts_at);
create index if not exists vehicle_rentals_client_idx
  on public.vehicle_rentals (client_id, starts_at desc);
create index if not exists vehicle_rentals_status_idx
  on public.vehicle_rentals (status, starts_at);

alter table public.vehicle_rentals enable row level security;

-- Lecture seule : client (ses locations), chauffeur (les siennes), admin (toutes).
-- Aucune politique d'écriture : tout passe par les fonctions ci-dessous.
drop policy if exists vehicle_rentals_client_read on public.vehicle_rentals;
create policy vehicle_rentals_client_read on public.vehicle_rentals for select
  using (client_id = auth.uid());

drop policy if exists vehicle_rentals_driver_read on public.vehicle_rentals;
create policy vehicle_rentals_driver_read on public.vehicle_rentals for select
  using (driver_id in (select d.id from public.drivers d where d.profile_id = auth.uid()));

drop policy if exists vehicle_rentals_admin_read on public.vehicle_rentals;
create policy vehicle_rentals_admin_read on public.vehicle_rentals for select
  using (public.is_admin());

-- ------------------------------------------------------------
-- 3. Aides de calendrier
-- ------------------------------------------------------------

-- Le chauffeur connecté a-t-il une location qui chevauche [p_from, p_to] ?
-- La fenêtre de blocage d'une location commence block_before_min avant son début.
-- Sans paramètre « chauffeur » : elle ne répond que pour l'appelant (pas de
-- consultation du planning d'un autre chauffeur).
create or replace function public._my_rental_conflict(p_from timestamptz, p_to timestamptz)
returns boolean
language sql stable security definer set search_path = public as $fn_mrc$
  select exists (
    select 1
      from public.vehicle_rentals vr
      join public.drivers d on d.id = vr.driver_id
      join public.rental_rates rr on rr.category = vr.category
     where d.profile_id = auth.uid()
       and vr.status in ('confirmed', 'in_progress')
       and tstzrange(vr.starts_at - make_interval(mins => rr.block_before_min), vr.ends_at, '[)')
           && tstzrange(p_from, p_to, '[)')
  );
$fn_mrc$;

revoke all on function public._my_rental_conflict(timestamptz, timestamptz) from public, anon;
grant execute on function public._my_rental_conflict(timestamptz, timestamptz) to authenticated;

-- Raison d'un conflit pour une affectation (chauffeur + véhicule + créneau), ou null.
create or replace function public._rental_conflict_reason(
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_exclude uuid default null
)
returns text
language plpgsql stable security definer set search_path = public as $fn_rcr$
begin
  if exists (
    select 1 from public.vehicle_rentals vr
     where vr.status in ('confirmed', 'in_progress')
       and (p_exclude is null or vr.id <> p_exclude)
       and (vr.driver_id = p_driver_id
            or (p_vehicle_id is not null and vr.vehicle_id = p_vehicle_id))
       and tstzrange(vr.starts_at - interval '30 minutes', vr.ends_at + interval '30 minutes', '[)')
           && tstzrange(p_from, p_to, '[)')
  ) then
    return 'Ce chauffeur ou ce véhicule a déjà une location sur ce créneau.';
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
-- 4. Client : demander, voir, annuler
-- ------------------------------------------------------------
create or replace function public.request_vehicle_rental(
  p_starts_at timestamptz,
  p_hours int,
  p_pickup_address text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_notes text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_category vehicle_category default 'premium'
)
returns public.vehicle_rentals
language plpgsql security definer set search_path = public as $fn_req$
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
    rr.hour_fcfa * p_hours, 'prepaid',
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
$fn_req$;

revoke all on function public.request_vehicle_rental(timestamptz, int, text, double precision, double precision, text, text, text, vehicle_category)
  from public, anon;
grant execute on function public.request_vehicle_rental(timestamptz, int, text, double precision, double precision, text, text, text, vehicle_category)
  to authenticated;

create or replace function public.my_vehicle_rentals(p_scope text default 'all')
returns table (
  id uuid,
  status text,
  source text,
  category vehicle_category,
  starts_at timestamptz,
  ends_at timestamptz,
  hours int,
  pickup_address text,
  notes text,
  contact_name text,
  contact_phone text,
  price_fcfa int,
  payment_mode text,
  paid_fcfa int,
  km_included_per_day int,
  km_extra_fcfa int,
  fuel_by_client boolean,
  driver_full_name text,
  driver_phone text,
  driver_avatar_url text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_color text,
  vehicle_plate text,
  ride_id uuid,
  late_cancel boolean,
  cancel_reason text,
  is_upcoming boolean
)
language sql stable security definer set search_path = public as $fn_my$
  select * from (
    select
      vr.id, vr.status, vr.source, vr.category,
      vr.starts_at, vr.ends_at, vr.hours,
      vr.pickup_address, vr.notes, vr.contact_name, vr.contact_phone,
      vr.price_fcfa, vr.payment_mode, vr.paid_fcfa,
      vr.km_included_per_day, vr.km_extra_fcfa, vr.fuel_by_client,
      p.full_name as driver_full_name,
      -- Le numéro n'est fourni que tant que la location est active.
      case when vr.status in ('confirmed', 'in_progress') then p.phone end as driver_phone,
      p.avatar_url as driver_avatar_url,
      v.brand as vehicle_brand, v.model as vehicle_model,
      v.color as vehicle_color, v.plate_number as vehicle_plate,
      vr.ride_id, vr.late_cancel, vr.cancel_reason,
      (vr.status in ('requested', 'confirmed', 'in_progress') and vr.ends_at > now()) as is_upcoming
    from public.vehicle_rentals vr
    left join public.drivers d on d.id = vr.driver_id
    left join public.profiles p on p.id = d.profile_id
    left join public.vehicles v on v.id = vr.vehicle_id
    where vr.client_id = auth.uid()
  ) t
  where p_scope = 'all' or t.is_upcoming
  order by t.is_upcoming desc,
           case when t.is_upcoming then extract(epoch from t.starts_at) else -extract(epoch from t.starts_at) end asc
  limit 60;
$fn_my$;

revoke all on function public.my_vehicle_rentals(text) from public, anon;
grant execute on function public.my_vehicle_rentals(text) to authenticated;

create or replace function public.cancel_vehicle_rental(p_id uuid)
returns public.vehicle_rentals
language plpgsql security definer set search_path = public as $fn_cancel$
declare
  r public.vehicle_rentals;
  rr public.rental_rates;
  v_late boolean;
  v_driver_profile uuid;
  v_client text;
  adm record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.vehicle_rentals where id = p_id for update;
  if r.id is null or r.client_id <> auth.uid() then raise exception 'Location introuvable.'; end if;
  if r.status not in ('requested', 'confirmed') then
    raise exception 'Cette location ne peut plus être annulée.';
  end if;
  if r.starts_at <= now() then
    raise exception 'La location a déjà commencé : contactez TamCar.';
  end if;

  select * into rr from public.rental_rates where category = r.category;
  v_late := r.status = 'confirmed'
        and r.starts_at < now() + make_interval(hours => coalesce(rr.late_cancel_hours, 12));

  update public.vehicle_rentals
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = 'client',
         cancel_reason = case when v_late then 'client_late' else 'client' end,
         late_cancel = v_late,
         updated_at = now()
   where id = p_id
   returning * into r;

  select split_part(coalesce(full_name, 'Un client'), ' ', 1) into v_client
    from public.profiles where id = r.client_id;

  if r.driver_id is not null then
    select profile_id into v_driver_profile from public.drivers where id = r.driver_id;
    if v_driver_profile is not null then
      perform public._push_notify(
        v_driver_profile,
        'Location VIP annulée',
        coalesce(v_client, 'Le client') || ' a annulé la location du '
          || to_char(r.starts_at at time zone 'Africa/Porto-Novo', 'DD/MM "à" HH24"h"MI') || '.',
        '/reservations',
        'rental-cancel:' || r.id::text,
        true
      );
    end if;
  end if;

  for adm in select id from public.profiles where role = 'admin' loop
    perform public._push_notify(
      adm.id,
      case when v_late then 'Location VIP annulée (tardive)' else 'Location VIP annulée' end,
      coalesce(v_client, 'Un client') || ' · '
        || to_char(r.starts_at at time zone 'Africa/Porto-Novo', 'DD/MM "à" HH24"h"MI'),
      '/admin/locations',
      'rental-cancel-adm:' || r.id::text,
      false
    );
  end loop;

  return r;
end;
$fn_cancel$;

revoke all on function public.cancel_vehicle_rental(uuid) from public, anon;
grant execute on function public.cancel_vehicle_rental(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. Équipe TamCar
-- ------------------------------------------------------------
create or replace function public.admin_vehicle_rentals(p_scope text default 'open')
returns table (
  id uuid,
  status text,
  source text,
  category vehicle_category,
  starts_at timestamptz,
  ends_at timestamptz,
  hours int,
  pickup_address text,
  notes text,
  contact_name text,
  contact_phone text,
  client_id uuid,
  client_full_name text,
  client_phone text,
  driver_id uuid,
  driver_full_name text,
  driver_phone text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_plate text,
  price_fcfa int,
  payment_mode text,
  paid_fcfa int,
  km_used int,
  extra_km int,
  extra_fcfa int,
  late_cancel boolean,
  cancel_reason text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $fn_alist$
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;

  return query
  select
    vr.id, vr.status, vr.source, vr.category,
    vr.starts_at, vr.ends_at, vr.hours,
    vr.pickup_address, vr.notes, vr.contact_name, vr.contact_phone,
    vr.client_id, cp.full_name, cp.phone,
    vr.driver_id, dp.full_name, dp.phone,
    v.brand, v.model, v.plate_number,
    vr.price_fcfa, vr.payment_mode, vr.paid_fcfa,
    vr.km_used, vr.extra_km, vr.extra_fcfa,
    vr.late_cancel, vr.cancel_reason, vr.created_at
  from public.vehicle_rentals vr
  join public.profiles cp on cp.id = vr.client_id
  left join public.drivers d on d.id = vr.driver_id
  left join public.profiles dp on dp.id = d.profile_id
  left join public.vehicles v on v.id = vr.vehicle_id
  where case p_scope
          when 'open' then vr.status in ('requested', 'confirmed', 'in_progress')
          when 'past' then vr.status in ('completed', 'cancelled')
          else true
        end
  order by
    case when vr.status in ('requested', 'confirmed', 'in_progress') then 0 else 1 end,
    case when vr.status in ('requested', 'confirmed', 'in_progress') then vr.starts_at end asc,
    vr.starts_at desc
  limit 200;
end;
$fn_alist$;

revoke all on function public.admin_vehicle_rentals(text) from public, anon;
grant execute on function public.admin_vehicle_rentals(text) to authenticated;

create or replace function public.admin_find_client(p_query text)
returns table (id uuid, full_name text, phone text)
language plpgsql stable security definer set search_path = public as $fn_afc$
declare
  v_digits text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
  v_text text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;
  if v_text is null or length(v_text) < 3 then return; end if;

  return query
  select p.id, p.full_name, p.phone
    from public.profiles p
   where (length(v_digits) >= 6
          and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') like '%' || v_digits)
      or (length(v_digits) < 6 and p.full_name ilike '%' || v_text || '%')
   order by p.full_name
   limit 10;
end;
$fn_afc$;

revoke all on function public.admin_find_client(text) from public, anon;
grant execute on function public.admin_find_client(text) to authenticated;

-- Chauffeurs de la catégorie, avec la raison de leur indisponibilité sur le créneau (null = libre).
create or replace function public.admin_available_rental_drivers(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_category vehicle_category default 'premium',
  p_exclude uuid default null
)
returns table (
  driver_id uuid,
  full_name text,
  phone text,
  vehicle_id uuid,
  vehicle_brand text,
  vehicle_model text,
  vehicle_plate text,
  conflict text
)
language plpgsql stable security definer set search_path = public as $fn_avail$
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;

  return query
  select
    d.id, p.full_name, p.phone,
    v.id, v.brand, v.model, v.plate_number,
    public._rental_conflict_reason(d.id, v.id, p_starts_at, p_ends_at, p_exclude)
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  join public.vehicles v on v.id = d.current_vehicle_id
  where d.status = 'active'
    and v.category = p_category
  order by (public._rental_conflict_reason(d.id, v.id, p_starts_at, p_ends_at, p_exclude) is not null),
           p.full_name;
end;
$fn_avail$;

revoke all on function public.admin_available_rental_drivers(timestamptz, timestamptz, vehicle_category, uuid) from public, anon;
grant execute on function public.admin_available_rental_drivers(timestamptz, timestamptz, vehicle_category, uuid) to authenticated;

-- Notifie client + chauffeur d'une location confirmée.
create or replace function public._notify_rental_confirmed(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn_nrc$
declare
  r public.vehicle_rentals;
  v_driver_profile uuid;
  v_driver_name text;
  v_client text;
  v_when text;
begin
  select * into r from public.vehicle_rentals where id = p_id;
  if r.id is null then return; end if;

  v_when := to_char(r.starts_at at time zone 'Africa/Porto-Novo', 'DD/MM "à" HH24"h"MI');
  select d.profile_id, split_part(coalesce(p.full_name, 'Votre chauffeur'), ' ', 1)
    into v_driver_profile, v_driver_name
    from public.drivers d join public.profiles p on p.id = d.profile_id
   where d.id = r.driver_id;
  select split_part(coalesce(full_name, 'Le client'), ' ', 1) into v_client
    from public.profiles where id = r.client_id;

  perform public._push_notify(
    r.client_id,
    'Location VIP confirmée',
    'Le ' || v_when || ' · ' || r.hours || ' h · ' || coalesce(v_driver_name, 'votre chauffeur') || ' sera votre chauffeur.',
    '/reservations',
    'rental-ok:' || r.id::text,
    true
  );

  if v_driver_profile is not null then
    perform public._push_notify(
      v_driver_profile,
      'Nouvelle location VIP',
      'Le ' || v_when || ' · ' || r.hours || ' h · ' || coalesce(v_client, 'Client') || ' · ' || left(r.pickup_address, 50),
      '/reservations',
      'rental-new:' || r.id::text,
      true
    );
  end if;
end;
$fn_nrc$;

revoke all on function public._notify_rental_confirmed(uuid) from public, anon, authenticated;

create or replace function public.admin_create_vehicle_rental(
  p_client_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_pickup_address text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_driver_id uuid,
  p_price_fcfa int default null,
  p_payment_mode text default 'prepaid',
  p_paid_fcfa int default 0,
  p_notes text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_category vehicle_category default 'premium'
)
returns public.vehicle_rentals
language plpgsql security definer set search_path = public as $fn_acreate$
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
  v_price := coalesce(p_price_fcfa, rr.hour_fcfa * greatest(v_hours, rr.min_hours));

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
$fn_acreate$;

revoke all on function public.admin_create_vehicle_rental(uuid, timestamptz, timestamptz, text, double precision, double precision, uuid, int, text, int, text, text, text, vehicle_category)
  from public, anon;
grant execute on function public.admin_create_vehicle_rental(uuid, timestamptz, timestamptz, text, double precision, double precision, uuid, int, text, int, text, text, text, vehicle_category)
  to authenticated;

create or replace function public.admin_confirm_vehicle_rental(
  p_id uuid,
  p_driver_id uuid,
  p_price_fcfa int default null,
  p_payment_mode text default null
)
returns public.vehicle_rentals
language plpgsql security definer set search_path = public as $fn_aconf$
declare
  r public.vehicle_rentals;
  v_vehicle uuid;
  v_reason text;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;
  if p_payment_mode is not null and p_payment_mode not in ('cash', 'prepaid') then
    raise exception 'Mode de paiement invalide.';
  end if;

  select * into r from public.vehicle_rentals where id = p_id for update;
  if r.id is null then raise exception 'Location introuvable.'; end if;
  if r.status <> 'requested' then raise exception 'Cette demande n''est plus en attente.'; end if;
  if r.starts_at <= now() then raise exception 'Le début est déjà passé.'; end if;

  select d.current_vehicle_id into v_vehicle
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = p_driver_id and d.status = 'active' and v.category = r.category;
  if v_vehicle is null then
    raise exception 'Ce chauffeur n''a pas de véhicule de cette catégorie.';
  end if;

  perform pg_advisory_xact_lock(hashtext('rental:' || p_driver_id::text));
  v_reason := public._rental_conflict_reason(p_driver_id, v_vehicle, r.starts_at, r.ends_at, r.id);
  if v_reason is not null then raise exception '%', v_reason; end if;

  update public.vehicle_rentals
     set status = 'confirmed',
         driver_id = p_driver_id,
         vehicle_id = v_vehicle,
         price_fcfa = coalesce(p_price_fcfa, price_fcfa),
         payment_mode = coalesce(p_payment_mode, payment_mode),
         confirmed_at = now(),
         updated_at = now()
   where id = p_id
   returning * into r;

  perform public._notify_rental_confirmed(r.id);
  return r;
end;
$fn_aconf$;

revoke all on function public.admin_confirm_vehicle_rental(uuid, uuid, int, text) from public, anon;
grant execute on function public.admin_confirm_vehicle_rental(uuid, uuid, int, text) to authenticated;

create or replace function public.admin_update_vehicle_rental(
  p_id uuid,
  p_price_fcfa int default null,
  p_payment_mode text default null,
  p_paid_fcfa int default null,
  p_notes text default null
)
returns public.vehicle_rentals
language plpgsql security definer set search_path = public as $fn_aupd$
declare
  r public.vehicle_rentals;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;
  if p_payment_mode is not null and p_payment_mode not in ('cash', 'prepaid') then
    raise exception 'Mode de paiement invalide.';
  end if;

  select * into r from public.vehicle_rentals where id = p_id for update;
  if r.id is null then raise exception 'Location introuvable.'; end if;
  if r.status in ('completed', 'cancelled') then
    raise exception 'Cette location est terminée : modification impossible.';
  end if;
  if p_price_fcfa is not null and r.status = 'in_progress' then
    raise exception 'Le prix ne se modifie pas une fois la location commencée.';
  end if;

  update public.vehicle_rentals
     set price_fcfa = coalesce(p_price_fcfa, price_fcfa),
         payment_mode = coalesce(p_payment_mode, payment_mode),
         paid_fcfa = coalesce(p_paid_fcfa, paid_fcfa),
         notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
         updated_at = now()
   where id = p_id
   returning * into r;
  return r;
end;
$fn_aupd$;

revoke all on function public.admin_update_vehicle_rental(uuid, int, text, int, text) from public, anon;
grant execute on function public.admin_update_vehicle_rental(uuid, int, text, int, text) to authenticated;

create or replace function public.admin_cancel_vehicle_rental(p_id uuid, p_reason text default null)
returns public.vehicle_rentals
language plpgsql security definer set search_path = public as $fn_acancel$
declare
  r public.vehicle_rentals;
  v_driver_profile uuid;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;

  select * into r from public.vehicle_rentals where id = p_id for update;
  if r.id is null then raise exception 'Location introuvable.'; end if;
  if r.status not in ('requested', 'confirmed') then
    raise exception 'Cette location ne peut plus être annulée.';
  end if;

  update public.vehicle_rentals
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = 'team',
         cancel_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'team'),
         updated_at = now()
   where id = p_id
   returning * into r;

  perform public._push_notify(
    r.client_id,
    'Location VIP annulée',
    'Votre location du ' || to_char(r.starts_at at time zone 'Africa/Porto-Novo', 'DD/MM "à" HH24"h"MI')
      || ' a été annulée par TamCar.' || coalesce(' ' || nullif(trim(coalesce(p_reason, '')), ''), ''),
    '/reservations',
    'rental-cancel:' || r.id::text,
    true
  );
  if r.driver_id is not null then
    select profile_id into v_driver_profile from public.drivers where id = r.driver_id;
    if v_driver_profile is not null then
      perform public._push_notify(
        v_driver_profile,
        'Location VIP annulée',
        'La location du ' || to_char(r.starts_at at time zone 'Africa/Porto-Novo', 'DD/MM "à" HH24"h"MI') || ' est annulée.',
        '/reservations',
        'rental-cancel:' || r.id::text,
        true
      );
    end if;
  end if;
  return r;
end;
$fn_acancel$;

revoke all on function public.admin_cancel_vehicle_rental(uuid, text) from public, anon;
grant execute on function public.admin_cancel_vehicle_rental(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 6. Chauffeur : voir, démarrer, terminer
-- ------------------------------------------------------------
create or replace function public.driver_my_vehicle_rentals(p_scope text default 'all')
returns table (
  id uuid,
  status text,
  category vehicle_category,
  starts_at timestamptz,
  ends_at timestamptz,
  block_from timestamptz,
  hours int,
  pickup_address text,
  notes text,
  client_first_name text,
  client_phone text,
  contact_name text,
  contact_phone text,
  price_fcfa int,
  driver_share_fcfa int,
  payment_mode text,
  km_included_per_day int,
  fuel_by_client boolean,
  odometer_start int,
  odometer_end int,
  km_used int,
  ride_id uuid,
  is_upcoming boolean
)
language sql stable security definer set search_path = public as $fn_dmy$
  select * from (
    select
      vr.id, vr.status, vr.category,
      vr.starts_at, vr.ends_at,
      vr.starts_at - make_interval(mins => rr.block_before_min) as block_from,
      vr.hours, vr.pickup_address, vr.notes,
      split_part(coalesce(cp.full_name, 'Client'), ' ', 1) as client_first_name,
      case when vr.status in ('confirmed', 'in_progress') then cp.phone end as client_phone,
      vr.contact_name, vr.contact_phone,
      vr.price_fcfa,
      case when d.application_type = 'proprietaire'
           then floor(vr.price_fcfa * 0.80)::int
           else floor(vr.price_fcfa * 0.40)::int end as driver_share_fcfa,
      vr.payment_mode, vr.km_included_per_day, vr.fuel_by_client,
      vr.odometer_start, vr.odometer_end, vr.km_used, vr.ride_id,
      (vr.status in ('confirmed', 'in_progress') and vr.ends_at > now()) as is_upcoming
    from public.vehicle_rentals vr
    join public.drivers d on d.id = vr.driver_id and d.profile_id = auth.uid()
    join public.profiles cp on cp.id = vr.client_id
    join public.rental_rates rr on rr.category = vr.category
  ) t
  where p_scope = 'all' or t.is_upcoming
  order by t.is_upcoming desc,
           case when t.is_upcoming then extract(epoch from t.starts_at) else -extract(epoch from t.starts_at) end asc
  limit 60;
$fn_dmy$;

revoke all on function public.driver_my_vehicle_rentals(text) from public, anon;
grant execute on function public.driver_my_vehicle_rentals(text) to authenticated;

create or replace function public.driver_start_vehicle_rental(p_id uuid, p_odometer_start int default null)
returns public.vehicle_rentals
language plpgsql security definer set search_path = public as $fn_dstart$
declare
  r public.vehicle_rentals;
  v_drv uuid;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_drv from public.drivers where profile_id = auth.uid() limit 1;

  select * into r from public.vehicle_rentals where id = p_id for update;
  if r.id is null or r.driver_id is distinct from v_drv then raise exception 'Ce n''est pas ta location.'; end if;
  if r.status <> 'confirmed' then raise exception 'Cette location ne peut pas être démarrée.'; end if;
  if now() < r.starts_at - interval '60 minutes' then
    raise exception 'Trop tôt : la location commence à %.', to_char(r.starts_at at time zone 'Africa/Porto-Novo', 'HH24"h"MI');
  end if;
  if now() >= r.ends_at then raise exception 'Cette location est déjà terminée.'; end if;
  if p_odometer_start is not null and p_odometer_start < 0 then raise exception 'Kilométrage invalide.'; end if;

  update public.vehicle_rentals
     set status = 'in_progress', started_at = now(), odometer_start = p_odometer_start, updated_at = now()
   where id = p_id
   returning * into r;

  -- Pendant la location, le véhicule ne reçoit aucune demande de course.
  update public.drivers set is_online = false, updated_at = now() where id = v_drv and is_online;
  return r;
end;
$fn_dstart$;

revoke all on function public.driver_start_vehicle_rental(uuid, int) from public, anon;
grant execute on function public.driver_start_vehicle_rental(uuid, int) to authenticated;

create or replace function public.driver_complete_vehicle_rental(p_id uuid, p_odometer_end int default null)
returns public.vehicle_rentals
language plpgsql security definer set search_path = public as $fn_dcomp$
declare
  r public.vehicle_rentals;
  drv public.drivers;
  v_dealer uuid;
  v_ride uuid;
  v_total int;
  v_cash int;
  v_rachat int;
  v_dealer_share int;
  v_platform int;
  v_used int;
  v_allow int;
  v_extra_km int;
  v_days int;
  adm record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into drv from public.drivers where profile_id = auth.uid() limit 1;

  select * into r from public.vehicle_rentals where id = p_id for update;
  if r.id is null or r.driver_id is distinct from drv.id then raise exception 'Ce n''est pas ta location.'; end if;
  if r.status <> 'in_progress' then raise exception 'Cette location n''est pas en cours.'; end if;
  if p_odometer_end is not null and r.odometer_start is not null and p_odometer_end < r.odometer_start then
    raise exception 'Le kilométrage de fin ne peut pas être inférieur à celui du départ.';
  end if;

  -- Kilomètres : à contrôler par l'équipe (le supplément n'est PAS crédité ici).
  if p_odometer_end is not null and r.odometer_start is not null then
    v_used := p_odometer_end - r.odometer_start;
    v_days := greatest(1, ceil(extract(epoch from (r.ends_at - r.starts_at)) / 86400.0)::int);
    v_allow := r.km_included_per_day * v_days;
    v_extra_km := greatest(0, v_used - v_allow);
  end if;

  -- Partage identique à accept_ride.
  v_total := r.price_fcfa;
  select dealer_partner_id into v_dealer from public.vehicles where id = r.vehicle_id;
  if drv.application_type = 'proprietaire' then
    v_cash := floor(v_total * 0.80)::int;
    v_rachat := 0;
    v_dealer_share := 0;
    v_platform := v_total - v_cash;
    v_dealer := null;
  else
    v_cash := floor(v_total * 0.40)::int;
    v_rachat := floor(v_total * 0.10)::int;
    v_dealer_share := floor(v_total * 0.30)::int;
    v_platform := v_total - v_cash - v_rachat - v_dealer_share;
  end if;

  -- La course « miroir » : elle porte la comptabilité, l'historique et la note.
  insert into public.rides (
    client_id, driver_id, vehicle_id, dealer_partner_id,
    pickup_location, pickup_address, dropoff_location, dropoff_address,
    distance_km, duration_min,
    price_total_fcfa, driver_share_fcfa, driver_rachat_fcfa, dealer_share_fcfa, platform_share_fcfa,
    status, payment_method, requested_category,
    requested_at, matched_at, started_at, with_ac
  ) values (
    r.client_id, r.driver_id, r.vehicle_id, v_dealer,
    r.pickup_location, r.pickup_address, r.pickup_location,
    'Location VIP · ' || r.hours || ' h',
    0, r.hours * 60,
    v_total, v_cash, v_rachat, v_dealer_share, v_platform,
    'in_progress',
    case when r.payment_mode = 'prepaid' then null else 'cash'::payment_method end,
    r.category,
    coalesce(r.confirmed_at, r.created_at), coalesce(r.confirmed_at, r.created_at),
    coalesce(r.started_at, now()), true
  ) returning id into v_ride;

  update public.rides
     set status = 'completed', ended_at = now(), updated_at = now()
   where id = v_ride;

  update public.vehicle_rentals
     set status = 'completed',
         completed_at = now(),
         ride_id = v_ride,
         odometer_end = p_odometer_end,
         km_used = v_used,
         extra_km = v_extra_km,
         extra_fcfa = case when v_extra_km is null then null else v_extra_km * km_extra_fcfa end,
         updated_at = now()
   where id = p_id
   returning * into r;

  -- Prépayé mais pas soldé : TamCar a crédité le chauffeur sans avoir tout encaissé.
  -- L'équipe est alertée pour relancer le client.
  if r.payment_mode = 'prepaid' and r.paid_fcfa < r.price_fcfa then
    for adm in select id from public.profiles where role = 'admin' loop
      perform public._push_notify(
        adm.id,
        'Location VIP terminée non soldée',
        'Reste ' || (r.price_fcfa - r.paid_fcfa) || ' F à encaisser sur ' || r.price_fcfa || ' F.',
        '/admin/locations',
        'rental-unpaid:' || r.id::text,
        true
      );
    end loop;
  end if;

  return r;
end;
$fn_dcomp$;

revoke all on function public.driver_complete_vehicle_rental(uuid, int) from public, anon;
grant execute on function public.driver_complete_vehicle_rental(uuid, int) to authenticated;

-- ------------------------------------------------------------
-- 7. Tâche planifiée (chaque minute) : blocage, rappels, alerte retard
-- ------------------------------------------------------------
create or replace function public._rentals_tick()
returns void
language plpgsql security definer set search_path = public as $fn_tick$
declare
  rec record;
  rung record;
  v_title text;
  v_when text;
  adm record;
begin
  -- 1. Les véhicules en fenêtre de location (tampon compris) passent hors ligne.
  --    Un chauffeur en pleine course finit d'abord celle-ci.
  update public.drivers d
     set is_online = false, updated_at = now()
   where d.is_online
     and exists (
       select 1
         from public.vehicle_rentals vr
         join public.rental_rates rr on rr.category = vr.category
        where vr.driver_id = d.id
          and vr.status in ('confirmed', 'in_progress')
          and now() >= vr.starts_at - make_interval(mins => rr.block_before_min)
          and now() < vr.ends_at
     )
     and not exists (
       select 1 from public.rides r
        where r.driver_id = d.id and r.status in ('matched', 'arrived', 'in_progress')
     );

  -- 2. Rappels J-1, H-2, H-30 au client et au chauffeur (chacun dans SA fenêtre).
  for rung in
    select * from (values (1440, 1380), (120, 110), (30, 20)) as t(hi, lo)
  loop
    v_title := case rung.hi
      when 1440 then 'Location VIP demain'
      when 120 then 'Location VIP dans 2 heures'
      else 'Location VIP dans 30 minutes'
    end;

    for rec in
      select vr.id, vr.client_id, vr.starts_at, vr.hours, vr.pickup_address,
             d.profile_id as driver_profile_id,
             split_part(coalesce(dp.full_name, 'Votre chauffeur'), ' ', 1) as driver_name,
             split_part(coalesce(cp.full_name, 'Le client'), ' ', 1) as client_name
        from public.vehicle_rentals vr
        join public.profiles cp on cp.id = vr.client_id
        left join public.drivers d on d.id = vr.driver_id
        left join public.profiles dp on dp.id = d.profile_id
       where vr.status = 'confirmed'
         and not (rung.hi::smallint = any (vr.reminders_sent))
         and vr.starts_at >  now() + make_interval(mins => rung.lo)
         and vr.starts_at <= now() + make_interval(mins => rung.hi)
       for update of vr skip locked
    loop
      v_when := to_char(rec.starts_at at time zone 'Africa/Porto-Novo', 'DD/MM "à" HH24"h"MI');

      perform public._push_notify(
        rec.client_id, v_title,
        'Le ' || v_when || ' · ' || rec.hours || ' h · ' || rec.driver_name || ' sera votre chauffeur.',
        '/reservations', 'rental-r' || rung.hi || 'c:' || rec.id::text, true
      );
      if rec.driver_profile_id is not null then
        perform public._push_notify(
          rec.driver_profile_id, v_title,
          'Le ' || v_when || ' · ' || rec.hours || ' h · ' || rec.client_name || ' · ' || left(rec.pickup_address, 50),
          '/reservations', 'rental-r' || rung.hi || 'd:' || rec.id::text, true
        );
      end if;

      update public.vehicle_rentals
         set reminders_sent = reminders_sent || rung.hi::smallint
       where id = rec.id;
    end loop;
  end loop;

  -- 3. Location confirmée dont le début est dépassé de 45 min sans démarrage : l'équipe est alertée une fois.
  for rec in
    select vr.id, vr.starts_at, split_part(coalesce(cp.full_name, 'Client'), ' ', 1) as client_name
      from public.vehicle_rentals vr
      join public.profiles cp on cp.id = vr.client_id
     where vr.status = 'confirmed'
       and vr.starts_at < now() - interval '45 minutes'
       and not (9001::smallint = any (vr.reminders_sent))
     for update of vr skip locked
  loop
    for adm in select id from public.profiles where role = 'admin' loop
      perform public._push_notify(
        adm.id,
        'Location VIP non démarrée',
        rec.client_name || ' · prévue à '
          || to_char(rec.starts_at at time zone 'Africa/Porto-Novo', 'HH24"h"MI')
          || ' : le chauffeur n''a pas démarré la location.',
        '/admin/locations', 'rental-late:' || rec.id::text, true
      );
    end loop;
    update public.vehicle_rentals
       set reminders_sent = reminders_sent || 9001::smallint
     where id = rec.id;
  end loop;
end;
$fn_tick$;

revoke all on function public._rentals_tick() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('vehicle-rentals');
exception when others then
  null;
end $$;

select cron.schedule(
  'vehicle-rentals',
  '* * * * *',
  $$select public._rentals_tick()$$
);

-- ------------------------------------------------------------
-- 8. Pool des chauffeurs : cascade de catégories + calendrier de location
-- ------------------------------------------------------------
create or replace function public.pending_rides_for_driver(
  radius_km double precision default 10.0
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
  requested_at timestamptz,
  requested_category vehicle_category,
  downgrade_accepted_at timestamptz,
  is_below_driver_category boolean
)
language plpgsql security invoker as $fn_pending$
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
    and st_dwithin(r.pickup_location, v_search_origin, v_effective_radius * 1000)
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
$fn_pending$;

-- ------------------------------------------------------------
-- 9. accept_ride : cascade + calendrier de location
-- ------------------------------------------------------------
create or replace function public.accept_ride(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  driver_row public.drivers;
  dealer_id uuid;
  result public.rides;
  total int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer_share int;
  new_platform int;
  v_pickup geography;
  v_dist_m int;
  v_target uuid;
  v_req_cat vehicle_category;
  v_req_at timestamptz;
  v_drv_cat vehicle_category;
  v_dur int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into driver_row
  from public.drivers where profile_id = auth.uid();

  if driver_row is null then raise exception 'Not a driver'; end if;
  if driver_row.status <> 'active' or not driver_row.is_online then
    raise exception 'Driver not active or offline';
  end if;
  if driver_row.current_vehicle_id is null then
    raise exception 'No vehicle assigned';
  end if;

  if exists (
    select 1 from public.rides
    where driver_id = driver_row.id
      and status in ('matched', 'arrived', 'in_progress')
  ) then
    raise exception 'Course active déjà en cours — termine-la avant.';
  end if;

  select dealer_partner_id, category into dealer_id, v_drv_cat
   from public.vehicles where id = driver_row.current_vehicle_id;

  select price_total_fcfa, pickup_location, requested_driver_id, requested_category, requested_at, duration_min
    into total, v_pickup, v_target, v_req_cat, v_req_at, v_dur
   from public.rides where id = ride_id;

  if total is null then raise exception 'Ride introuvable'; end if;

  -- Course directe : réservée au chauffeur visé tant qu'elle est directe.
  if v_target is not null and v_target <> driver_row.id then
    raise exception 'Cette course est réservée à un autre chauffeur.';
  end if;

  -- Calendrier : un véhicule réservé (location VIP) n'accepte pas une course qui
  -- chevaucherait sa réservation ou le tampon qui la précède.
  if public._my_rental_conflict(now(), now() + make_interval(mins => coalesce(v_dur, 15) + 10)) then
    raise exception 'Ton véhicule est réservé (location VIP) : cette course chevaucherait ta réservation.';
  end if;

  -- Cascade de catégories (course ordinaire uniquement) : le VIP ne prend jamais
  -- une demande Essentiel ; le VIP ne prend une demande Confort, et le Confort
  -- une demande Essentiel, qu'après 30 s sans preneur.
  if v_target is null and v_drv_cat is not null and v_req_cat is not null then
    if (v_drv_cat = 'premium' and v_req_cat = 'essentiel')
       or (v_drv_cat = 'premium' and v_req_cat = 'confort'
           and v_req_at > now() - interval '30 seconds')
       or (v_drv_cat = 'confort' and v_req_cat = 'essentiel'
           and v_req_at > now() - interval '30 seconds') then
      raise exception 'Cette course n''est pas encore ouverte à ta catégorie.';
    end if;
  end if;

  v_dist_m := coalesce(
    st_distance(driver_row.current_location, v_pickup)::int,
    0
  );

  if driver_row.application_type = 'proprietaire' then
    new_driver_cash := floor(total * 0.80)::int;
    new_driver_rachat := 0;
    new_dealer_share := 0;
    new_platform := total - new_driver_cash;
  else
    new_driver_cash := floor(total * 0.40)::int;
    new_driver_rachat := floor(total * 0.10)::int;
    new_dealer_share := floor(total * 0.30)::int;
    new_platform := total - new_driver_cash - new_driver_rachat - new_dealer_share;
  end if;

  update public.rides
  set driver_id = driver_row.id,
      vehicle_id = driver_row.current_vehicle_id,
      dealer_partner_id = case
        when driver_row.application_type = 'proprietaire' then null
        else dealer_id
      end,
      driver_share_fcfa = new_driver_cash,
      driver_rachat_fcfa = new_driver_rachat,
      dealer_share_fcfa = new_dealer_share,
      platform_share_fcfa = new_platform,
      driver_location_at_match = driver_row.current_location,
      driver_distance_at_match_m = v_dist_m,
      status = 'matched',
      matched_at = now(),
      updated_at = now()
  where id = ride_id
    and status = 'requested'
    and driver_id is null
  returning * into result;

  if result is null then raise exception 'Ride already taken or unavailable'; end if;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- 10. Réservations de courses : le calendrier de location s'y applique aussi
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

  -- Sans chauffeur actif ou sans véhicule courant, il n'y a rien à
  -- proposer. La position, elle, n'est plus bloquante.
  if v_drv_id is null or v_drv_category is null then
    return;
  end if;

  return query
  select
    r.id, r.pickup_address, r.dropoff_address,
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    case when v_drv_loc is null then null::double precision
         else st_distance(r.pickup_location, v_drv_loc) end,
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
    and (v_drv_loc is null
         or st_dwithin(r.pickup_location, v_drv_loc, radius_km * 1000))
    and (
      v_drv_category = r.requested_category
      or (v_drv_category = 'confort' and r.requested_category = 'essentiel')
    )
    -- Calendrier : pas de réservation de course sur un créneau de location.
    and not public._my_rental_conflict(
      r.scheduled_at - interval '10 minutes',
      r.scheduled_at + make_interval(mins => coalesce(r.duration_min, 20) + 10)
    )
  order by r.scheduled_at asc
  limit 20;
end;
$fn_psr$;
grant execute on function public.pending_scheduled_rides_for_driver(double precision) to authenticated;

comment on function public.pending_scheduled_rides_for_driver is
  'Réservations libres proposées au chauffeur connecté : 12 km, catégorie compatible, hors créneaux de location VIP. Position inconnue = pas de filtre de distance et distance nulle, pour rester cohérent avec _notify_scheduled_booking qui notifie ces chauffeurs.';

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

  if r.scheduled_at is not null
     and public._my_rental_conflict(
           r.scheduled_at - interval '10 minutes',
           r.scheduled_at + make_interval(mins => coalesce(r.duration_min, 20) + 10)) then
    raise exception 'Tu as une location VIP sur ce créneau.';
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
-- 11. Mise en ligne : refusée pendant une location (tampon compris)
-- ------------------------------------------------------------
create or replace function public.driver_go_online(
  current_lng double precision,
  current_lat double precision
)
returns public.drivers
language plpgsql security definer set search_path = public as $$
declare
  result public.drivers;
  v_balance int;
  v_until timestamptz;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  -- Blocage dette : tolérance de découvert de 5 000 F.
  -- Revenus < −5 000 => recharger le wallet avant de repasser en ligne.
  select balance_fcfa into v_balance from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus';
  if coalesce(v_balance, 0) < -5000 then
    raise exception 'Dette de % F (tolérance 5 000 F dépassée). Rechargez au moins % F pour repasser en ligne.',
      (-v_balance), (-v_balance - 5000)
      using errcode = 'P0001';
  end if;

  -- Véhicule réservé : pas de mise en ligne pendant la location ni son tampon.
  select max(vr.ends_at) into v_until
    from public.vehicle_rentals vr
    join public.drivers d on d.id = vr.driver_id
    join public.rental_rates rr on rr.category = vr.category
   where d.profile_id = auth.uid()
     and vr.status in ('confirmed', 'in_progress')
     and now() >= vr.starts_at - make_interval(mins => rr.block_before_min)
     and now() < vr.ends_at;
  if v_until is not null then
    raise exception 'Ton véhicule est réservé (location VIP) jusqu''à %. Tu repasseras en ligne ensuite.',
      to_char(v_until at time zone 'Africa/Porto-Novo', 'HH24"h"MI')
      using errcode = 'P0001';
  end if;

  update public.drivers
  set is_online = true,
      current_location = st_setsrid(st_makepoint(current_lng, current_lat), 4326)::geography,
      last_seen_at = now(),
      updated_at = now()
  where profile_id = auth.uid()
  returning * into result;

  if result is null then
    raise exception 'Not a driver';
  end if;
  return result;
end;
$$;

grant execute on function public.driver_go_online(double precision, double precision) to authenticated;
