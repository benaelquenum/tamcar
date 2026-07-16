-- ============================================================
-- TamCar — Système RDV chauffeur + formules A/B + bonus propriétaire (2026-07-15)
--
-- Remplace le lourd driver_applications par un système léger :
--   • Formulaire minimal (nom + phone + formule + créneau)
--   • Documents à apporter en présentiel au RDV (adresse TamCar)
--   • Admin approuve à l'issue de l'entrevue → crée driver + vehicle + dealer
--
-- + Formule A (cession) / B (propriétaire) distinguées sur drivers
-- + Bonus formule B : 10% du prix plafonné 100 FCFA par course
-- ============================================================

-- ------------------------------------------------------------
-- Cleanup ancien système driver_applications (allégement demandé)
-- ------------------------------------------------------------
drop function if exists public.submit_driver_application(
  text, text, text, text, text, text, text, text, text, text, int, text, int, vehicle_category, text
);
drop function if exists public.approve_driver_application(uuid);
drop function if exists public.reject_driver_application(uuid, text);
drop function if exists public.my_driver_application();
drop table if exists public.driver_applications cascade;
drop type if exists driver_application_status;

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
create type appointment_status as enum (
  'scheduled',              -- créneau réservé
  'confirmed',              -- confirmé (SMS envoyé)
  'no_show',                -- candidat absent
  'completed_approved',     -- venu + validé
  'completed_rejected',     -- venu + refusé
  'cancelled_by_user'
);

create type driver_application_type as enum (
  'cession',        -- formule A : voiture concessionnaire, cession 24 mois
  'proprietaire'    -- formule B : chauffeur avec sa propre voiture
);

-- ------------------------------------------------------------
-- Ajouter application_type sur drivers pour distinguer les 2 formules
-- ------------------------------------------------------------
alter table public.drivers
  add column application_type driver_application_type not null default 'cession';

create index drivers_application_type_idx on public.drivers(application_type);

-- ------------------------------------------------------------
-- Séquence pour numéros visiteur V0001, V0002...
-- ------------------------------------------------------------
create sequence driver_visitor_seq start 1;

-- ------------------------------------------------------------
-- Table driver_appointments
-- ------------------------------------------------------------
create table public.driver_appointments (
  id uuid primary key default gen_random_uuid(),
  visitor_number text unique not null default (
    'V' || lpad(nextval('driver_visitor_seq')::text, 4, '0')
  ),
  profile_id uuid references public.profiles(id) on delete set null,
  application_type driver_application_type not null,

  first_name text not null,
  last_name text not null,
  phone text not null,
  email text,

  slot_at timestamptz not null,
  location text not null default 'Ilot 2054, M/HOUNGBEDJI, Mènontin Cotonou',
  status appointment_status not null default 'scheduled',

  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  notes text,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1 RDV actif max par profil (permet re-postuler après rejet/annulation)
create unique index driver_appointments_active_uniq
  on public.driver_appointments (profile_id)
  where profile_id is not null
    and status in ('scheduled', 'confirmed');

-- Créneau exclusif : 1 seul RDV par slot_at
create unique index driver_appointments_slot_uniq
  on public.driver_appointments (slot_at)
  where status in ('scheduled', 'confirmed');

create index driver_appointments_status_idx on public.driver_appointments(status, slot_at);
create index driver_appointments_upcoming_idx
  on public.driver_appointments(slot_at)
  where status in ('scheduled', 'confirmed');

create trigger driver_appointments_updated_at
  before update on public.driver_appointments
  for each row execute function public.set_updated_at();

alter table public.driver_appointments enable row level security;

create policy appointments_read_own_or_admin on public.driver_appointments for select
  using (profile_id = auth.uid() or public.is_admin());

create policy appointments_insert_own on public.driver_appointments for insert
  with check (profile_id = auth.uid());

create policy appointments_update_own_scheduled_or_admin on public.driver_appointments for update
  using (
    (profile_id = auth.uid() and status in ('scheduled', 'confirmed'))
    or public.is_admin()
  );

-- ------------------------------------------------------------
-- RPC available_slots : créneaux disponibles pour les X prochains jours
-- Lun-Ven, 9h-12h + 14h-17h, tranches 30 min, hors ceux déjà réservés
-- ------------------------------------------------------------
create or replace function public.available_slots(days_ahead int default 30)
returns table (
  slot_at timestamptz,
  day_label text
)
language sql stable security invoker as $$
  with slot_hours as (
    select unnest(array[
      '09:00','09:30','10:00','10:30','11:00','11:30',
      '14:00','14:30','15:00','15:30','16:00','16:30'
    ]::text[]) as hh
  ),
  dates as (
    select generate_series(
      current_date + interval '1 day',
      current_date + (least(days_ahead, 60) || ' days')::interval,
      interval '1 day'
    )::date as d
  ),
  candidates as (
    select (d.d || ' ' || sh.hh)::timestamptz as slot_at
    from dates d
    cross join slot_hours sh
    where extract(dow from d.d) between 1 and 5
  )
  select
    c.slot_at,
    to_char(c.slot_at, 'FMDay DD FMMonth à HH24:MI') as day_label
  from candidates c
  where c.slot_at > now() + interval '2 hours'
    and not exists (
      select 1 from public.driver_appointments a
      where a.slot_at = c.slot_at
        and a.status in ('scheduled', 'confirmed')
    )
  order by c.slot_at
  limit 200;
$$;

comment on function public.available_slots is
  'Créneaux libres pour prendre RDV chauffeur. Lun-Ven 9-12h + 14-17h, tranches 30min, min 2h de préavis.';

-- ------------------------------------------------------------
-- RPC book_appointment : réservation atomique
-- ------------------------------------------------------------
create or replace function public.book_appointment(
  p_application_type driver_application_type,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_slot_at timestamptz
)
returns public.driver_appointments
language plpgsql security invoker as $$
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

  -- Refuse si créneau déjà pris
  if exists (
    select 1 from public.driver_appointments
    where slot_at = p_slot_at and status in ('scheduled', 'confirmed')
  ) then
    raise exception 'Ce créneau vient d''être réservé. Choisis-en un autre.';
  end if;

  -- Créneau dans le futur (min 2h)
  if p_slot_at < now() + interval '2 hours' then
    raise exception 'Créneau trop proche (min 2h de préavis).';
  end if;

  insert into public.driver_appointments (
    profile_id, application_type, first_name, last_name, phone, email, slot_at
  ) values (
    auth.uid(), p_application_type,
    trim(p_first_name), trim(p_last_name), trim(p_phone),
    nullif(trim(coalesce(p_email, '')), ''),
    p_slot_at
  ) returning * into result;

  return result;
end;
$$;

-- ------------------------------------------------------------
-- RPC my_appointment : le user récupère son RDV actif
-- ------------------------------------------------------------
create or replace function public.my_appointment()
returns public.driver_appointments
language sql stable security invoker as $$
  select * from public.driver_appointments
  where profile_id = auth.uid()
  order by created_at desc
  limit 1;
$$;

-- ------------------------------------------------------------
-- RPC cancel_appointment (par l'user)
-- ------------------------------------------------------------
create or replace function public.cancel_appointment(app_id uuid)
returns void
language plpgsql security invoker as $$
begin
  update public.driver_appointments
    set status = 'cancelled_by_user', updated_at = now()
    where id = app_id
      and profile_id = auth.uid()
      and status in ('scheduled', 'confirmed');
end;
$$;

-- ------------------------------------------------------------
-- RPC admin_approve_appointment
-- Crée dealer + vehicle + driver + promote role à l'issue du RDV
-- ------------------------------------------------------------
create or replace function public.admin_approve_appointment(
  app_id uuid,
  p_dealer_company_name text,
  p_dealer_rccm text,
  p_vehicle_plate text,
  p_vehicle_brand text,
  p_vehicle_model text,
  p_vehicle_year int,
  p_vehicle_color text,
  p_vehicle_seats int,
  p_vehicle_category vehicle_category,
  p_notes text default null
)
returns public.driver_appointments
language plpgsql security invoker as $$
declare
  app public.driver_appointments;
  dealer_id uuid;
  vehicle_id_v uuid;
  result public.driver_appointments;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  select * into app from public.driver_appointments where id = app_id;
  if app is null then raise exception 'Appointment not found'; end if;
  if app.profile_id is null then raise exception 'Cannot approve unauthenticated appointment'; end if;
  if app.status = 'completed_approved' then raise exception 'Already approved'; end if;

  -- Dealer partner (le chauffeur est son propre dealer pour formule B ; concessionnaire distinct pour A à venir)
  insert into public.dealer_partners (profile_id, company_name, rccm)
  values (app.profile_id, p_dealer_company_name, nullif(trim(coalesce(p_dealer_rccm, '')), ''))
  on conflict (profile_id) do update
    set company_name = excluded.company_name,
        rccm = coalesce(excluded.rccm, public.dealer_partners.rccm)
  returning id into dealer_id;

  -- Véhicule
  insert into public.vehicles (
    dealer_partner_id, plate_number, brand, model, year, color, seats, category, status
  ) values (
    dealer_id, upper(trim(p_vehicle_plate)), trim(p_vehicle_brand), trim(p_vehicle_model),
    p_vehicle_year, nullif(trim(coalesce(p_vehicle_color, '')), ''),
    p_vehicle_seats, p_vehicle_category, 'active'
  )
  on conflict (plate_number) do update
    set brand = excluded.brand,
        model = excluded.model,
        status = 'active'
  returning id into vehicle_id_v;

  -- Driver row (avec application_type)
  insert into public.drivers (
    profile_id, status, is_online, current_vehicle_id, kyc_status, application_type
  ) values (
    app.profile_id, 'active', false, vehicle_id_v, 'approved', app.application_type
  )
  on conflict (profile_id) do update
    set status = 'active',
        current_vehicle_id = vehicle_id_v,
        kyc_status = 'approved',
        application_type = excluded.application_type;

  -- Wallets manquants
  insert into public.wallets (profile_id, kind, balance_fcfa)
  values (app.profile_id, 'tamcar_revenus', 0), (app.profile_id, 'tamcar_rachat', 0)
  on conflict (profile_id, kind) do nothing;

  -- Promote profile
  update public.profiles
    set role = 'driver', full_name = trim(app.first_name || ' ' || app.last_name)
    where id = app.profile_id;

  update public.driver_appointments
    set status = 'completed_approved',
        approved_at = now(),
        approved_by = auth.uid(),
        notes = p_notes,
        updated_at = now()
    where id = app_id
  returning * into result;

  return result;
end;
$$;

-- ------------------------------------------------------------
-- RPC admin_reject_appointment
-- ------------------------------------------------------------
create or replace function public.admin_reject_appointment(
  app_id uuid,
  reason text
)
returns void
language plpgsql security invoker as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if length(trim(coalesce(reason, ''))) < 3 then
    raise exception 'Raison requise (min 3 caractères)';
  end if;

  update public.driver_appointments
    set status = 'completed_rejected',
        rejection_reason = trim(reason),
        approved_at = now(),
        approved_by = auth.uid(),
        updated_at = now()
    where id = app_id;
end;
$$;

-- ------------------------------------------------------------
-- RPC admin_mark_no_show : candidat absent au RDV
-- ------------------------------------------------------------
create or replace function public.admin_mark_no_show(app_id uuid)
returns void
language plpgsql security invoker as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update public.driver_appointments
    set status = 'no_show', updated_at = now()
    where id = app_id and status in ('scheduled', 'confirmed');
end;
$$;

-- ============================================================
-- Formule A vs B : ajustement accept_ride + trigger crédit wallets
-- ============================================================

-- ------------------------------------------------------------
-- accept_ride : recalcule les shares selon la formule du driver
-- ------------------------------------------------------------
create or replace function public.accept_ride(ride_id uuid)
returns public.rides
language plpgsql security invoker as $$
declare
  driver_row public.drivers;
  dealer_id uuid;
  result public.rides;
  total int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer_share int;
  new_platform int;
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

  select dealer_partner_id into dealer_id
   from public.vehicles where id = driver_row.current_vehicle_id;

  select price_total_fcfa into total
   from public.rides where id = ride_id;

  if driver_row.application_type = 'proprietaire' then
    -- Formule B : 80% chauffeur, 20% plateforme, pas de dealer ni rachat
    new_driver_cash := floor(total * 0.80)::int;
    new_driver_rachat := 0;
    new_dealer_share := 0;
    new_platform := total - new_driver_cash;
    -- On garde dealer_partner_id NULL pour formule B (chauffeur propriétaire indépendant)
  else
    -- Formule A (cession) : 52/5/28/15
    new_driver_cash := floor(total * 0.52)::int;
    new_driver_rachat := floor(total * 0.05)::int;
    new_dealer_share := floor(total * 0.28)::int;
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
-- Trigger crédit wallets : ajoute bonus 10% plafonné 100 F sur formule B
-- Le bonus est prélevé sur la commission plateforme
-- ------------------------------------------------------------
create or replace function public.credit_wallets_on_ride_complete()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  w_id uuid;
  driver_profile_id uuid;
  dealer_profile_id uuid;
  driver_app_type driver_application_type;
  bonus int := 0;
  total_credited_to_driver int;
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then

    if new.driver_id is not null then
      select application_type, profile_id into driver_app_type, driver_profile_id
       from public.drivers where id = new.driver_id;

      -- Bonus formule B : 10% du prix plafonné 100 F, prélevé sur platform_share
      if driver_app_type = 'proprietaire' and new.driver_share_fcfa > 0 then
        bonus := least(floor(new.price_total_fcfa * 0.10)::int, 100);
        bonus := least(bonus, new.platform_share_fcfa);
      end if;

      total_credited_to_driver := new.driver_share_fcfa + bonus;

      -- Chauffeur cash (share + bonus si formule B)
      if total_credited_to_driver > 0 then
        select id into w_id from public.wallets
          where profile_id = driver_profile_id and kind = 'tamcar_revenus';
        if w_id is not null then
          update public.wallets set balance_fcfa = balance_fcfa + total_credited_to_driver where id = w_id;
          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
          values (w_id, 'revenue_share_credit', total_credited_to_driver, new.id, 'success');
        end if;
      end if;

      -- Chauffeur rachat (formule A uniquement, driver_rachat_fcfa=0 en B)
      if new.driver_rachat_fcfa > 0 then
        select id into w_id from public.wallets
          where profile_id = driver_profile_id and kind = 'tamcar_rachat';
        if w_id is not null then
          update public.wallets set balance_fcfa = balance_fcfa + new.driver_rachat_fcfa where id = w_id;
          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
          values (w_id, 'rachat_credit', new.driver_rachat_fcfa, new.id, 'success');
        end if;
      end if;
    end if;

    -- Concessionnaire (formule A avec dealer_partner_id)
    if new.dealer_partner_id is not null and new.dealer_share_fcfa > 0 then
      select profile_id into dealer_profile_id
        from public.dealer_partners where id = new.dealer_partner_id;
      select id into w_id from public.wallets
        where profile_id = dealer_profile_id and kind = 'tamcar_revenus';
      if w_id is not null then
        update public.wallets set balance_fcfa = balance_fcfa + new.dealer_share_fcfa where id = w_id;
        insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
        values (w_id, 'revenue_share_credit', new.dealer_share_fcfa, new.id, 'success');
      end if;
    end if;

  end if;
  return new;
end;
$$;

comment on function public.credit_wallets_on_ride_complete is
  'Trigger AFTER UPDATE rides.status=completed : crédite chauffeur cash + rachat (si formule A), dealer (si formule A), et ajoute bonus 10% plafonné 100 F sur formule propriétaire (prélevé sur commission plateforme).';
