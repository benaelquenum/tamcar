-- ============================================================
-- TamCar — Une réservation notifiée doit être visible. 2026-08-07.
--
--   SYMPTÔME
--   Le chauffeur reçoit la notification push d'une réservation, ouvre
--   l'application, et son fil affiche « Courses autour 0 ».
--
--   CAUSE
--   Les deux chemins ne filtrent pas pareil.
--     _notify_scheduled_booking  : « position inconnue = notifié quand
--       même, il jugera lui-même » (d.current_location is null or …).
--     pending_scheduled_rides_for_driver : « if v_drv_loc is null then
--       return » — aucune ligne, pas même celles qui ont motivé l'alerte.
--   Un chauffeur en ligne dont le GPS n'a pas encore remonté (application
--   relancée depuis la notification, autorisation en cours, intérieur de
--   bâtiment) reçoit donc une alerte pour une course qu'il ne verra pas.
--
--   CORRECTIF
--   Position inconnue → on renvoie les réservations compatibles sans
--   filtre de distance, avec distance_from_driver_m à null (l'écran
--   affiche « — » plutôt qu'un « 0 m » mensonger). C'est défendable pour
--   une réservation : le départ est dans le futur, le chauffeur a le
--   temps de juger. On ne touche pas au fil des courses immédiates, où
--   la proximité est le critère décisif.
-- ============================================================

drop function if exists public.pending_scheduled_rides_for_driver(double precision);

create or replace function public.pending_scheduled_rides_for_driver(
  radius_km double precision default 12.0
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
  scheduled_at timestamptz,
  requested_category vehicle_category,
  client_first_name text,
  is_below_driver_category boolean
)
language plpgsql stable security invoker as $fn_psr$
declare
  v_drv_id uuid;
  v_drv_loc geography;
  v_drv_category vehicle_category;
begin
  select d.id, d.current_location, v.category
    into v_drv_id, v_drv_loc, v_drv_category
  from public.drivers d
  left join public.vehicles v on v.id = d.current_vehicle_id
  where d.profile_id = auth.uid()
    and d.is_online = true
    and d.status = 'active'
  limit 1;

  -- Sans chauffeur actif ou sans véhicule courant, il n'y a rien à
  -- proposer. La position, elle, n'est plus bloquante.
  if v_drv_id is null or v_drv_category is null then
    return;
  end if;

  return query
  select
    r.id, r.pickup_address, r.dropoff_address,
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    case when v_drv_loc is null then null::double precision
         else st_distance(r.pickup_location, v_drv_loc) end,
    r.distance_km, r.duration_min, r.price_total_fcfa, r.driver_share_fcfa,
    r.scheduled_at, r.requested_category,
    -- Prénom seul : le chauffeur n'a pas besoin de l'identité complète
    -- avant de s'engager. Le passager prime s'il s'agit d'un proche.
    split_part(
      coalesce(nullif(trim(r.passenger_name), ''), cp.full_name, 'Client'),
      ' ', 1
    ),
    (v_drv_category = 'confort' and r.requested_category = 'essentiel')
  from public.rides r
  left join public.profiles cp on cp.id = r.client_id
  where r.status = 'scheduled'
    and r.driver_id is null
    and r.scheduled_at > now()
    and (v_drv_loc is null
         or st_dwithin(r.pickup_location, v_drv_loc, radius_km * 1000))
    and (
      v_drv_category = r.requested_category
      or (v_drv_category = 'confort' and r.requested_category = 'essentiel')
    )
  order by r.scheduled_at asc
  limit 20;
end;
$fn_psr$;
grant execute on function public.pending_scheduled_rides_for_driver(double precision) to authenticated;

comment on function public.pending_scheduled_rides_for_driver is
  'Réservations libres proposées au chauffeur connecté : 12 km, catégorie compatible. Position inconnue = pas de filtre de distance et distance nulle, pour rester cohérent avec _notify_scheduled_booking qui notifie ces chauffeurs.';
