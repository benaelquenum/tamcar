-- ============================================================
-- Alertes chauffeur partout (décision Terence 2026-07-23) :
-- le chauffeur reçoit toutes les alertes (courses ordinaires + offres
-- TamPass) où qu'il soit dans TamCar Pro et même app fermée.
--
-- Le transport hors-app est déjà assuré par le web push (service
-- worker + EnableNotifications monté dans le layout racine).
-- Cette migration corrige les 2 trous de CIBLAGE :
--   1. Courses ordinaires : un chauffeur EN LIGNE sans position GPS
--      connue était exclu par le filtre distance → il est désormais
--      notifié aussi (il jugera lui-même).
--   2. Offres TamPass : notifiées à TOUS les chauffeurs actifs de la
--      catégorie (même hors ligne — une offre récurrente se consulte
--      depuis chez soi), triés par proximité quand elle est connue,
--      plafonné à 30. Tag unique par offre (plus d'écrasement).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Courses ordinaires : inclure les chauffeurs online sans position
-- ------------------------------------------------------------
create or replace function public._notify_matching_drivers(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn_nmd$
declare
  r public.rides;
  drv record;
  is_below boolean;
  category_label text;
begin
  select * into r from public.rides where id = p_ride_id;
  if r is null or r.status <> 'requested' then return; end if;

  category_label := case r.requested_category
    when 'moto'      then 'Moto'
    when 'tricycle'  then 'Tricycle'
    when 'essentiel' then 'Essentiel'
    when 'confort'   then 'Confort'
    else initcap(r.requested_category::text)
  end;

  for drv in
    select d.profile_id, v.category as drv_cat
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.is_online = true
      and d.status = 'active'
      and (
        v.category = r.requested_category
        or (v.category = 'confort' and r.requested_category = 'essentiel')
      )
      -- Position inconnue = notifié quand même (il jugera lui-même)
      and (d.current_location is null
           or st_dwithin(d.current_location, r.pickup_location, 10000))
  loop
    is_below := (drv.drv_cat = 'confort' and r.requested_category = 'essentiel');
    perform public._push_notify(
      drv.profile_id,
      case when is_below
        then '🚗 Course ' || category_label || ' — tarif réduit'
        else '🚗 Nouvelle course ' || category_label
      end,
      case when is_below
        then 'Un client attend un ' || category_label || ' près de toi. Tarif au client, à toi de voir.'
        else 'Un client attend près de toi. Ouvre TamCar pour accepter.'
      end,
      '/',
      'new-ride:' || p_ride_id::text,
      true
    );
  end loop;
end;
$fn_nmd$;

-- ------------------------------------------------------------
-- 2. Offres TamPass : tous les chauffeurs actifs de la catégorie
--    (même hors ligne), tri par proximité, tag unique par offre
-- ------------------------------------------------------------
create or replace function public.request_subscription_flex(
  p_category vehicle_category,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_origin_address text,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_dropoff_address text,
  p_distance_km numeric,
  p_duration_min int,
  p_days int[],
  p_slot_out time,
  p_slot_return time default null,
  p_weeks int default 4
)
returns public.subscriptions
language plpgsql security definer set search_path = public as $fn_req$
declare
  v_trips_per_day int;
  v_rides_total int;
  v_discount numeric;
  v_unit int;
  v_total int;
  v_sub public.subscriptions;
  v_starts date := current_date + 1;
  v_drv record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_days is null or cardinality(p_days) = 0 then
    raise exception 'Choisissez au moins un jour';
  end if;
  if exists (select 1 from unnest(p_days) d where d < 1 or d > 7) then
    raise exception 'Jours invalides (1 = lundi … 7 = dimanche)';
  end if;
  if p_slot_out is null then raise exception 'Un créneau de départ est requis'; end if;
  if p_weeks < 1 or p_weeks > 8 then raise exception 'Durée : entre 1 et 8 semaines'; end if;

  if exists (select 1 from public.subscriptions
             where client_id = auth.uid()
               and status in ('pending_driver', 'awaiting_payment')) then
    raise exception 'Vous avez déjà une demande TamPass en cours';
  end if;

  v_trips_per_day := case when p_slot_return is not null then 2 else 1 end;
  v_rides_total := cardinality(p_days) * v_trips_per_day * p_weeks;
  v_discount := case
    when v_rides_total >= 40 then 15
    when v_rides_total >= 20 then 10
    when v_rides_total >= 10 then 5
    else 0
  end;

  select price_total_fcfa into v_unit
  from public.compute_price(
    p_origin_lat, p_origin_lng, p_dropoff_lat, p_dropoff_lng,
    p_distance_km, p_duration_min, p_category, false, false
  );
  if v_unit is null or v_unit <= 0 then
    raise exception 'Impossible de calculer le prix du trajet';
  end if;
  v_total := round(v_unit * v_rides_total * (1 - v_discount / 100.0))::int;

  insert into public.subscriptions (
    client_id, plan_code, category, status,
    origin_location, origin_address, dropoff_location, dropoff_address,
    distance_km, duration_min,
    days_of_week, slot_out, slot_return,
    rides_total, rides_remaining,
    reports_month, reports_per_month, pauses_max,
    unit_price_fcfa, discount_pct, total_price_fcfa,
    starts_on, expires_on, searching_until
  ) values (
    auth.uid(), null, p_category, 'pending_driver',
    st_setsrid(st_makepoint(p_origin_lng, p_origin_lat), 4326)::geography,
    p_origin_address,
    st_setsrid(st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_dropoff_address,
    p_distance_km, p_duration_min,
    (select array_agg(distinct d order by d) from unnest(p_days) d),
    p_slot_out, p_slot_return,
    v_rides_total, v_rides_total,
    date_trunc('month', v_starts)::date, 2,
    case when p_weeks >= 4 then 1 else 0 end,
    v_unit, v_discount, v_total,
    v_starts, v_starts + p_weeks * 7,
    now() + interval '3 hours'
  )
  returning * into v_sub;

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'search_started',
          jsonb_build_object('total_fcfa', v_total, 'rides_total', v_rides_total,
                             'searching_until', v_sub.searching_until));

  -- TOUS les chauffeurs actifs de la catégorie (même hors ligne),
  -- les plus proches d'abord quand la position est connue, max 30
  for v_drv in
    select d.profile_id
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.status = 'active'
      and (v.category = p_category
           or (v.category = 'confort' and p_category = 'essentiel'))
    order by
      case when d.current_location is null then 1 else 0 end,
      st_distance(d.current_location, v_sub.origin_location)
    limit 30
  loop
    perform public._push_notify(
      v_drv.profile_id,
      '💼 Nouvelle offre TamPass',
      v_rides_total || ' trajets réguliers · ~' ||
        round(0.4 * v_unit * v_rides_total) || ' FCFA sur la période. Premier arrivé, premier servi.',
      '/tampass', 'tampass-offer:' || v_sub.id::text, true
    );
  end loop;

  return v_sub;
end;
$fn_req$;
