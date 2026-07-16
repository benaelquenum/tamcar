-- ============================================================
-- Vague B : Arrêts intermédiaires en cours de course (2026-07-16)
--
-- Le client peut ajouter jusqu'à 2 arrêts pendant la course.
-- • Recalcul du prix : distance additionnelle × km_city_fcfa de la catégorie
-- • Attente gratuite 3 min à chaque arrêt, puis 40 F/min
-- • Frais d'attente split 50-50 chauffeur/plateforme (comme les pénalités)
-- ============================================================

-- ------------------------------------------------------------
-- Enum status stop
-- ------------------------------------------------------------
create type ride_stop_status as enum (
  'pending',     -- créé par le client, en attente chauffeur
  'accepted',    -- chauffeur a accepté
  'arrived',     -- chauffeur est à l'arrêt (timer d'attente démarre)
  'departed',    -- chauffeur repart (attente terminée)
  'cancelled'    -- annulé (client change d'avis avant accept, ou refus)
);

-- ------------------------------------------------------------
-- Table ride_stops
-- ------------------------------------------------------------
create table public.ride_stops (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  order_idx int not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  status ride_stop_status not null default 'pending',
  added_at timestamptz not null default now(),
  accepted_at timestamptz,
  arrived_at timestamptz,
  departed_at timestamptz,
  extra_km_added numeric,
  extra_price_fcfa int not null default 0,
  waiting_seconds int,
  waiting_extra_fee_fcfa int not null default 0,
  unique (ride_id, order_idx)
);

create index ride_stops_ride_idx on public.ride_stops(ride_id, order_idx);

alter table public.ride_stops enable row level security;

create policy stops_read_involved on public.ride_stops for select
  using (
    ride_id in (
      select id from public.rides
      where client_id = auth.uid()
        or driver_id in (select id from public.drivers where profile_id = auth.uid())
    )
    or public.is_admin()
  );

-- Modifications via RPC uniquement (SECURITY DEFINER contrôlent l'accès)

-- ------------------------------------------------------------
-- Colonnes sommaires sur rides
-- ------------------------------------------------------------
alter table public.rides
  add column if not exists stops_count int not null default 0,
  add column if not exists stops_extra_price_fcfa int not null default 0,
  add column if not exists stops_waiting_fee_fcfa int not null default 0;

-- ------------------------------------------------------------
-- add_ride_stop : le client ajoute un arrêt (max 2)
-- Le total_km / total_min sont calculés côté client via Mapbox Directions
-- ------------------------------------------------------------
create or replace function public.add_ride_stop(
  p_ride_id uuid,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_new_total_km numeric,
  p_new_total_min int
)
returns public.ride_stops
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  v_category vehicle_category;
  km_price int;
  active_stops int;
  next_order int;
  extra_km numeric;
  extra_price int;
  result public.ride_stops;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer int;
  new_platform int;
  driver_app_type driver_application_type;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Cette course n''accepte plus de nouvel arrêt.';
  end if;

  select count(*)::int into active_stops
   from public.ride_stops
   where ride_id = p_ride_id
     and status <> 'cancelled';
  if active_stops >= 2 then raise exception 'Maximum 2 arrêts autorisés.'; end if;

  next_order := active_stops + 1;
  extra_km := greatest(0, p_new_total_km - r.distance_km);

  -- Tarif km selon la catégorie du véhicule (ou fallback essentiel)
  select v.category into v_category
    from public.vehicles v where v.id = r.vehicle_id;
  select km_city_fcfa into km_price
    from public.category_pricing_tiers
    where category = coalesce(v_category, 'essentiel'::vehicle_category);

  extra_price := ceil(extra_km * coalesce(km_price, 90))::int;

  insert into public.ride_stops (
    ride_id, order_idx, address, lat, lng, extra_km_added, extra_price_fcfa
  ) values (
    p_ride_id, next_order, p_address, p_lat, p_lng, extra_km, extra_price
  ) returning * into result;

  -- Recompute total price + shares
  if r.driver_id is not null then
    select application_type into driver_app_type
     from public.drivers where id = r.driver_id;
  end if;

  declare new_total int := r.price_total_fcfa + extra_price;
  begin
    if driver_app_type = 'proprietaire' then
      new_driver_cash := floor(new_total * 0.80)::int;
      new_driver_rachat := 0;
      new_dealer := 0;
      new_platform := new_total - new_driver_cash;
    else
      new_driver_cash := floor(new_total * 0.40)::int;
      new_driver_rachat := floor(new_total * 0.10)::int;
      new_dealer := floor(new_total * 0.30)::int;
      new_platform := new_total - new_driver_cash - new_driver_rachat - new_dealer;
    end if;

    update public.rides
    set stops_count = stops_count + 1,
        stops_extra_price_fcfa = stops_extra_price_fcfa + extra_price,
        price_total_fcfa = new_total,
        driver_share_fcfa = new_driver_cash,
        driver_rachat_fcfa = new_driver_rachat,
        dealer_share_fcfa = new_dealer,
        platform_share_fcfa = new_platform,
        distance_km = p_new_total_km,
        duration_min = p_new_total_min,
        updated_at = now()
    where id = p_ride_id;
  end;

  return result;
end;
$$;

comment on function public.add_ride_stop is
  'Client ajoute un arrêt intermédiaire (max 2). Recalcule prix total + shares. Le chauffeur doit ensuite accepter via driver_accept_stop.';

-- ------------------------------------------------------------
-- Contrôle d'accès chauffeur commun
-- ------------------------------------------------------------
create or replace function public._assert_stop_driver(p_stop_id uuid)
returns public.ride_stops
language plpgsql stable security definer set search_path = public as $$
declare
  s public.ride_stops;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select rs.* into s from public.ride_stops rs where rs.id = p_stop_id;
  if s is null then raise exception 'Stop not found'; end if;
  if not exists (
    select 1 from public.rides r
    join public.drivers d on d.id = r.driver_id
    where r.id = s.ride_id and d.profile_id = auth.uid()
  ) and not public.is_admin() then
    raise exception 'Not the driver of this ride';
  end if;
  return s;
end;
$$;

-- ------------------------------------------------------------
-- driver_accept_stop : le chauffeur valide un stop pending
-- ------------------------------------------------------------
create or replace function public.driver_accept_stop(p_stop_id uuid)
returns public.ride_stops
language plpgsql security definer set search_path = public as $$
declare
  s public.ride_stops;
  result public.ride_stops;
begin
  s := public._assert_stop_driver(p_stop_id);
  if s.status <> 'pending' then raise exception 'Stop déjà traité'; end if;

  update public.ride_stops
  set status = 'accepted', accepted_at = now()
  where id = p_stop_id
  returning * into result;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- driver_arrive_at_stop : chauffeur arrive à l'arrêt → timer démarre
-- ------------------------------------------------------------
create or replace function public.driver_arrive_at_stop(p_stop_id uuid)
returns public.ride_stops
language plpgsql security definer set search_path = public as $$
declare
  s public.ride_stops;
  result public.ride_stops;
begin
  s := public._assert_stop_driver(p_stop_id);
  if s.status <> 'accepted' then raise exception 'Stop non accepté'; end if;

  update public.ride_stops
  set status = 'arrived', arrived_at = now()
  where id = p_stop_id
  returning * into result;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- driver_depart_from_stop : chauffeur repart → calcule frais d'attente
-- 3 min gratuit, puis 40 F par minute entamée
-- ------------------------------------------------------------
create or replace function public.driver_depart_from_stop(p_stop_id uuid)
returns public.ride_stops
language plpgsql security definer set search_path = public as $$
declare
  s public.ride_stops;
  waiting_s int;
  extra_min int;
  fee int := 0;
  new_total int;
  result public.ride_stops;
  driver_app_type driver_application_type;
  ride_row public.rides;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer int;
  new_platform int;
begin
  s := public._assert_stop_driver(p_stop_id);
  if s.status <> 'arrived' then raise exception 'Chauffeur pas encore arrivé'; end if;

  waiting_s := extract(epoch from (now() - s.arrived_at))::int;
  if waiting_s > 180 then
    extra_min := ceil((waiting_s - 180) / 60.0)::int; -- minute entamée
    fee := extra_min * 40;
  end if;

  update public.ride_stops
  set status = 'departed',
      departed_at = now(),
      waiting_seconds = waiting_s,
      waiting_extra_fee_fcfa = fee
  where id = p_stop_id
  returning * into result;

  -- Recompute prix + shares avec les frais d'attente (split standard)
  if fee > 0 then
    select * into ride_row from public.rides where id = s.ride_id;
    if ride_row.driver_id is not null then
      select application_type into driver_app_type
       from public.drivers where id = ride_row.driver_id;
    end if;
    new_total := ride_row.price_total_fcfa + fee;
    if driver_app_type = 'proprietaire' then
      new_driver_cash := floor(new_total * 0.80)::int;
      new_driver_rachat := 0;
      new_dealer := 0;
      new_platform := new_total - new_driver_cash;
    else
      new_driver_cash := floor(new_total * 0.40)::int;
      new_driver_rachat := floor(new_total * 0.10)::int;
      new_dealer := floor(new_total * 0.30)::int;
      new_platform := new_total - new_driver_cash - new_driver_rachat - new_dealer;
    end if;
    update public.rides
    set price_total_fcfa = new_total,
        stops_waiting_fee_fcfa = stops_waiting_fee_fcfa + fee,
        driver_share_fcfa = new_driver_cash,
        driver_rachat_fcfa = new_driver_rachat,
        dealer_share_fcfa = new_dealer,
        platform_share_fcfa = new_platform,
        updated_at = now()
    where id = s.ride_id;
  end if;

  return result;
end;
$$;

comment on function public.driver_depart_from_stop is
  'Chauffeur quitte l''arrêt. 3 min gratuit, ensuite 40 F/min entamée. Le prix et les shares sont recalculés en cohérence.';

-- ------------------------------------------------------------
-- ride_stops_of : petit helper pour lister les stops d'une course
-- ------------------------------------------------------------
create or replace function public.ride_stops_of(p_ride_id uuid)
returns setof public.ride_stops
language sql stable security invoker as $$
  select * from public.ride_stops
  where ride_id = p_ride_id and status <> 'cancelled'
  order by order_idx asc;
$$;
