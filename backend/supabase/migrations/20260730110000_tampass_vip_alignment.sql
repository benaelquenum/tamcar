-- ============================================================
-- TamCar — Alignement VIP : TamPass + push nouvelles courses (2026-07-30)
--
--   Le chauffeur VIP (premium) peut servir Confort et Essentiel sur les
--   courses classiques (migration 20260729190000). On aligne :
--   1. _notify_matching_drivers : push nouvelle course aussi aux VIP pour
--      les demandes Confort/Essentiel (+ libellé « VIP », vouvoiement).
--   2. tampass_open_offers : le chauffeur VIP voit les pass Confort/Essentiel.
--   3. request_subscription_flex : notifie aussi les chauffeurs VIP pour
--      les pass Confort/Essentiel.
-- ============================================================

-- 1. Push nouvelle course : + chauffeurs VIP --------------------------
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
    when 'premium'   then 'VIP'
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
        or (v.category = 'premium' and r.requested_category in ('confort', 'essentiel'))
      )
      -- Position inconnue = notifié quand même (il jugera lui-même)
      and (d.current_location is null
           or st_dwithin(d.current_location, r.pickup_location, 10000))
  loop
    is_below := (
      (drv.drv_cat = 'confort' and r.requested_category = 'essentiel')
      or (drv.drv_cat = 'premium' and r.requested_category in ('confort', 'essentiel'))
    );
    perform public._push_notify(
      drv.profile_id,
      case when is_below
        then '🚗 Course ' || category_label || ' — tarif réduit'
        else '🚗 Nouvelle course ' || category_label
      end,
      case when is_below
        then 'Un client attend un ' || category_label || ' près de vous. Tarif au client, à vous de voir.'
        else 'Un client attend près de vous. Ouvrez TamCar pour accepter.'
      end,
      '/',
      'new-ride:' || p_ride_id::text,
      true
    );
  end loop;
end;
$fn_nmd$;

-- 2. Offres TamPass visibles : + chauffeurs VIP -----------------------
create or replace function public.tampass_open_offers()
returns table (
  subscription_id uuid,
  origin_address text,
  dropoff_address text,
  category vehicle_category,
  days_count int,
  slot_out time,
  slot_return time,
  rides_total int,
  weeks int,
  driver_estimate_fcfa int,
  distance_from_driver_km numeric,
  searching_until timestamptz
)
language sql stable security definer set search_path = public as $fn_offers$
  select
    s.id,
    s.origin_address,
    s.dropoff_address,
    s.category,
    cardinality(s.days_of_week),
    s.slot_out,
    s.slot_return,
    s.rides_total,
    ((s.expires_on - s.starts_on) / 7)::int,
    round(0.4 * s.unit_price_fcfa * s.rides_total)::int,
    round((st_distance(d.current_location, s.origin_location) / 1000.0)::numeric, 1),
    s.searching_until
  from public.subscriptions s
  join public.drivers d on d.profile_id = auth.uid()
  join public.vehicles v on v.id = d.current_vehicle_id
  where s.status = 'pending_driver'
    and s.searching_until > now()
    and (v.category = s.category
         or (v.category = 'confort' and s.category = 'essentiel')
         or (v.category = 'premium' and s.category in ('confort', 'essentiel')))
    and (d.current_location is null
         or st_dwithin(d.current_location, s.origin_location, 15000))
  order by s.searching_until;
$fn_offers$;

grant execute on function public.tampass_open_offers to authenticated;

-- 3. Création de pass : notifie aussi les chauffeurs VIP --------------
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
  v_now_local time := (now() at time zone 'Africa/Porto-Novo')::time;
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_today_dow int := extract(isodow from (now() at time zone 'Africa/Porto-Novo'))::int;
  v_starts date;
  v_drv record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_days is null or cardinality(p_days) = 0 then
    raise exception 'Choisis au moins un jour';
  end if;
  if exists (select 1 from unnest(p_days) d where d < 1 or d > 7) then
    raise exception 'Jours invalides (1 = lundi … 7 = dimanche)';
  end if;
  if p_slot_out is null then raise exception 'Un créneau de départ est requis'; end if;
  if p_weeks < 1 or p_weeks > 8 then raise exception 'Durée : entre 1 et 8 semaines'; end if;

  if exists (select 1 from public.subscriptions
             where client_id = auth.uid()
               and status in ('pending_driver', 'awaiting_payment')) then
    raise exception 'Tu as déjà une demande TamPass en cours';
  end if;

  -- Démarre aujourd'hui si aujourd'hui est un jour choisi et le départ est
  -- encore à venir ; sinon demain.
  v_starts := case
    when v_today_dow = any (p_days) and p_slot_out > v_now_local then v_today
    else v_today + 1
  end;

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

  for v_drv in
    select d.profile_id
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.status = 'active'
      and (v.category = p_category
           or (v.category = 'confort' and p_category = 'essentiel')
           or (v.category = 'premium' and p_category in ('confort', 'essentiel')))
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

grant execute on function public.request_subscription_flex to authenticated;
