-- ============================================================
-- Matching v4 : le chauffeur Confort peut aussi prendre des Essentiel.
-- Le chauffeur Essentiel voit uniquement Essentiel (natif ou Confort downgradés).
--
-- Simplification : suppression de l'option clim au niveau du downgrade.
-- (Le paramètre p_with_ac reste dans compute_price pour compat mais n'est plus
--  utilisé nulle part côté client.)
-- ============================================================

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

  -- Règles d'affichage (v4) :
  --   Chauffeur Confort  : voit toutes les rides Confort + toutes les rides Essentiel.
  --                        Les Essentiel sont flaggées is_below_driver_category=true
  --                        pour que le frontend demande une confirmation "tarif réduit".
  --   Chauffeur Essentiel : voit uniquement les rides Essentiel natives
  --                        + les Confort downgradées (client a explicitement basculé).
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
      -- Chauffeur Confort : Confort natifs + Essentiel (toute course visible)
      (v_drv_category = 'confort' and (
         r.requested_category = 'confort' and r.downgrade_accepted_at is null
         or r.requested_category = 'essentiel'
      ))
      -- Chauffeur Essentiel : Essentiel natifs + Confort downgradés
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
-- client_accept_downgrade v2 : sans with_ac (option retirée)
-- ------------------------------------------------------------
create or replace function public.client_accept_downgrade(
  p_ride_id uuid,
  p_with_ac boolean default false  -- gardé pour rétrocompat, ignoré
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

  -- Recalcule prix Essentiel sans clim (option supprimée)
  select * into new_price from public.compute_price(
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    r.distance_km, r.duration_min,
    'essentiel'::vehicle_category, false, false
  ) limit 1;

  refund_amount := greatest(0, r.price_total_fcfa - new_price.price_total_fcfa);

  update public.rides
    set price_total_fcfa = new_price.price_total_fcfa,
        driver_share_fcfa = new_price.driver_cash_fcfa,
        driver_rachat_fcfa = new_price.driver_rachat_fcfa,
        dealer_share_fcfa = new_price.dealer_share_fcfa,
        platform_share_fcfa = new_price.platform_share_fcfa,
        with_ac = false,
        downgrade_accepted_at = now(),
        updated_at = now()
    where id = p_ride_id
    returning * into result;

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

-- ------------------------------------------------------------
-- preview_downgrade_price(ride_id) : le client voit combien il paierait
-- avant d'accepter le downgrade, pour affichage clair dans le modal.
-- ------------------------------------------------------------
create or replace function public.preview_downgrade_price(p_ride_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rides;
  new_price record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;

  select * into new_price from public.compute_price(
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    r.distance_km, r.duration_min,
    'essentiel'::vehicle_category, false, false
  ) limit 1;

  return jsonb_build_object(
    'current_price_fcfa', r.price_total_fcfa,
    'new_price_fcfa', new_price.price_total_fcfa,
    'refund_fcfa', greatest(0, r.price_total_fcfa - new_price.price_total_fcfa)
  );
end;
$$;

grant execute on function public.preview_downgrade_price(uuid) to authenticated;
