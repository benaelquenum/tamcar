-- ============================================================
-- Phase 1 (partie 2/2) : gestion de flotte admin (concessionnaires,
-- chauffeurs, véhicules). Toute création/modif passe par les RPCs
-- admin_* qui vérifient is_admin() en interne.
--
-- Nouveautés schéma :
--   • vehicles.dealer_partner_id → nullable (formule B autorisée)
--   • vehicles.owner_profile_id (chauffeur propriétaire, formule B)
--   • vehicles.activated_at / activated_by (mise en service)
--   • drivers.archived_at / archived_by / archive_reason (soft-delete)
--   • dealer_partners.archived_at / archived_by / archive_reason
--
-- RPCs livrés :
--   • admin_register_dealer(phone, full_name, company_name, rccm?, share_pct?, shareholder?)
--   • admin_register_driver(phone, full_name, application_type, license?, id_card?)
--   • admin_register_vehicle(plate, brand, model, category, formula,
--       dealer_partner_id?, owner_profile_id?, year?, color?, seats?)
--   • admin_activate_vehicle(vehicle_id)
--   • admin_assign_vehicle_to_driver(driver_id, vehicle_id)
--   • admin_suspend_driver(driver_id, reason?)
--   • admin_unsuspend_driver(driver_id)
--   • admin_archive_driver(driver_id, reason)
--   • admin_archive_dealer(dealer_id, reason)
--
-- Vues admin :
--   • driver_admin_view : identité + formule + gains cumulés + rating
--   • dealer_gains_view : CA cumulé par dealer_partner
-- ============================================================

-- ------------------------------------------------------------
-- 1. Alter tables
-- ------------------------------------------------------------
alter table public.vehicles
  alter column dealer_partner_id drop not null,
  add column if not exists owner_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid references public.profiles(id);

alter table public.drivers
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text;

alter table public.dealer_partners
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text;

-- Contrainte métier : cohérence formule ↔ propriétaire
alter table public.vehicles
  drop constraint if exists vehicles_formula_owner_check;
alter table public.vehicles
  add constraint vehicles_formula_owner_check
  check (
    (dealer_partner_id is not null and owner_profile_id is null) -- formule A
    or
    (dealer_partner_id is null and owner_profile_id is not null) -- formule B
  );

-- ------------------------------------------------------------
-- 2. Helper : upsert profile pour ces users créés par admin.
--    Les concessionnaires et chauffeurs ne se connectent pas
--    forcément immédiatement — on crée juste leur profile.
-- ------------------------------------------------------------
create or replace function public._admin_upsert_profile(
  p_phone text,
  p_full_name text,
  p_role user_role
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  -- 1. Cherche par phone (uniqueness sur profiles.phone)
  select id into existing_id from public.profiles where phone = p_phone;
  if existing_id is not null then
    update public.profiles set full_name = coalesce(p_full_name, full_name), role = p_role
      where id = existing_id;
    return existing_id;
  end if;

  -- 2. Sinon, crée une entrée auth.users vide + profile.
  -- (Note : le user pourra se connecter via magic link email plus tard
  --  car aucune password n'est set. Le phone reste la clé)
  new_id := gen_random_uuid();
  insert into public.profiles (id, phone, full_name, role)
    values (new_id, p_phone, p_full_name, p_role);
  return new_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. admin_register_dealer
-- ------------------------------------------------------------
create or replace function public.admin_register_dealer(
  p_phone text,
  p_full_name text,
  p_company_name text,
  p_rccm text default null,
  p_share_pct numeric default 25.0,
  p_is_shareholder boolean default false,
  p_shareholder_pct numeric default null
)
returns public.dealer_partners
language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
  result public.dealer_partners;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  v_profile_id := public._admin_upsert_profile(p_phone, p_full_name, 'dealer');

  insert into public.dealer_partners
    (profile_id, company_name, rccm, dealer_share_pct, is_shareholder, shareholder_pct)
    values (v_profile_id, p_company_name, p_rccm, p_share_pct, p_is_shareholder, p_shareholder_pct)
    returning * into result;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- 4. admin_register_driver
-- ------------------------------------------------------------
create or replace function public.admin_register_driver(
  p_phone text,
  p_full_name text,
  p_application_type driver_application_type,
  p_license text default null,
  p_id_card text default null
)
returns public.drivers
language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
  result public.drivers;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  v_profile_id := public._admin_upsert_profile(p_phone, p_full_name, 'driver');

  insert into public.drivers
    (profile_id, application_type, license_number, id_card_number, status, kyc_status)
    values (v_profile_id, p_application_type, p_license, p_id_card, 'active', 'approved')
    on conflict (profile_id) do update
      set application_type = excluded.application_type,
          license_number = coalesce(excluded.license_number, drivers.license_number),
          id_card_number = coalesce(excluded.id_card_number, drivers.id_card_number),
          status = 'active',
          kyc_status = 'approved',
          updated_at = now()
    returning * into result;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- 5. admin_register_vehicle
--
-- formula 'cession' → dealer_partner_id obligatoire
-- formula 'proprietaire' → owner_profile_id obligatoire (= driver.profile_id)
-- ------------------------------------------------------------
create or replace function public.admin_register_vehicle(
  p_plate text,
  p_brand text,
  p_model text,
  p_category vehicle_category,
  p_formula driver_application_type,
  p_dealer_partner_id uuid default null,
  p_owner_profile_id uuid default null,
  p_year int default null,
  p_color text default null,
  p_seats int default 4
)
returns public.vehicles
language plpgsql security definer set search_path = public as $$
declare
  result public.vehicles;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  if p_formula = 'cession' then
    if p_dealer_partner_id is null then
      raise exception 'Formule cession : dealer_partner_id requis';
    end if;
    if p_owner_profile_id is not null then
      raise exception 'Formule cession : owner_profile_id doit rester null';
    end if;
  else -- proprietaire
    if p_owner_profile_id is null then
      raise exception 'Formule propriétaire : owner_profile_id (chauffeur) requis';
    end if;
    if p_dealer_partner_id is not null then
      raise exception 'Formule propriétaire : dealer_partner_id doit rester null';
    end if;
  end if;

  insert into public.vehicles
    (dealer_partner_id, owner_profile_id, plate_number, brand, model,
     year, color, seats, category, status)
    values (
      p_dealer_partner_id, p_owner_profile_id,
      upper(trim(p_plate)), trim(p_brand), trim(p_model),
      p_year, p_color, p_seats, p_category, 'pending'
    )
    returning * into result;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- 6. admin_activate_vehicle
-- ------------------------------------------------------------
create or replace function public.admin_activate_vehicle(p_vehicle_id uuid)
returns public.vehicles
language plpgsql security definer set search_path = public as $$
declare
  result public.vehicles;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  update public.vehicles
    set status = 'active',
        activated_at = now(),
        activated_by = auth.uid(),
        updated_at = now()
    where id = p_vehicle_id and status = 'pending'
    returning * into result;
  if result is null then raise exception 'Vehicle inconnue ou non pending'; end if;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- 7. admin_assign_vehicle_to_driver
-- ------------------------------------------------------------
create or replace function public.admin_assign_vehicle_to_driver(
  p_driver_id uuid,
  p_vehicle_id uuid
)
returns public.drivers
language plpgsql security definer set search_path = public as $$
declare
  d public.drivers;
  v public.vehicles;
  result public.drivers;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select * into d from public.drivers where id = p_driver_id;
  if d is null then raise exception 'Driver inconnu'; end if;
  if d.status not in ('active') then raise exception 'Driver non actif'; end if;

  select * into v from public.vehicles where id = p_vehicle_id;
  if v is null then raise exception 'Vehicle inconnu'; end if;
  if v.status <> 'active' then raise exception 'Vehicle non activé'; end if;

  -- Cohérence formule ↔ propriété
  if d.application_type = 'cession' and v.dealer_partner_id is null then
    raise exception 'Chauffeur en cession → véhicule doit avoir un dealer_partner';
  end if;
  if d.application_type = 'proprietaire' and v.owner_profile_id <> d.profile_id then
    raise exception 'Chauffeur propriétaire → véhicule doit lui appartenir';
  end if;

  update public.drivers set current_vehicle_id = p_vehicle_id, updated_at = now()
    where id = p_driver_id
    returning * into result;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- 8. Suspend / Unsuspend / Archive driver
-- ------------------------------------------------------------
create or replace function public.admin_suspend_driver(p_driver_id uuid, p_reason text default null)
returns public.drivers
language plpgsql security definer set search_path = public as $$
declare
  result public.drivers;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  update public.drivers
    set status = 'suspended', is_online = false, updated_at = now()
    where id = p_driver_id
    returning * into result;
  return result;
end;
$$;

create or replace function public.admin_unsuspend_driver(p_driver_id uuid)
returns public.drivers
language plpgsql security definer set search_path = public as $$
declare
  result public.drivers;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  update public.drivers
    set status = 'active', updated_at = now()
    where id = p_driver_id
    returning * into result;
  return result;
end;
$$;

create or replace function public.admin_archive_driver(p_driver_id uuid, p_reason text)
returns public.drivers
language plpgsql security definer set search_path = public as $$
declare
  result public.drivers;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  update public.drivers
    set status = 'archived', is_online = false,
        archived_at = now(), archived_by = auth.uid(), archive_reason = p_reason,
        current_vehicle_id = null, updated_at = now()
    where id = p_driver_id
    returning * into result;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- 9. Archive dealer (soft-delete)
-- ------------------------------------------------------------
create or replace function public.admin_archive_dealer(p_dealer_id uuid, p_reason text)
returns public.dealer_partners
language plpgsql security definer set search_path = public as $$
declare
  result public.dealer_partners;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  update public.dealer_partners
    set archived_at = now(), archived_by = auth.uid(), archive_reason = p_reason
    where id = p_dealer_id
    returning * into result;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- 10. Vue admin détaillée pour chauffeurs
-- ------------------------------------------------------------
drop view if exists public.driver_admin_view cascade;
create or replace view public.driver_admin_view
with (security_invoker = true)
as
select
  d.id as driver_id,
  d.profile_id,
  p.full_name,
  p.phone,
  p.avatar_url,
  d.application_type,
  d.status,
  d.kyc_status,
  d.is_online,
  d.license_number,
  d.id_card_number,
  d.rating_avg,
  d.rating_count,
  d.current_vehicle_id,
  d.created_at as registered_at,
  d.archived_at,
  d.archive_reason,
  coalesce((
    select sum(r.driver_share_fcfa) from public.rides r
    where r.driver_id = d.id and r.status = 'completed'
  ), 0)::bigint as total_cash_fcfa,
  coalesce((
    select sum(r.driver_rachat_fcfa) from public.rides r
    where r.driver_id = d.id and r.status = 'completed'
  ), 0)::bigint as total_rachat_fcfa,
  coalesce((
    select count(*) from public.rides r
    where r.driver_id = d.id and r.status = 'completed'
  ), 0)::int as completed_rides_count,
  coalesce((
    select count(*) from public.rides r
    where r.driver_id = d.id and r.status = 'cancelled_by_driver'
  ), 0)::int as cancelled_by_driver_count
from public.drivers d
join public.profiles p on p.id = d.profile_id;

grant select on public.driver_admin_view to authenticated;

-- ------------------------------------------------------------
-- 11. Vue admin détaillée pour dealer_partners
-- ------------------------------------------------------------
drop view if exists public.dealer_admin_view cascade;
create or replace view public.dealer_admin_view
with (security_invoker = true)
as
select
  dp.id as dealer_id,
  dp.profile_id,
  p.full_name,
  p.phone,
  dp.company_name,
  dp.rccm,
  dp.dealer_share_pct,
  dp.is_shareholder,
  dp.shareholder_pct,
  dp.created_at as registered_at,
  dp.archived_at,
  dp.archive_reason,
  coalesce((
    select count(*) from public.vehicles v
    where v.dealer_partner_id = dp.id and v.status = 'active'
  ), 0)::int as active_vehicles_count,
  coalesce((
    select sum(r.dealer_share_fcfa) from public.rides r
    where r.dealer_partner_id = dp.id and r.status = 'completed'
  ), 0)::bigint as total_dealer_share_fcfa,
  coalesce((
    select count(*) from public.rides r
    where r.dealer_partner_id = dp.id and r.status = 'completed'
  ), 0)::int as completed_rides_count
from public.dealer_partners dp
join public.profiles p on p.id = dp.profile_id;

grant select on public.dealer_admin_view to authenticated;

-- ------------------------------------------------------------
-- 12. Vue admin détaillée pour vehicles (avec dealer + driver assigné)
-- ------------------------------------------------------------
drop view if exists public.vehicle_admin_view cascade;
create or replace view public.vehicle_admin_view
with (security_invoker = true)
as
select
  v.id as vehicle_id,
  v.plate_number,
  v.brand,
  v.model,
  v.year,
  v.color,
  v.category,
  v.status,
  v.dealer_partner_id,
  v.owner_profile_id,
  v.activated_at,
  v.created_at,
  case
    when v.dealer_partner_id is not null then 'cession'
    else 'proprietaire'
  end as formula,
  dp.company_name as dealer_company,
  op.full_name as owner_full_name,
  (select d.id from public.drivers d where d.current_vehicle_id = v.id limit 1) as assigned_driver_id,
  (select p.full_name from public.drivers d
    join public.profiles p on p.id = d.profile_id
    where d.current_vehicle_id = v.id limit 1) as assigned_driver_name
from public.vehicles v
left join public.dealer_partners dp on dp.id = v.dealer_partner_id
left join public.profiles op on op.id = v.owner_profile_id;

grant select on public.vehicle_admin_view to authenticated;

-- ------------------------------------------------------------
-- Grants RPC
-- ------------------------------------------------------------
grant execute on function public.admin_register_dealer(text, text, text, text, numeric, boolean, numeric) to authenticated;
grant execute on function public.admin_register_driver(text, text, driver_application_type, text, text) to authenticated;
grant execute on function public.admin_register_vehicle(text, text, text, vehicle_category, driver_application_type, uuid, uuid, int, text, int) to authenticated;
grant execute on function public.admin_activate_vehicle(uuid) to authenticated;
grant execute on function public.admin_assign_vehicle_to_driver(uuid, uuid) to authenticated;
grant execute on function public.admin_suspend_driver(uuid, text) to authenticated;
grant execute on function public.admin_unsuspend_driver(uuid) to authenticated;
grant execute on function public.admin_archive_driver(uuid, text) to authenticated;
grant execute on function public.admin_archive_dealer(uuid, text) to authenticated;
