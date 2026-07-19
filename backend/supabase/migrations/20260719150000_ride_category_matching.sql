-- ============================================================
-- Filtre catégorie sur pending_rides_for_driver + option C (downward flex)
--
-- Règles matching :
--   • Chauffeur Essentiel : voit rides.requested_category = 'essentiel'
--     OU rides.requested_category = 'confort' MAIS uniquement après que
--     le client a accepté le downgrade (rides.downgrade_accepted_at set).
--   • Chauffeur Confort   : voit rides.requested_category = 'confort'
--     uniquement (il n'accepte pas d'Essentiel — il perdrait du CA).
--
-- Colonnes ajoutées à rides :
--   • requested_category  — ce que le client a demandé au départ
--   • with_ac             — le client veut la climatisation
--   • downgrade_accepted_at — moment où le client a accepté un Essentiel à
--                             la place du Confort demandé
--
-- RPC nouveau : client_accept_downgrade(ride_id, with_ac?) que le client
-- appelle depuis /ride/[id] quand aucun Confort n'est trouvé après timeout.
-- Il recalcule le prix, réajuste les shares, marque la ride comme
-- 'essentiel + downgrade' → les chauffeurs Essentiel peuvent la voir.
-- La différence de prix est remboursée sur le wallet TamCar Crédit.
-- ============================================================

alter table public.rides
  add column if not exists requested_category vehicle_category,
  add column if not exists with_ac boolean not null default false,
  add column if not exists downgrade_accepted_at timestamptz;

-- Backfill : les rides existantes qui ont un vehicle_id → on suppose
-- que la catégorie demandée = catégorie du véhicule affecté.
update public.rides r
   set requested_category = v.category
  from public.vehicles v
 where r.vehicle_id = v.id and r.requested_category is null;

-- Les rides sans vehicle_id → défaut 'essentiel' (assez safe)
update public.rides
   set requested_category = 'essentiel'
 where requested_category is null;

-- ------------------------------------------------------------
-- create_ride : stocke désormais requested_category + with_ac
-- ------------------------------------------------------------
create or replace function public.create_ride(
  p_category vehicle_category,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_pickup_address text,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_dropoff_address text,
  p_distance_km numeric,
  p_duration_min int,
  p_is_night boolean default false,
  p_with_ac boolean default false,
  p_scheduled_at timestamptz default null,
  p_payment_method payment_method default 'cash'
)
returns public.rides
language plpgsql security invoker as $$
declare
  price_row record;
  new_ride public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into price_row from public.compute_price(
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
    p_distance_km, p_duration_min, p_category, p_is_night, p_with_ac
  ) limit 1;
  if price_row is null or price_row.price_total_fcfa is null then
    raise exception 'compute_price returned null';
  end if;

  insert into public.rides (
    client_id,
    pickup_location, pickup_address,
    dropoff_location, dropoff_address,
    distance_km, duration_min,
    price_total_fcfa,
    driver_share_fcfa, driver_rachat_fcfa, dealer_share_fcfa, platform_share_fcfa,
    status, payment_method, scheduled_at, requested_at,
    requested_category, with_ac
  ) values (
    auth.uid(),
    st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    p_pickup_address,
    st_setsrid(st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_dropoff_address,
    p_distance_km, p_duration_min,
    price_row.price_total_fcfa,
    price_row.driver_cash_fcfa, price_row.driver_rachat_fcfa,
    price_row.dealer_share_fcfa, price_row.platform_share_fcfa,
    'requested', p_payment_method, p_scheduled_at, now(),
    p_category, p_with_ac
  ) returning * into new_ride;

  return new_ride;
end;
$$;

-- ------------------------------------------------------------
-- pending_rides_for_driver : filtre catégorie
-- ------------------------------------------------------------
drop function if exists public.pending_rides_for_driver(double precision);
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
  downgrade_accepted_at timestamptz
)
language plpgsql stable security invoker as $$
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
  -- 1. Chauffeur online + sa catégorie via son véhicule courant
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

  -- 2. Multi-course : 2 max
  select count(*)::int into v_active_count
   from public.rides r
   where r.driver_id = v_drv_id
     and r.status in ('matched', 'arrived', 'in_progress');
  if v_active_count >= 2 then return; end if;

  -- 3. Si une course active, centre le pool sur son dropoff
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

  -- 4. Filtre catégorie (option C — downward flex) :
  --    • Chauffeur Confort  : uniquement rides Confort
  --    • Chauffeur Essentiel : rides Essentiel OU rides Confort ayant été downgradées
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
    r.requested_category, r.downgrade_accepted_at
  from public.rides r
  where r.status = 'requested'
    and r.driver_id is null
    and st_dwithin(r.pickup_location, v_search_origin, v_effective_radius * 1000)
    and (
      -- Chauffeur Confort : voit strictement Confort non downgradés
      (v_drv_category = 'confort' and r.requested_category = 'confort' and r.downgrade_accepted_at is null)
      -- Chauffeur Essentiel : voit Essentiel natifs OU Confort downgradés
      or (v_drv_category = 'essentiel' and (
           r.requested_category = 'essentiel'
           or (r.requested_category = 'confort' and r.downgrade_accepted_at is not null)
         ))
    )
  order by st_distance(r.pickup_location, v_search_origin) asc
  limit 20;
end;
$$;

-- ------------------------------------------------------------
-- client_accept_downgrade : le client accepte un Essentiel à la place
-- de son Confort. On recalcule le prix (avec AC optionnel), rembourse
-- la différence sur le wallet TamCar Crédit, et marque la ride pour
-- que les chauffeurs Essentiel puissent la voir.
-- ------------------------------------------------------------
create or replace function public.client_accept_downgrade(
  p_ride_id uuid,
  p_with_ac boolean default false
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  new_price record;
  refund_amount int;
  client_wallet_id uuid;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status <> 'requested' then raise exception 'Course déjà matchée ou terminée'; end if;
  if r.requested_category <> 'confort' then
    raise exception 'Seule une demande Confort peut être downgradée';
  end if;
  if r.downgrade_accepted_at is not null then
    raise exception 'Downgrade déjà accepté';
  end if;

  -- Recalcule prix en Essentiel avec éventuel AC
  select * into new_price from public.compute_price(
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    r.distance_km, r.duration_min,
    'essentiel'::vehicle_category, false, p_with_ac
  ) limit 1;

  refund_amount := greatest(0, r.price_total_fcfa - new_price.price_total_fcfa);

  update public.rides
    set price_total_fcfa = new_price.price_total_fcfa,
        driver_share_fcfa = new_price.driver_cash_fcfa,
        driver_rachat_fcfa = new_price.driver_rachat_fcfa,
        dealer_share_fcfa = new_price.dealer_share_fcfa,
        platform_share_fcfa = new_price.platform_share_fcfa,
        with_ac = p_with_ac,
        downgrade_accepted_at = now(),
        updated_at = now()
    where id = p_ride_id
    returning * into result;

  -- Remboursement diff sur wallet client (crédit TamCar)
  if refund_amount > 0 then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (r.client_id, 'tamcar_credit', 0)
      on conflict (profile_id, kind) do nothing;
    select id into client_wallet_id
      from public.wallets
      where profile_id = r.client_id and kind = 'tamcar_credit';
    update public.wallets
      set balance_fcfa = balance_fcfa + refund_amount,
          updated_at = now()
      where id = client_wallet_id;
    insert into public.wallet_transactions
      (wallet_id, type, amount_fcfa, ride_id, status)
      values (client_wallet_id, 'refund', refund_amount, p_ride_id, 'success');
  end if;

  return result;
end;
$$;

grant execute on function public.client_accept_downgrade(uuid, boolean) to authenticated;

-- Extend enum wallet_tx_type pour le remboursement downgrade
alter type wallet_tx_type add value if not exists 'refund';
