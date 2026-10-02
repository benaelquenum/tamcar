-- ============================================================
-- Locations VIP : prépayé obligatoire + photos du compteur + validation des
-- kilomètres en plus (2026-10-02)
--
-- Décisions Terence :
--   • Les locations sont PRÉPAYÉES : le client règle TamCar d'avance. Le chauffeur
--     ne peut pas démarrer une location non réglée (plus de dette de 60 % sur
--     le portefeuille du chauffeur, qui aurait existé en espèces).
--   • Kilomètres en plus : photo du compteur au départ ET à la fin (app chauffeur),
--     validation par l'équipe, puis encaissement du supplément (200 F/km par défaut
--     au-delà de 150 km/jour) qui suit le partage 40/10/30/20 comme le reste.
--
-- À passer APRÈS 20261002140000_vip_rentals.sql.
--
-- Le supplément validé puis encaissé crée une 2e course « miroir » (comptabilité) :
-- le client reçoit alors, comme pour la location, l'invitation à noter le chauffeur.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colonnes : photos, statut des kilomètres, supplément encaissé
-- ------------------------------------------------------------
alter table public.vehicle_rentals
  add column if not exists odometer_start_photo text,
  add column if not exists odometer_end_photo   text,
  add column if not exists km_status            text not null default 'none',
  add column if not exists km_validated_at      timestamptz,
  add column if not exists km_validated_by      uuid references public.profiles(id) on delete set null,
  add column if not exists extra_settled_at     timestamptz,
  add column if not exists extra_ride_id        uuid references public.rides(id) on delete set null;

alter table public.vehicle_rentals drop constraint if exists vehicle_rentals_km_status_check;
alter table public.vehicle_rentals
  add constraint vehicle_rentals_km_status_check check (km_status in ('none', 'pending', 'validated'));

-- Prépayé uniquement.
alter table public.vehicle_rentals drop constraint if exists vehicle_rentals_payment_mode_check;
alter table public.vehicle_rentals
  add constraint vehicle_rentals_payment_mode_check check (payment_mode = 'prepaid');

-- ------------------------------------------------------------
-- 2. Photos : bucket privé « rental-photos », chemin <rental_id>/<nom>.jpg
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rental-photos', 'rental-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Dépôt : le chauffeur de la location (confirmée ou en cours), dans son dossier.
do $$ begin
  create policy rental_photos_upload on storage.objects
    for insert with check (
      bucket_id = 'rental-photos'
      and exists (
        select 1
          from public.vehicle_rentals vr
          join public.drivers d on d.id = vr.driver_id
         where vr.id::text = split_part(name, '/', 1)
           and d.profile_id = auth.uid()
           and vr.status in ('confirmed', 'in_progress')
      )
    );
exception when duplicate_object then null; end $$;

-- Lecture : le chauffeur, le client de la location, l'équipe.
do $$ begin
  create policy rental_photos_read on storage.objects
    for select using (
      bucket_id = 'rental-photos'
      and (
        public.is_admin()
        or exists (
          select 1
            from public.vehicle_rentals vr
            left join public.drivers d on d.id = vr.driver_id
           where vr.id::text = split_part(name, '/', 1)
             and (vr.client_id = auth.uid() or d.profile_id = auth.uid())
        )
      )
    );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 3. Course « miroir » (comptabilité) : factorisée pour la location et son supplément
-- ------------------------------------------------------------
create or replace function public._create_rental_ride(p_rental_id uuid, p_amount int, p_label text)
returns uuid
language plpgsql security definer set search_path = public as $fn_crr$
declare
  r public.vehicle_rentals;
  drv public.drivers;
  v_dealer uuid;
  v_ride uuid;
  v_cash int;
  v_rachat int;
  v_dealer_share int;
  v_platform int;
begin
  select * into r from public.vehicle_rentals where id = p_rental_id;
  if r.id is null then raise exception 'Location introuvable.'; end if;
  select * into drv from public.drivers where id = r.driver_id;
  select dealer_partner_id into v_dealer from public.vehicles where id = r.vehicle_id;

  -- Partage identique à accept_ride.
  if drv.application_type = 'proprietaire' then
    v_cash := floor(p_amount * 0.80)::int;
    v_rachat := 0;
    v_dealer_share := 0;
    v_platform := p_amount - v_cash;
    v_dealer := null;
  else
    v_cash := floor(p_amount * 0.40)::int;
    v_rachat := floor(p_amount * 0.10)::int;
    v_dealer_share := floor(p_amount * 0.30)::int;
    v_platform := p_amount - v_cash - v_rachat - v_dealer_share;
  end if;

  -- Prépayé : payment_method NULL = TamCar détient l'argent (le chauffeur est crédité de sa part).
  insert into public.rides (
    client_id, driver_id, vehicle_id, dealer_partner_id,
    pickup_location, pickup_address, dropoff_location, dropoff_address,
    distance_km, duration_min,
    price_total_fcfa, driver_share_fcfa, driver_rachat_fcfa, dealer_share_fcfa, platform_share_fcfa,
    status, payment_method, requested_category,
    requested_at, matched_at, started_at, with_ac
  ) values (
    r.client_id, r.driver_id, r.vehicle_id, v_dealer,
    r.pickup_location, r.pickup_address, r.pickup_location, p_label,
    0, r.hours * 60,
    p_amount, v_cash, v_rachat, v_dealer_share, v_platform,
    'in_progress', null, r.category,
    coalesce(r.confirmed_at, r.created_at), coalesce(r.confirmed_at, r.created_at),
    coalesce(r.started_at, now()), true
  ) returning id into v_ride;

  update public.rides
     set status = 'completed', ended_at = now(), updated_at = now()
   where id = v_ride;

  return v_ride;
end;
$fn_crr$;

revoke all on function public._create_rental_ride(uuid, int, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Chauffeur : démarrer (location réglée + compteur + photo), terminer (compteur + photo)
-- ------------------------------------------------------------
drop function if exists public.driver_start_vehicle_rental(uuid, int);
drop function if exists public.driver_complete_vehicle_rental(uuid, int);

create or replace function public.driver_start_vehicle_rental(
  p_id uuid,
  p_odometer_start int,
  p_photo_path text
)
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
  if r.paid_fcfa < r.price_fcfa then
    raise exception 'Cette location n''est pas encore réglée à TamCar : contacte l''équipe avant de démarrer.';
  end if;
  if p_odometer_start is null or p_odometer_start < 0 then
    raise exception 'Indique le kilométrage du compteur.';
  end if;
  if p_photo_path is null or split_part(p_photo_path, '/', 1) <> p_id::text then
    raise exception 'La photo du compteur est obligatoire.';
  end if;

  update public.vehicle_rentals
     set status = 'in_progress', started_at = now(),
         odometer_start = p_odometer_start, odometer_start_photo = p_photo_path,
         updated_at = now()
   where id = p_id
   returning * into r;

  -- Pendant la location, le véhicule ne reçoit aucune demande de course.
  update public.drivers set is_online = false, updated_at = now() where id = v_drv and is_online;
  return r;
end;
$fn_dstart$;

revoke all on function public.driver_start_vehicle_rental(uuid, int, text) from public, anon;
grant execute on function public.driver_start_vehicle_rental(uuid, int, text) to authenticated;

create or replace function public.driver_complete_vehicle_rental(
  p_id uuid,
  p_odometer_end int,
  p_photo_path text
)
returns public.vehicle_rentals
language plpgsql security definer set search_path = public as $fn_dcomp$
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
    v_days := greatest(1, ceil(extract(epoch from (r.ends_at - r.starts_at)) / 86400.0)::int);
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
$fn_dcomp$;

revoke all on function public.driver_complete_vehicle_rental(uuid, int, text) from public, anon;
grant execute on function public.driver_complete_vehicle_rental(uuid, int, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Équipe : valider les kilomètres, encaisser le supplément
-- ------------------------------------------------------------
create or replace function public.admin_validate_rental_km(
  p_id uuid,
  p_odometer_start int,
  p_odometer_end int
)
returns public.vehicle_rentals
language plpgsql security definer set search_path = public as $fn_avk$
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
  v_days := greatest(1, ceil(extract(epoch from (r.ends_at - r.starts_at)) / 86400.0)::int);
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
$fn_avk$;

revoke all on function public.admin_validate_rental_km(uuid, int, int) from public, anon;
grant execute on function public.admin_validate_rental_km(uuid, int, int) to authenticated;

create or replace function public.admin_settle_rental_extra(p_id uuid)
returns public.vehicle_rentals
language plpgsql security definer set search_path = public as $fn_ase$
declare
  r public.vehicle_rentals;
  v_ride uuid;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;

  select * into r from public.vehicle_rentals where id = p_id for update;
  if r.id is null then raise exception 'Location introuvable.'; end if;
  if r.km_status <> 'validated' then raise exception 'Validez d''abord les kilomètres.'; end if;
  if coalesce(r.extra_fcfa, 0) <= 0 then raise exception 'Aucun supplément à encaisser.'; end if;
  if r.extra_settled_at is not null then raise exception 'Supplément déjà encaissé.'; end if;

  -- L'équipe confirme avoir encaissé le supplément : il suit le partage habituel.
  v_ride := public._create_rental_ride(r.id, r.extra_fcfa, 'Supplément kilométrique · ' || r.extra_km || ' km');

  update public.vehicle_rentals
     set extra_settled_at = now(), extra_ride_id = v_ride, updated_at = now()
   where id = p_id
   returning * into r;
  return r;
end;
$fn_ase$;

revoke all on function public.admin_settle_rental_extra(uuid) from public, anon;
grant execute on function public.admin_settle_rental_extra(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. Listes : colonnes supplémentaires (paiement, km, photos, supplément)
-- ------------------------------------------------------------
drop function if exists public.my_vehicle_rentals(text);

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
  is_upcoming boolean,
  km_used int,
  extra_km int,
  extra_fcfa int,
  km_status text,
  extra_settled boolean
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
      (vr.status in ('requested', 'confirmed', 'in_progress') and vr.ends_at > now()) as is_upcoming,
      vr.km_used, vr.extra_km,
      -- Le supplément n'est montré au client qu'une fois validé par l'équipe.
      case when vr.km_status = 'validated' then vr.extra_fcfa end as extra_fcfa,
      vr.km_status,
      (vr.extra_settled_at is not null) as extra_settled
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

drop function if exists public.admin_vehicle_rentals(text);

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
  created_at timestamptz,
  odometer_start int,
  odometer_end int,
  odometer_start_photo text,
  odometer_end_photo text,
  km_status text,
  extra_settled boolean,
  km_included_per_day int,
  km_extra_fcfa int
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
    vr.late_cancel, vr.cancel_reason, vr.created_at,
    vr.odometer_start, vr.odometer_end, vr.odometer_start_photo, vr.odometer_end_photo,
    vr.km_status, (vr.extra_settled_at is not null),
    vr.km_included_per_day, vr.km_extra_fcfa
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

drop function if exists public.driver_my_vehicle_rentals(text);

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
  is_upcoming boolean,
  is_paid boolean
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
      (vr.status in ('confirmed', 'in_progress') and vr.ends_at > now()) as is_upcoming,
      (vr.paid_fcfa >= vr.price_fcfa) as is_paid
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

-- ------------------------------------------------------------
-- 7. Notification de confirmation : rappelle le règlement d'avance
-- ------------------------------------------------------------
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
    'Le ' || v_when || ' · ' || r.hours || ' h · ' || coalesce(v_driver_name, 'votre chauffeur') || ' sera votre chauffeur.'
      || case when r.paid_fcfa < r.price_fcfa
              then ' À régler à TamCar avant le début : ' || (r.price_fcfa - r.paid_fcfa) || ' F.'
              else '' end,
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
