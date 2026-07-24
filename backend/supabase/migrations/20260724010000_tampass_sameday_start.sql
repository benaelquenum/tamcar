-- ============================================================
-- TamPass — démarrage le jour même dès la CRÉATION (2026-07-24)
--
--   Avant : request_subscription_flex fixait starts_on = demain, toujours.
--   Un TamPass créé à 19h00 pour un départ 19h30 affichait donc « demain ».
--   Désormais : starts_on = aujourd'hui si aujourd'hui est un jour choisi
--   ET le créneau de départ est encore à venir (heure locale Porto-Novo) ;
--   sinon demain. (confirm_subscription_payment de 003000 conserve ce
--   starts_on via greatest(starts_on, current_date), puis tampass_sync
--   génère le trajet du jour s'il est encore à venir.)
-- ============================================================

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
