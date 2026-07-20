-- ============================================================
-- Codes promo — RPC preview + intégration dans create_ride.
-- ============================================================

-- ------------------------------------------------------------
-- 1. preview_promo_code(code, price) → discount à appliquer
-- ------------------------------------------------------------
create or replace function public.preview_promo_code(
  p_code text,
  p_price_total int
)
returns table (
  valid boolean,
  reason text,
  discount_fcfa int,
  final_price_fcfa int
)
language plpgsql stable security definer set search_path = public as $fnp$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_promo public.promo_codes;
  v_uses_total int;
  v_uses_user int;
  v_discount int := 0;
  v_final int;
  v_floor int := 200;
begin
  if auth.uid() is null then
    return query select false, 'auth_required', 0, p_price_total; return;
  end if;
  if v_code = '' then
    return query select false, 'empty', 0, p_price_total; return;
  end if;

  select * into v_promo from public.promo_codes where code = v_code;
  if v_promo is null then
    return query select false, 'unknown', 0, p_price_total; return;
  end if;
  if not v_promo.active then
    return query select false, 'inactive', 0, p_price_total; return;
  end if;
  if v_promo.valid_from > now() then
    return query select false, 'not_started', 0, p_price_total; return;
  end if;
  if v_promo.valid_until is not null and v_promo.valid_until < now() then
    return query select false, 'expired', 0, p_price_total; return;
  end if;

  -- Comptage des usages
  select count(*)::int into v_uses_total
    from public.promo_code_redemptions where code = v_code;
  if v_promo.max_uses_total is not null and v_uses_total >= v_promo.max_uses_total then
    return query select false, 'exhausted', 0, p_price_total; return;
  end if;

  select count(*)::int into v_uses_user
    from public.promo_code_redemptions
    where code = v_code and profile_id = auth.uid();
  if v_uses_user >= v_promo.max_uses_per_user then
    return query select false, 'already_used_by_you', 0, p_price_total; return;
  end if;

  -- Calcul de la remise
  if v_promo.discount_type = 'percent' then
    v_discount := (p_price_total * v_promo.discount_value / 100)::int;
  else
    v_discount := v_promo.discount_value;
  end if;

  v_final := greatest(v_floor, p_price_total - v_discount);
  v_discount := p_price_total - v_final;

  return query select true, 'ok', v_discount, v_final;
end;
$fnp$;

grant execute on function public.preview_promo_code to authenticated;

-- ------------------------------------------------------------
-- 2. create_ride v5 : accepte p_promo_code, applique la remise,
--    enregistre la redemption
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
  p_payment_method payment_method default 'cash',
  p_promo_code text default null
)
returns public.rides
language plpgsql security invoker as $fnr$
declare
  quote record;
  new_ride public.rides;
  v_status ride_status;
  v_promo record;
  v_final_price int;
  v_promo_code_norm text := nullif(upper(trim(coalesce(p_promo_code, ''))), '');
  v_discount int := 0;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  if not public._is_within_service_zone(p_pickup_lat, p_pickup_lng) then
    raise exception 'Point de départ hors zone de service.';
  end if;
  if not public._is_within_service_zone(p_dropoff_lat, p_dropoff_lng) then
    raise exception 'Destination hors zone de service.';
  end if;

  if p_scheduled_at is not null then
    if p_scheduled_at < now() + interval '15 minutes' then
      raise exception 'Réservation min 15 min à l''avance';
    end if;
    if p_scheduled_at > now() + interval '30 days' then
      raise exception 'Réservation max 30 jours à l''avance';
    end if;
    v_status := 'scheduled';
  else
    v_status := 'requested';
  end if;

  select * into quote from public.compute_price(
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
    p_distance_km, p_duration_min, p_category, p_is_night, p_with_ac
  ) limit 1;
  if quote is null or quote.price_total_fcfa is null then
    raise exception 'compute_price returned null';
  end if;

  v_final_price := quote.price_total_fcfa;

  -- Applique la remise si code fourni
  if v_promo_code_norm is not null then
    select * into v_promo from public.preview_promo_code(v_promo_code_norm, quote.price_total_fcfa);
    if not v_promo.valid then
      raise exception 'Code promo invalide : %', v_promo.reason;
    end if;
    v_final_price := v_promo.final_price_fcfa;
    v_discount := v_promo.discount_fcfa;
  end if;

  insert into public.rides (
    client_id,
    pickup_location, pickup_address,
    dropoff_location, dropoff_address,
    distance_km, duration_min,
    price_total_fcfa,
    driver_share_fcfa, driver_rachat_fcfa, dealer_share_fcfa, platform_share_fcfa,
    status, payment_method, scheduled_at, requested_at,
    requested_category, with_ac,
    promo_code, promo_discount_fcfa
  ) values (
    auth.uid(),
    st_setsrid(st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    p_pickup_address,
    st_setsrid(st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_dropoff_address,
    p_distance_km, p_duration_min,
    v_final_price,
    quote.driver_cash_fcfa, quote.driver_rachat_fcfa,
    quote.dealer_share_fcfa, quote.platform_share_fcfa,
    v_status, p_payment_method, p_scheduled_at, now(),
    p_category, p_with_ac,
    v_promo_code_norm, v_discount
  ) returning * into new_ride;

  -- Enregistre la redemption
  if v_promo_code_norm is not null and v_discount > 0 then
    insert into public.promo_code_redemptions (code, profile_id, ride_id, discount_applied_fcfa)
      values (v_promo_code_norm, auth.uid(), new_ride.id, v_discount);
  end if;

  return new_ride;
end;
$fnr$;
