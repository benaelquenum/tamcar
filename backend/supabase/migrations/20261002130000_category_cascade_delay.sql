-- ============================================================
-- Cascade de catégories avec délai de 30 s (2026-10-02)
--
-- Décision Terence :
--   • VIP (premium) : voit les demandes VIP, puis les demandes CONFORT
--     seulement après 30 s sans preneur. Ne voit plus JAMAIS les demandes
--     Essentiel (avant : il les voyait tout de suite).
--   • Confort : voit les demandes Confort, puis les demandes ESSENTIEL
--     seulement après 30 s sans preneur (avant : tout de suite).
--   • Essentiel, moto, tricycle : inchangés (leur propre catégorie).
--
-- « 30 s sans preneur » = la demande est toujours en statut `requested`, sans
-- chauffeur, 30 s après `requested_at` (réinitialisé à la relance par le client
-- et à la libération d'une réservation).
--
-- Trois endroits à aligner :
--   1. pending_rides_for_driver : le pool affiché au chauffeur ;
--   2. _notify_matching_drivers : l'alerte push à la création de la course —
--      seuls les chauffeurs de la catégorie demandée sont alertés d'emblée ;
--   3. accept_ride : garde côté serveur, pour que la règle tienne même si
--      l'écran du chauffeur est contourné (n'ajoute QUE les trois interdits
--      ci-dessus, aucun autre cas n'est touché).
--
-- Hors périmètre, inchangés : réservations à l'avance
-- (pending_scheduled_rides_for_driver : le VIP n'y voyait déjà aucune autre
-- catégorie) et TamPass.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pool des chauffeurs
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
  order by st_distance(r.pickup_location, v_search_origin) asc
  limit 20;
end;
$fn_pending$;

-- ------------------------------------------------------------
-- 2. Alerte push à la création : la catégorie demandée d'abord
-- ------------------------------------------------------------
create or replace function public._notify_matching_drivers(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn_nmd$
declare
  r public.rides;
  drv record;
  category_label text;
begin
  select * into r from public.rides where id = p_ride_id;
  if r is null or r.status <> 'requested' then return; end if;
  -- Course directe : jamais en alerte générale.
  if r.requested_driver_id is not null then return; end if;

  category_label := case r.requested_category
    when 'moto'      then 'Moto'
    when 'tricycle'  then 'Tricycle'
    when 'essentiel' then 'Essentiel'
    when 'confort'   then 'Confort'
    when 'premium'   then 'VIP'
    else initcap(r.requested_category::text)
  end;

  -- Seuls les chauffeurs de la catégorie demandée sont alertés d'emblée. Les
  -- catégories supérieures voient la demande dans leur pool après 30 s.
  for drv in
    select d.profile_id
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.is_online = true
      and d.status = 'active'
      and v.category = r.requested_category
      -- Position inconnue = notifié quand même (il jugera lui-même)
      and (d.current_location is null
           or st_dwithin(d.current_location, r.pickup_location, 10000))
  loop
    perform public._push_notify(
      drv.profile_id,
      '🚗 Nouvelle course ' || category_label,
      'Un client attend près de vous. Ouvrez TamCar pour accepter.',
      '/',
      'new-ride:' || p_ride_id::text,
      true
    );
  end loop;
end;
$fn_nmd$;

revoke all on function public._notify_matching_drivers(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. accept_ride : garde côté serveur (seuls les 3 interdits de la cascade)
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

  select price_total_fcfa, pickup_location, requested_driver_id, requested_category, requested_at
    into total, v_pickup, v_target, v_req_cat, v_req_at
   from public.rides where id = ride_id;

  if total is null then raise exception 'Ride introuvable'; end if;

  -- Course directe : réservée au chauffeur visé tant qu'elle est directe.
  if v_target is not null and v_target <> driver_row.id then
    raise exception 'Cette course est réservée à un autre chauffeur.';
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

-- Contrôle : règle de visibilité attendue
--   chauffeur VIP     → VIP tout de suite ; Confort après 30 s ; jamais Essentiel
--   chauffeur Confort → Confort tout de suite ; Essentiel après 30 s
select 'premium' as chauffeur, 'premium' as demande, 'tout de suite' as visibilite
union all select 'premium', 'confort',   'après 30 s'
union all select 'premium', 'essentiel', 'jamais'
union all select 'confort', 'confort',   'tout de suite'
union all select 'confort', 'essentiel', 'après 30 s';
