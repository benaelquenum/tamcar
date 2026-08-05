-- ============================================================
-- TamCar — Tamy : bot WhatsApp de commande de course (2026-08-06)
--
-- Objectif : permettre de commander une course TamCar entièrement
-- par WhatsApp, sans installer d'application.
--
-- Ce fichier est IDEMPOTENT : il peut être rejoué sans effet de bord.
--
-- Contenu :
--   1. wa_contacts  — identité WhatsApp persistante (numéro ↔ profile,
--                     compteur d'absences, blocage)
--   2. wa_sessions  — machine à états de la conversation (1 par numéro)
--   3. wa_messages  — journal entrant/sortant (audit + idempotence Meta)
--   4. wa_rides     — lien course ↔ numéro WhatsApp (pour les notifs)
--   5. RPC consommées par les edge functions tamy-webhook / tamy-notify
--   6. Trigger de notification sortante sur changement de statut course
--
-- Principes :
--   - Toutes les RPC sensibles sont `security definer set search_path = public`
--     et RÉSERVÉES au rôle service_role (revoke public/anon/authenticated).
--   - La création de course RÉUTILISE public.create_ride (16 params) :
--     aucune logique de prix / split / zone n'est réimplémentée ici.
--     Astuce : create_ride est `security invoker` et exige auth.uid() ;
--     wa_create_ride pose donc request.jwt.claims le temps de la
--     transaction pour que auth.uid() renvoie le profil du client
--     WhatsApp, puis restaure la valeur précédente.
--   - Paiement en espèces par défaut.
-- ============================================================

create extension if not exists pg_net;

-- ------------------------------------------------------------
-- 0. Helper : normalisation E.164 (Meta envoie « 22997000000 »)
-- ------------------------------------------------------------
create or replace function public.wa_normalize_phone(p_raw text)
returns text
language sql immutable as $$
  select nullif(
    case
      when regexp_replace(coalesce(p_raw, ''), '[^0-9]', '', 'g') = '' then ''
      else '+' || regexp_replace(coalesce(p_raw, ''), '[^0-9]', '', 'g')
    end,
    ''
  );
$$;

comment on function public.wa_normalize_phone is
  'Normalise un numéro WhatsApp en E.164 (+22997000000). NULL si aucun chiffre.';

-- ============================================================
-- 1. wa_contacts — identité WhatsApp persistante
-- ============================================================
create table if not exists public.wa_contacts (
  id uuid primary key default gen_random_uuid(),
  wa_phone text not null unique,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text,
  no_show_count int not null default 0 check (no_show_count >= 0),
  blocked boolean not null default false,
  blocked_reason text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wa_contacts_profile_idx on public.wa_contacts (profile_id);

drop trigger if exists wa_contacts_updated_at on public.wa_contacts;
create trigger wa_contacts_updated_at
  before update on public.wa_contacts
  for each row execute function public.set_updated_at();

comment on table public.wa_contacts is
  'Un numéro WhatsApp connu de Tamy. profile_id = compte TamCar rattaché. blocked = commande interdite (anti no-show).';

-- ============================================================
-- 2. wa_sessions — machine à états (une session par numéro)
-- ============================================================
create table if not exists public.wa_sessions (
  wa_phone text primary key,
  contact_id uuid references public.wa_contacts(id) on delete cascade,
  state text not null default 'idle',
  context jsonb not null default '{}'::jsonb,
  last_message_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wa_sessions drop constraint if exists wa_sessions_state_check;
alter table public.wa_sessions add constraint wa_sessions_state_check check (
  state in (
    'idle',
    'awaiting_terms',
    'awaiting_name',
    'awaiting_pickup',
    'awaiting_pickup_choice',
    'awaiting_dropoff',
    'awaiting_dropoff_choice',
    'awaiting_category',
    'awaiting_confirm',
    'ride_active'
  )
);

create index if not exists wa_sessions_expires_idx on public.wa_sessions (expires_at);

drop trigger if exists wa_sessions_updated_at on public.wa_sessions;
create trigger wa_sessions_updated_at
  before update on public.wa_sessions
  for each row execute function public.set_updated_at();

comment on table public.wa_sessions is
  'État courant de la conversation Tamy. context : {pickup:{lat,lng,address}, dropoff:{...}, distance_km, duration_min, quotes:[], category, price_fcfa, ride_id, candidates:[]}.';

-- ============================================================
-- 3. wa_messages — journal entrant / sortant
-- ============================================================
create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  wa_phone text not null,
  direction text not null check (direction in ('in', 'out')),
  wa_message_id text,
  msg_type text,
  body text,
  payload jsonb not null default '{}'::jsonb,
  state_before text,
  state_after text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists wa_messages_phone_created_idx
  on public.wa_messages (wa_phone, created_at desc);

-- Idempotence : Meta rejoue les webhooks non acquittés. Un message
-- entrant déjà journalisé ne doit pas être re-traité.
create unique index if not exists wa_messages_wa_message_id_key
  on public.wa_messages (wa_message_id) where wa_message_id is not null;

comment on table public.wa_messages is
  'Journal complet des messages WhatsApp (audit + debug + idempotence des retries Meta).';

-- ============================================================
-- 4. wa_rides — lien course ↔ numéro WhatsApp
-- ============================================================
create table if not exists public.wa_rides (
  ride_id uuid primary key references public.rides(id) on delete cascade,
  wa_phone text not null,
  contact_id uuid references public.wa_contacts(id) on delete set null,
  last_notified_status ride_status,
  created_at timestamptz not null default now()
);

create index if not exists wa_rides_phone_idx on public.wa_rides (wa_phone);

comment on table public.wa_rides is
  'Courses commandées via Tamy. Sert à router les notifications sortantes WhatsApp (et à ne pas spammer les clients venus de l''app).';

-- ============================================================
-- 5. RLS — lecture admin uniquement ; le service_role bypasse
-- ============================================================
alter table public.wa_contacts enable row level security;
alter table public.wa_sessions enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_rides    enable row level security;

drop policy if exists wa_contacts_admin_read on public.wa_contacts;
create policy wa_contacts_admin_read on public.wa_contacts
  for select to authenticated using (public.is_admin());

drop policy if exists wa_sessions_admin_read on public.wa_sessions;
create policy wa_sessions_admin_read on public.wa_sessions
  for select to authenticated using (public.is_admin());

drop policy if exists wa_messages_admin_read on public.wa_messages;
create policy wa_messages_admin_read on public.wa_messages
  for select to authenticated using (public.is_admin());

drop policy if exists wa_rides_admin_read on public.wa_rides;
create policy wa_rides_admin_read on public.wa_rides
  for select to authenticated using (public.is_admin());

-- Aucune policy d'écriture : seules les fonctions security definer
-- (et le service_role depuis les edge functions) écrivent.

-- ============================================================
-- 6. RPC — contacts & sessions
-- ============================================================

create or replace function public.wa_touch_contact(
  p_wa_phone text,
  p_display_name text default null
)
returns public.wa_contacts
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.wa_normalize_phone(p_wa_phone);
  v_contact public.wa_contacts;
begin
  if v_phone is null then raise exception 'Numéro WhatsApp invalide'; end if;

  insert into public.wa_contacts (wa_phone, display_name)
  values (v_phone, nullif(trim(coalesce(p_display_name, '')), ''))
  on conflict (wa_phone) do update
    set last_seen_at = now(),
        display_name = coalesce(
          nullif(trim(coalesce(excluded.display_name, '')), ''),
          wa_contacts.display_name
        )
  returning * into v_contact;

  return v_contact;
end;
$$;

comment on function public.wa_touch_contact is
  'Crée/rafraîchit le contact WhatsApp. Retourne la ligne wa_contacts complète.';

create or replace function public.wa_get_session(
  p_wa_phone text,
  p_display_name text default null,
  p_ttl_minutes int default 30
)
returns public.wa_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.wa_normalize_phone(p_wa_phone);
  v_contact public.wa_contacts;
  v_session public.wa_sessions;
begin
  if v_phone is null then raise exception 'Numéro WhatsApp invalide'; end if;
  v_contact := public.wa_touch_contact(v_phone, p_display_name);

  insert into public.wa_sessions (wa_phone, contact_id, expires_at)
  values (v_phone, v_contact.id, now() + make_interval(mins => p_ttl_minutes))
  on conflict (wa_phone) do nothing;

  select * into v_session from public.wa_sessions where wa_phone = v_phone for update;

  if v_session.expires_at < now() then
    -- Session expirée → on repart de zéro (le contact, lui, est conservé)
    update public.wa_sessions
      set state = 'idle',
          context = '{}'::jsonb,
          contact_id = v_contact.id,
          last_message_at = now(),
          expires_at = now() + make_interval(mins => p_ttl_minutes)
      where wa_phone = v_phone
      returning * into v_session;
  else
    update public.wa_sessions
      set contact_id = v_contact.id,
          last_message_at = now(),
          expires_at = now() + make_interval(mins => p_ttl_minutes)
      where wa_phone = v_phone
      returning * into v_session;
  end if;

  return v_session;
end;
$$;

comment on function public.wa_get_session is
  'Retourne la session courante (créée si absente, remise à idle si expirée) et prolonge son TTL.';

create or replace function public.wa_set_state(
  p_wa_phone text,
  p_state text,
  p_context jsonb default null,
  p_ttl_minutes int default 30
)
returns public.wa_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.wa_normalize_phone(p_wa_phone);
  v_session public.wa_sessions;
begin
  update public.wa_sessions
    set state = p_state,
        context = coalesce(p_context, context),
        expires_at = now() + make_interval(mins => p_ttl_minutes)
    where wa_phone = v_phone
    returning * into v_session;

  if v_session.wa_phone is null then
    raise exception 'Session WhatsApp introuvable pour %', v_phone;
  end if;
  return v_session;
end;
$$;

comment on function public.wa_set_state is
  'Positionne l''état + le contexte de la session et prolonge le TTL.';

create or replace function public.wa_log_message(
  p_wa_phone text,
  p_direction text,
  p_wa_message_id text default null,
  p_msg_type text default null,
  p_body text default null,
  p_payload jsonb default '{}'::jsonb,
  p_state_before text default null,
  p_state_after text default null,
  p_error text default null
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.wa_messages (
    wa_phone, direction, wa_message_id, msg_type, body, payload,
    state_before, state_after, error
  ) values (
    public.wa_normalize_phone(p_wa_phone), p_direction, nullif(p_wa_message_id, ''),
    p_msg_type, p_body, coalesce(p_payload, '{}'::jsonb),
    p_state_before, p_state_after, p_error
  )
  on conflict (wa_message_id) where wa_message_id is not null do nothing
  returning id into v_id;

  -- false = message déjà journalisé (retry Meta) → ne pas re-traiter
  return v_id is not null;
end;
$$;

comment on function public.wa_log_message is
  'Journalise un message. Retourne false si wa_message_id déjà vu (retry Meta) → le webhook doit ignorer le message.';

-- ============================================================
-- 7. RPC — compte léger & CGU
-- ============================================================

create or replace function public.wa_find_profile_by_phone(p_phone text)
returns uuid
language sql stable security definer set search_path = public as $$
  select p.id
    from public.profiles p
   where regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
       = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
     and regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') <> ''
   order by p.created_at asc
   limit 1;
$$;

comment on function public.wa_find_profile_by_phone is
  'Retrouve un profile existant par numéro (comparaison chiffres seuls, tolérante au format). NULL si aucun.';

create or replace function public.wa_link_profile(
  p_wa_phone text,
  p_profile_id uuid
)
returns public.wa_contacts
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.wa_normalize_phone(p_wa_phone);
  v_contact public.wa_contacts;
begin
  update public.wa_contacts
    set profile_id = p_profile_id
    where wa_phone = v_phone
    returning * into v_contact;

  if v_contact.id is null then
    raise exception 'Contact WhatsApp % introuvable', v_phone;
  end if;
  return v_contact;
end;
$$;

comment on function public.wa_link_profile is
  'Rattache un profile TamCar à un numéro WhatsApp (le user auth est créé côté edge function avec la clé service role).';

create or replace function public.wa_has_accepted_terms(
  p_profile_id uuid,
  p_version text default '2026-07-22'
)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.terms_acceptances
     where profile_id = p_profile_id
       and version = p_version
       and app = 'client'
       and doc = 'cgu'
  );
$$;

create or replace function public.wa_accept_terms(
  p_profile_id uuid,
  p_version text default '2026-07-22'
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.terms_acceptances (profile_id, doc, version, app)
  values (p_profile_id, 'cgu', p_version, 'client')
  on conflict (profile_id, doc, version, app) do nothing;

  insert into public.terms_acceptances (profile_id, doc, version, app)
  values (p_profile_id, 'privacy', p_version, 'client')
  on conflict (profile_id, doc, version, app) do nothing;
end;
$$;

comment on function public.wa_accept_terms is
  'Enregistre l''acceptation CGU + confidentialité (mot-clé « J''ACCEPTE » sur WhatsApp). Preuve horodatée, même table que les apps.';

-- ============================================================
-- 8. RPC — géocodage inverse léger (table places)
-- ============================================================

create or replace function public.wa_reverse_place(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int default 1200
)
returns text
language sql stable security definer set search_path = public as $$
  select p.name || coalesce(', ' || p.city, '')
    from public.places p
   where st_dwithin(
           p.location,
           st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
           p_radius_m
         )
   order by st_distance(
              p.location,
              st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
            ) asc
   limit 1;
$$;

comment on function public.wa_reverse_place is
  'Nom du POI le plus proche (rayon paramétrable) pour libeller une position WhatsApp partagée. NULL si rien à proximité.';

-- ============================================================
-- 9. RPC — grille de prix multi-catégories (réutilise compute_price)
-- ============================================================

create or replace function public.wa_price_menu(
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_distance_km numeric,
  p_duration_min int,
  p_is_night boolean default false,
  p_with_ac boolean default false
)
returns table (
  category vehicle_category,
  price_total_fcfa int,
  is_corridor boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  c vehicle_category;
  q record;
begin
  foreach c in array array['moto', 'tricycle', 'essentiel', 'confort', 'premium']::vehicle_category[]
  loop
    begin
      select * into q from public.compute_price(
        p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
        p_distance_km, p_duration_min, c, p_is_night, p_with_ac
      ) limit 1;

      if q.price_total_fcfa is not null then
        category := c;
        price_total_fcfa := q.price_total_fcfa;
        is_corridor := q.is_corridor;
        return next;
      end if;
    exception when others then
      null;  -- catégorie non tarifée en base → simplement absente du menu
    end;
  end loop;
end;
$$;

comment on function public.wa_price_menu is
  'Prix des 5 catégories pour un trajet donné, via compute_price (aucune règle tarifaire dupliquée).';

-- ============================================================
-- 10. RPC — création / annulation de course pour un client WhatsApp
-- ============================================================

create or replace function public.wa_create_ride(
  p_wa_phone text,
  p_category vehicle_category,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_pickup_address text,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_dropoff_address text,
  p_distance_km numeric,
  p_duration_min int,
  p_with_ac boolean default false,
  p_payment_method payment_method default 'cash',
  p_terms_version text default '2026-07-22'
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.wa_normalize_phone(p_wa_phone);
  v_contact public.wa_contacts;
  v_ride public.rides;
  v_prev_claims text;
begin
  select * into v_contact from public.wa_contacts where wa_phone = v_phone;
  if v_contact.id is null then
    raise exception 'Contact WhatsApp inconnu';
  end if;
  if v_contact.profile_id is null then
    raise exception 'Aucun compte TamCar rattaché à ce numéro';
  end if;
  if v_contact.blocked then
    raise exception 'Commande bloquée après % absence(s) au point de départ.', v_contact.no_show_count;
  end if;
  if not public.wa_has_accepted_terms(v_contact.profile_id, p_terms_version) then
    raise exception 'CGU non acceptées';
  end if;

  -- create_ride est security invoker et exige auth.uid() : on pose les
  -- claims JWT le temps de la transaction (is_local = true).
  v_prev_claims := current_setting('request.jwt.claims', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_contact.profile_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_contact.profile_id::text, true);

  v_ride := public.create_ride(
    p_category        => p_category,
    p_pickup_lat      => p_pickup_lat,
    p_pickup_lng      => p_pickup_lng,
    p_pickup_address  => p_pickup_address,
    p_dropoff_lat     => p_dropoff_lat,
    p_dropoff_lng     => p_dropoff_lng,
    p_dropoff_address => p_dropoff_address,
    p_distance_km     => p_distance_km,
    p_duration_min    => p_duration_min,
    p_is_night        => false,
    p_with_ac         => p_with_ac,
    p_scheduled_at    => null,
    p_payment_method  => p_payment_method,
    p_promo_code      => null,
    p_passenger_name  => null,
    p_passenger_phone => null
  );

  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  perform set_config('request.jwt.claim.sub', '', true);

  insert into public.wa_rides (ride_id, wa_phone, contact_id)
    values (v_ride.id, v_phone, v_contact.id)
    on conflict (ride_id) do nothing;

  return v_ride;
end;
$$;

comment on function public.wa_create_ride is
  'Crée une course pour un client WhatsApp en réutilisant create_ride (prix, split, zone de service, statut). Refuse si CGU non acceptées ou contact bloqué pour absences.';

create or replace function public.wa_cancel_ride(
  p_wa_phone text,
  p_ride_id uuid default null
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.wa_normalize_phone(p_wa_phone);
  v_contact public.wa_contacts;
  v_ride_id uuid := p_ride_id;
  v_ride public.rides;
  v_prev_claims text;
begin
  select * into v_contact from public.wa_contacts where wa_phone = v_phone;
  if v_contact.profile_id is null then
    raise exception 'Aucun compte TamCar rattaché à ce numéro';
  end if;

  if v_ride_id is null then
    v_ride_id := public.wa_active_ride(v_phone);
  end if;
  if v_ride_id is null then
    raise exception 'Aucune course en cours';
  end if;

  v_prev_claims := current_setting('request.jwt.claims', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_contact.profile_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_contact.profile_id::text, true);

  v_ride := public.cancel_ride_by_client(
    ride_id => v_ride_id,
    p_user_reason => 'Annulation demandée sur WhatsApp'
  );

  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  perform set_config('request.jwt.claim.sub', '', true);

  return v_ride;
end;
$$;

comment on function public.wa_cancel_ride is
  'Annule la course en cours du client WhatsApp via cancel_ride_by_client (frais d''annulation et attribution de faute inchangés).';

create or replace function public.wa_active_ride(p_wa_phone text)
returns uuid
language sql stable security definer set search_path = public as $$
  select r.id
    from public.rides r
    join public.wa_contacts c
      on c.profile_id = r.client_id
   where c.wa_phone = public.wa_normalize_phone(p_wa_phone)
     and r.status in ('requested', 'matched', 'arrived', 'in_progress')
   order by r.requested_at desc
   limit 1;
$$;

comment on function public.wa_active_ride is
  'ID de la course active du client WhatsApp (requested/matched/arrived/in_progress), sinon NULL.';

create or replace function public.wa_ride_share_token(
  p_wa_phone text,
  p_ride_id uuid
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_contact public.wa_contacts;
  v_token text;
  v_prev_claims text;
begin
  select * into v_contact
    from public.wa_contacts
   where wa_phone = public.wa_normalize_phone(p_wa_phone);
  if v_contact.profile_id is null then
    raise exception 'Aucun compte TamCar rattaché à ce numéro';
  end if;

  v_prev_claims := current_setting('request.jwt.claims', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_contact.profile_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_contact.profile_id::text, true);

  v_token := public.create_ride_share_link(p_ride_id);

  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  perform set_config('request.jwt.claim.sub', '', true);

  return v_token;
end;
$$;

comment on function public.wa_ride_share_token is
  'Jeton de suivi public (/suivi/<token>) pour une course Tamy : le client WhatsApp n''est pas connecté à l''app, ce lien est sa seule vue temps réel.';

-- Le type de retour peut évoluer : on drop avant de recréer.
drop function if exists public.wa_ride_summary(uuid);

create function public.wa_ride_summary(p_ride_id uuid)
returns table (
  ride_id uuid,
  wa_phone text,
  status ride_status,
  price_total_fcfa int,
  payment_method payment_method,
  pickup_address text,
  dropoff_address text,
  driver_full_name text,
  driver_phone text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_color text,
  vehicle_plate text,
  share_token text
)
language sql stable security definer set search_path = public as $$
  select
    r.id,
    w.wa_phone,
    r.status,
    r.price_total_fcfa,
    r.payment_method,
    r.pickup_address,
    r.dropoff_address,
    p.full_name,
    p.phone,
    v.brand,
    v.model,
    v.color,
    v.plate_number,
    l.token
  from public.rides r
  join public.wa_rides w on w.ride_id = r.id
  left join public.drivers d on d.id = r.driver_id
  left join public.profiles p on p.id = d.profile_id
  left join public.vehicles v on v.id = r.vehicle_id
  left join public.ride_share_links l on l.ride_id = r.id
  where r.id = p_ride_id;
$$;

comment on function public.wa_ride_summary is
  'Résumé d''une course Tamy (client + chauffeur + véhicule) pour composer les messages WhatsApp sortants.';

-- ============================================================
-- 11. Anti no-show
-- ============================================================

create or replace function public.wa_register_no_show(
  p_wa_phone text,
  p_ride_id uuid default null,
  p_threshold int default 2
)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  update public.wa_contacts
    set no_show_count = no_show_count + 1,
        blocked = (no_show_count + 1) >= p_threshold,
        blocked_reason = case
          when (no_show_count + 1) >= p_threshold
          then 'no_show:' || (no_show_count + 1)::text
          else blocked_reason
        end
    where wa_phone = public.wa_normalize_phone(p_wa_phone)
    returning no_show_count into v_count;

  if v_count is not null and p_ride_id is not null then
    insert into public.wa_messages (wa_phone, direction, msg_type, body, payload)
    values (
      public.wa_normalize_phone(p_wa_phone), 'out', 'system',
      'Absence constatée (compteur = ' || v_count || ')',
      jsonb_build_object('ride_id', p_ride_id, 'no_show_count', v_count)
    );
  end if;

  return coalesce(v_count, 0);
end;
$$;

comment on function public.wa_register_no_show is
  'Incrémente le compteur d''absences du contact WhatsApp et bloque la commande au seuil (2 par défaut).';

create or replace function public.wa_admin_reset_no_show(p_wa_phone text)
returns public.wa_contacts
language plpgsql security definer set search_path = public as $$
declare
  v_contact public.wa_contacts;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  update public.wa_contacts
    set no_show_count = 0, blocked = false, blocked_reason = null
    where wa_phone = public.wa_normalize_phone(p_wa_phone)
    returning * into v_contact;

  if v_contact.id is null then
    raise exception 'Contact WhatsApp introuvable';
  end if;
  return v_contact;
end;
$$;

comment on function public.wa_admin_reset_no_show is
  'Débloque un client WhatsApp (remet le compteur d''absences à zéro). Admin uniquement.';

-- ============================================================
-- 12. Notifications sortantes : trigger sur changement de statut
--
-- Même mécanique que _push_notify : pg_net + clés stockées dans
-- _push_settings. À configurer une fois le projet déployé :
--
--   insert into public._push_settings (key, value) values
--     ('tamy_notify_url', 'https://<ref>.supabase.co/functions/v1/tamy-notify')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
--   -- la clé 'service_role_key' est déjà posée par la migration push.
-- ============================================================

create or replace function public._wa_notify(
  p_ride_id uuid,
  p_event text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_svc text;
begin
  select value into v_url from public._push_settings where key = 'tamy_notify_url';
  select value into v_svc from public._push_settings where key = 'service_role_key';
  if v_url is null or v_svc is null or v_url = '' or v_svc = '' then return; end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_svc
    ),
    body := jsonb_build_object('ride_id', p_ride_id, 'event', p_event)
  );
end;
$$;

create or replace function public._on_ride_status_change_wa()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_wa public.wa_rides;
begin
  if TG_OP <> 'UPDATE' then return NEW; end if;
  if OLD.status = NEW.status then return NEW; end if;

  select * into v_wa from public.wa_rides where ride_id = NEW.id;
  if v_wa.ride_id is null then return NEW; end if;

  -- Anti no-show : le client annule alors que le chauffeur était déjà sur place
  if NEW.status = 'cancelled_by_client' and OLD.status = 'arrived' then
    perform public.wa_register_no_show(v_wa.wa_phone, NEW.id);
  end if;

  if NEW.status in (
    'matched', 'arrived', 'in_progress', 'completed',
    'cancelled_by_client', 'cancelled_by_driver', 'expired'
  ) then
    perform public._wa_notify(NEW.id, NEW.status::text);
    update public.wa_rides
      set last_notified_status = NEW.status
      where ride_id = NEW.id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_ride_status_change_wa on public.rides;
create trigger trg_ride_status_change_wa
  after update on public.rides
  for each row execute function public._on_ride_status_change_wa();

comment on function public._on_ride_status_change_wa is
  'Notifie le client WhatsApp (edge function tamy-notify) à chaque transition de statut d''une course commandée via Tamy, et compte les absences.';

-- ============================================================
-- 13. Privilèges : les RPC Tamy sont réservées au service_role
-- ============================================================
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.wa_touch_contact(text, text)',
    'public.wa_get_session(text, text, int)',
    'public.wa_set_state(text, text, jsonb, int)',
    'public.wa_log_message(text, text, text, text, text, jsonb, text, text, text)',
    'public.wa_find_profile_by_phone(text)',
    'public.wa_link_profile(text, uuid)',
    'public.wa_has_accepted_terms(uuid, text)',
    'public.wa_accept_terms(uuid, text)',
    'public.wa_reverse_place(double precision, double precision, int)',
    'public.wa_price_menu(double precision, double precision, double precision, double precision, numeric, int, boolean, boolean)',
    'public.wa_create_ride(text, vehicle_category, double precision, double precision, text, double precision, double precision, text, numeric, int, boolean, payment_method, text)',
    'public.wa_cancel_ride(text, uuid)',
    'public.wa_active_ride(text)',
    'public.wa_ride_share_token(text, uuid)',
    'public.wa_ride_summary(uuid)',
    'public.wa_register_no_show(text, uuid, int)',
    'public._wa_notify(uuid, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- L'admin back-office peut débloquer un client depuis l'app.
revoke all on function public.wa_admin_reset_no_show(text) from public, anon;
grant execute on function public.wa_admin_reset_no_show(text) to authenticated, service_role;

-- ============================================================
-- FIN — Tamy WhatsApp
-- ============================================================
