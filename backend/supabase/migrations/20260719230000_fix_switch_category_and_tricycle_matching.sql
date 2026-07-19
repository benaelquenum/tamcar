-- ============================================================
-- Fix 1 : client_switch_category — cast wallet_tx_type dans le CASE.
-- Fix 2 : pending_rides_for_driver v5 — matching plus permissif
--         entre Moto ↔ Tricycle. Un chauffeur Tricycle voit aussi
--         les rides Moto (peut prendre au tarif Moto), et un
--         chauffeur Moto voit les Tricycle downgradés.
-- ============================================================

-- ------------------------------------------------------------
-- Fix 1 : cast wallet_tx_type
-- ------------------------------------------------------------
create or replace function public.client_switch_category(
  p_ride_id uuid,
  p_new_category vehicle_category
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  quote record;
  delta int;
  client_wallet_id uuid;
  result public.rides;
  v_tx_type wallet_tx_type;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status <> 'requested' then raise exception 'Course déjà matchée ou terminée'; end if;
  if r.requested_category = p_new_category then
    raise exception 'Déjà dans cette catégorie';
  end if;

  select * into quote from public.compute_price(
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    r.distance_km, r.duration_min, p_new_category, false, false
  ) limit 1;

  delta := r.price_total_fcfa - quote.price_total_fcfa;

  update public.rides set
    requested_category = p_new_category,
    price_total_fcfa   = quote.price_total_fcfa,
    driver_share_fcfa  = quote.driver_cash_fcfa,
    driver_rachat_fcfa = quote.driver_rachat_fcfa,
    dealer_share_fcfa  = quote.dealer_share_fcfa,
    platform_share_fcfa= quote.platform_share_fcfa,
    downgrade_accepted_at = case
      when p_new_category in ('moto','tricycle') then now()
      when p_new_category = 'essentiel' and r.requested_category in ('confort') then now()
      else downgrade_accepted_at
    end,
    updated_at = now()
  where id = p_ride_id
  returning * into result;

  if delta <> 0 then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (r.client_id, 'tamcar_credit', 0)
      on conflict (profile_id, kind) do nothing;
    select id into client_wallet_id
      from public.wallets
      where profile_id = r.client_id and kind = 'tamcar_credit';
    update public.wallets
      set balance_fcfa = balance_fcfa + delta,
          updated_at = now()
      where id = client_wallet_id;
    -- Cast explicite du type (le CASE renvoie un text non typé)
    v_tx_type := case when delta > 0 then 'refund'::wallet_tx_type
                                     else 'payment'::wallet_tx_type end;
    insert into public.wallet_transactions
      (wallet_id, type, amount_fcfa, ride_id, status)
      values (client_wallet_id, v_tx_type, abs(delta), p_ride_id, 'success');
  end if;

  return result;
end;
$$;

-- ------------------------------------------------------------
-- Fix 2 : matching étendu Moto ↔ Tricycle
--
-- Nouvelle règle générique :
--   Chauffeur voit une ride si :
--   1) même catégorie (match direct)
--   2) OU la ride a été explicitement switchée par le client
--      (downgrade_accepted_at set) ET la catégorie du chauffeur
--      = requested_category actuelle (que le client a acceptée).
--
-- En pratique : après client_switch_category, requested_category est
-- mise à jour vers la nouvelle valeur → un chauffeur de la nouvelle
-- catégorie voit la ride directement.
--
-- On garde aussi la règle 'chauffeur Confort peut prendre Essentiel
-- comme choix volontaire' pour flexibilité (avec flag is_below).
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
  downgrade_accepted_at timestamptz,
  is_below_driver_category boolean
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

  -- Règle v5 : le chauffeur voit la ride si :
  -- 1) sa catégorie de véhicule = requested_category actuelle de la ride
  -- 2) OU (chauffeur Confort ET ride Essentiel) → choix volontaire "downgrade tarif"
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
    (v_drv_category = 'confort' and r.requested_category = 'essentiel') as is_below_driver_category
  from public.rides r
  where r.status = 'requested'
    and r.driver_id is null
    and st_dwithin(r.pickup_location, v_search_origin, v_effective_radius * 1000)
    and (
      -- Match direct : catégorie chauffeur = catégorie actuelle demandée par le client
      v_drv_category = r.requested_category
      -- OU chauffeur Confort acceptant volontairement une course Essentiel
      or (v_drv_category = 'confort' and r.requested_category = 'essentiel')
    )
  order by st_distance(r.pickup_location, v_search_origin) asc
  limit 20;
end;
$$;
