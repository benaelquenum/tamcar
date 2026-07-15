-- ============================================================
-- TamCar — Onboarding chauffeur bout-en-bout (2026-07-15)
--
-- Table driver_applications + RLS + RPCs :
--   submit_driver_application(...) : chauffeur candidate
--   approve_driver_application(id) : admin approuve, crée dealer + vehicle + driver + promote role
--   reject_driver_application(id, reason) : admin refuse
-- ============================================================

create type driver_application_status as enum (
  'submitted',   -- soumise par le candidat
  'in_review',   -- prise en charge par admin
  'approved',    -- validée + driver créé
  'rejected'     -- refusée avec raison
);

create table public.driver_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status driver_application_status not null default 'submitted',

  -- Identité
  first_name text not null,
  last_name text not null,
  phone text not null,

  -- Documents personnels (path dans bucket driver-docs)
  id_card_url text not null,
  driver_license_url text not null,

  -- Concessionnaire proposé (peut être son propre nom si autoentrepreneur)
  dealer_company_name text not null,
  dealer_rccm text,

  -- Véhicule
  vehicle_plate text not null,
  vehicle_brand text not null,
  vehicle_model text not null,
  vehicle_year int,
  vehicle_color text,
  vehicle_seats int not null default 4 check (vehicle_seats > 0),
  vehicle_category vehicle_category not null default 'essentiel',
  vehicle_registration_url text not null,

  -- Meta traçabilité
  created_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  updated_at timestamptz not null default now()
);

-- Une seule candidature "en cours" par user (permet re-postuler après rejet)
create unique index driver_applications_active_unique
  on public.driver_applications (profile_id)
  where status in ('submitted', 'in_review');

create index driver_applications_status_idx on public.driver_applications(status, submitted_at desc);
create index driver_applications_profile_idx on public.driver_applications(profile_id);

create trigger driver_applications_updated_at
  before update on public.driver_applications
  for each row execute function public.set_updated_at();

alter table public.driver_applications enable row level security;

create policy applications_read_own_or_admin on public.driver_applications for select
  using (profile_id = auth.uid() or public.is_admin());

create policy applications_insert_own on public.driver_applications for insert
  with check (profile_id = auth.uid());

create policy applications_update_own_draft_or_admin on public.driver_applications for update
  using (
    (profile_id = auth.uid() and status in ('submitted', 'rejected'))
    or public.is_admin()
  );

-- ------------------------------------------------------------
-- submit_driver_application : crée ou remplace la candidature du user
-- ------------------------------------------------------------
create or replace function public.submit_driver_application(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_id_card_url text,
  p_driver_license_url text,
  p_dealer_company_name text,
  p_dealer_rccm text,
  p_vehicle_plate text,
  p_vehicle_brand text,
  p_vehicle_model text,
  p_vehicle_year int,
  p_vehicle_color text,
  p_vehicle_seats int,
  p_vehicle_category vehicle_category,
  p_vehicle_registration_url text
)
returns public.driver_applications
language plpgsql security invoker as $$
declare
  result public.driver_applications;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  -- Refuse si déjà driver actif
  if exists (
    select 1 from public.drivers where profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Tu es déjà chauffeur TamCar actif';
  end if;

  -- Supprime les anciennes candidatures rejetées avant de resoumettre
  delete from public.driver_applications
   where profile_id = auth.uid() and status = 'rejected';

  insert into public.driver_applications (
    profile_id, status,
    first_name, last_name, phone,
    id_card_url, driver_license_url,
    dealer_company_name, dealer_rccm,
    vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, vehicle_color,
    vehicle_seats, vehicle_category, vehicle_registration_url,
    submitted_at
  ) values (
    auth.uid(), 'submitted',
    trim(p_first_name), trim(p_last_name), trim(p_phone),
    p_id_card_url, p_driver_license_url,
    trim(p_dealer_company_name), nullif(trim(coalesce(p_dealer_rccm, '')), ''),
    upper(trim(p_vehicle_plate)), trim(p_vehicle_brand), trim(p_vehicle_model),
    p_vehicle_year, nullif(trim(coalesce(p_vehicle_color, '')), ''),
    p_vehicle_seats, p_vehicle_category, p_vehicle_registration_url,
    now()
  ) returning * into result;

  return result;
end;
$$;

-- ------------------------------------------------------------
-- approve_driver_application : ADMIN — crée dealer_partner + vehicle + driver + promote role
-- ------------------------------------------------------------
create or replace function public.approve_driver_application(app_id uuid)
returns public.driver_applications
language plpgsql security invoker as $$
declare
  app public.driver_applications;
  dealer_id uuid;
  vehicle_id_v uuid;
  result public.driver_applications;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  select * into app from public.driver_applications where id = app_id;
  if app is null then raise exception 'Application not found'; end if;
  if app.status = 'approved' then raise exception 'Already approved'; end if;

  -- Dealer partner : rattaché au profile du chauffeur (auto-employé au démarrage).
  -- Un vrai concessionnaire multi-véhicules sera géré manuellement plus tard.
  insert into public.dealer_partners (profile_id, company_name, rccm)
  values (app.profile_id, app.dealer_company_name, app.dealer_rccm)
  on conflict (profile_id) do update
    set company_name = excluded.company_name,
        rccm = coalesce(excluded.rccm, public.dealer_partners.rccm)
  returning id into dealer_id;

  -- Véhicule
  insert into public.vehicles (
    dealer_partner_id, plate_number, brand, model, year, color, seats, category, status
  ) values (
    dealer_id, app.vehicle_plate, app.vehicle_brand, app.vehicle_model,
    app.vehicle_year, app.vehicle_color, app.vehicle_seats, app.vehicle_category, 'active'
  )
  on conflict (plate_number) do update
    set brand = excluded.brand,
        model = excluded.model,
        year = excluded.year,
        color = excluded.color,
        status = 'active'
  returning id into vehicle_id_v;

  -- Driver row (nouveau ou update)
  insert into public.drivers (
    profile_id, status, is_online, current_vehicle_id, kyc_status,
    license_number, id_card_number
  ) values (
    app.profile_id, 'active', false, vehicle_id_v, 'approved',
    null, null
  )
  on conflict (profile_id) do update
    set status = 'active',
        current_vehicle_id = vehicle_id_v,
        kyc_status = 'approved';

  -- Wallets manquants pour driver
  insert into public.wallets (profile_id, kind, balance_fcfa)
  values (app.profile_id, 'tamcar_revenus', 0), (app.profile_id, 'tamcar_rachat', 0)
  on conflict (profile_id, kind) do nothing;

  -- Promote profile
  update public.profiles
    set role = 'driver', full_name = trim(app.first_name || ' ' || app.last_name)
    where id = app.profile_id;

  update public.driver_applications
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        updated_at = now()
    where id = app_id
  returning * into result;

  return result;
end;
$$;

-- ------------------------------------------------------------
-- reject_driver_application : ADMIN — refuse avec raison
-- ------------------------------------------------------------
create or replace function public.reject_driver_application(
  app_id uuid,
  reason text
)
returns public.driver_applications
language plpgsql security invoker as $$
declare
  result public.driver_applications;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if length(trim(coalesce(reason, ''))) < 3 then
    raise exception 'Raison requise (min 3 caractères)';
  end if;

  update public.driver_applications
    set status = 'rejected',
        rejection_reason = trim(reason),
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        updated_at = now()
    where id = app_id
  returning * into result;

  if result is null then raise exception 'Application not found'; end if;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- my_driver_application : RPC pour que le user connaisse sa candidature en cours
-- ------------------------------------------------------------
create or replace function public.my_driver_application()
returns public.driver_applications
language sql stable security invoker as $$
  select * from public.driver_applications
  where profile_id = auth.uid()
  order by created_at desc
  limit 1;
$$;
