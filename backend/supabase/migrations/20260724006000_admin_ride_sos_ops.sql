-- ============================================================
-- TamCar — Interventions admin : SOS + courses bloquées (2026-07-24)
--
--   • admin_ack_sos / admin_resolve_sos : cycle de vie des alertes SOS
--   • admin_reassign_ride : réattribuer une course à un autre chauffeur
--     (recalcule les parts pour préserver l'invariant
--      driver_share + dealer_share + platform_share = price_total)
--   • admin_cancel_ride : clôturer/débloquer une course non terminée
--     → statut 'cancelled_by_admin' (aucun trigger ne l'écoute :
--        pas de frais, pas de mouvement wallet — le débit client
--        n'a lieu qu'à la complétion, donc rien à rembourser ici).
--
--   Convention : chaque fonction vérifie is_admin() en interne,
--   grant à authenticated (comme admin_fleet_management).
-- ============================================================

-- 0. Nouveau statut d'annulation admin ------------------------
alter type ride_status add value if not exists 'cancelled_by_admin';

-- 1. Colonnes de résolution SOS -------------------------------
alter table public.sos_alerts
  add column if not exists resolution_note text,
  add column if not exists resolved_by uuid references public.profiles(id);

-- 2. Acquitter un SOS -----------------------------------------
create or replace function public.admin_ack_sos(p_id uuid)
returns public.sos_alerts
language plpgsql security definer set search_path = public as $fn_ack$
declare v_row public.sos_alerts;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update public.sos_alerts
     set status = 'acknowledged'
   where id = p_id and status = 'open'
   returning * into v_row;
  if not found then raise exception 'Alerte introuvable ou déjà traitée'; end if;
  return v_row;
end;
$fn_ack$;
grant execute on function public.admin_ack_sos(uuid) to authenticated;

-- 3. Résoudre un SOS (avec note) ------------------------------
create or replace function public.admin_resolve_sos(p_id uuid, p_note text default null)
returns public.sos_alerts
language plpgsql security definer set search_path = public as $fn_res$
declare v_row public.sos_alerts;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update public.sos_alerts
     set status = 'resolved',
         resolved_at = now(),
         resolved_by = auth.uid(),
         resolution_note = coalesce(nullif(trim(p_note), ''), resolution_note)
   where id = p_id
   returning * into v_row;
  if not found then raise exception 'Alerte introuvable'; end if;
  return v_row;
end;
$fn_res$;
grant execute on function public.admin_resolve_sos(uuid, text) to authenticated;

-- 4. Réassigner une course à un autre chauffeur ---------------
create or replace function public.admin_reassign_ride(p_ride_id uuid, p_driver_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $fn_reassign$
declare
  v_ride public.rides;
  v_old_driver uuid;
  v_drv record;
  v_quote record;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Course introuvable'; end if;
  if v_ride.status in ('completed','cancelled_by_client','cancelled_by_driver','cancelled_by_admin','expired') then
    raise exception 'Course déjà terminée ou annulée — réassignation impossible';
  end if;

  v_old_driver := v_ride.driver_id;

  select d.id, d.current_vehicle_id, d.profile_id, v.dealer_partner_id, v.category
    into v_drv
  from public.drivers d
  join public.vehicles v on v.id = d.current_vehicle_id
  where d.id = p_driver_id and d.status = 'active';
  if v_drv.id is null then raise exception 'Chauffeur indisponible (pas de véhicule actif)'; end if;

  select * into v_quote from public.compute_price(
    st_y(v_ride.pickup_location::geometry), st_x(v_ride.pickup_location::geometry),
    st_y(v_ride.dropoff_location::geometry), st_x(v_ride.dropoff_location::geometry),
    v_ride.distance_km, v_ride.duration_min, v_drv.category, false, false
  ) limit 1;

  update public.rides
     set driver_id = v_drv.id,
         vehicle_id = v_drv.current_vehicle_id,
         dealer_partner_id = v_drv.dealer_partner_id,
         requested_category = v_drv.category,
         price_total_fcfa   = coalesce(v_quote.price_total_fcfa, price_total_fcfa),
         driver_share_fcfa  = coalesce(v_quote.driver_cash_fcfa, driver_share_fcfa),
         driver_rachat_fcfa = coalesce(v_quote.driver_rachat_fcfa, driver_rachat_fcfa),
         dealer_share_fcfa  = coalesce(v_quote.dealer_share_fcfa, dealer_share_fcfa),
         platform_share_fcfa= coalesce(v_quote.platform_share_fcfa, platform_share_fcfa),
         status = 'matched',
         matched_at = now()
   where id = v_ride.id
   returning * into v_ride;

  -- Notifs
  perform public._push_notify(
    v_drv.profile_id, 'Course attribuée par TamCar',
    'Une course t''a été attribuée : ' || v_ride.pickup_address || ' → ' || v_ride.dropoff_address,
    '/ride/' || v_ride.id::text, 'admin-reassign:' || v_ride.id::text, true
  );
  perform public._push_notify(
    v_ride.client_id, 'Nouveau chauffeur assigné',
    'TamCar t''a trouvé un chauffeur — suis ta course en direct.',
    '/ride/' || v_ride.id::text, 'admin-reassign-c:' || v_ride.id::text, true
  );
  if v_old_driver is not null and v_old_driver <> v_drv.id then
    perform public._push_notify(
      (select profile_id from public.drivers where id = v_old_driver),
      'Course réassignée', 'Une de tes courses a été réattribuée par TamCar.',
      '/', 'admin-reassign-old:' || v_ride.id::text, false
    );
  end if;

  return v_ride;
end;
$fn_reassign$;
grant execute on function public.admin_reassign_ride(uuid, uuid) to authenticated;

-- 5. Annuler / débloquer une course non terminée --------------
create or replace function public.admin_cancel_ride(p_ride_id uuid, p_reason text default null)
returns public.rides
language plpgsql security definer set search_path = public as $fn_cancel$
declare v_ride public.rides;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  update public.rides
     set status = 'cancelled_by_admin',
         cancelled_at = now()
   where id = p_ride_id
     and status not in ('completed','cancelled_by_client','cancelled_by_driver','cancelled_by_admin','expired')
   returning * into v_ride;
  if not found then raise exception 'Course introuvable ou déjà close'; end if;

  perform public._push_notify(
    v_ride.client_id, 'Course annulée par TamCar',
    coalesce(nullif(trim(p_reason), ''), 'Ta course a été annulée par le support TamCar.'),
    '/', 'admin-cancel:' || v_ride.id::text, true
  );
  if v_ride.driver_id is not null then
    perform public._push_notify(
      (select profile_id from public.drivers where id = v_ride.driver_id),
      'Course annulée', 'Une de tes courses a été annulée par TamCar.',
      '/', 'admin-cancel-d:' || v_ride.id::text, false
    );
  end if;

  return v_ride;
end;
$fn_cancel$;
grant execute on function public.admin_cancel_ride(uuid, text) to authenticated;

-- 6. Liste des chauffeurs actifs (pour le sélecteur admin) ----
create or replace function public.admin_active_drivers()
returns table (
  driver_id uuid,
  full_name text,
  category vehicle_category,
  is_online boolean,
  rating_avg numeric
)
language sql stable security definer set search_path = public as $fn_ad$
  select d.id, p.full_name, v.category, d.is_online, d.rating_avg
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  left join public.vehicles v on v.id = d.current_vehicle_id
  where d.status = 'active'
    and (select public.is_admin())
  order by d.is_online desc, p.full_name;
$fn_ad$;
grant execute on function public.admin_active_drivers to authenticated;
