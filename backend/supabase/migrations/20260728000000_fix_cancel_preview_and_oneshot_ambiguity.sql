-- ============================================================
-- Fix 1 : cancellation_fee_preview plantait (500 / SQLSTATE 55000
--   « record "v_fault" is not assigned yet ») quand la course était
--   annulée sans motif chauffeur (ou sans chauffeur) : la variable
--   record v_fault n'était pas assignée mais était référencée dans le
--   RETURN. → On garde des frais/motif, on borne l'éval de faute aux
--   courses AVEC chauffeur, et on n'utilise plus v_fault.evidence hors
--   du bloc où il est assigné (variable v_evidence dédiée).
--   C'est ce qui empêchait TOUTE annulation → course restait 'requested'.
--
-- Fix 2 : driver_oneshot_requests() renvoyait « column reference
--   "expires_at" is ambiguous » (SQLSTATE 42702) : le paramètre de
--   sortie nommé expires_at entrait en collision avec la colonne dans
--   l'UPDATE. → colonne qualifiée driver_requests.expires_at.
-- ============================================================

-- ------------------------------------------------------------
-- Fix 1
-- ------------------------------------------------------------
create or replace function public.cancellation_fee_preview(
  p_ride_id uuid,
  p_user_reason text default null
)
returns table (
  fee_fcfa int,
  reason_code text,
  driver_share_fcfa int,
  platform_share_fcfa int,
  driver_still_busy_elsewhere boolean,
  is_driver_fault boolean,
  driver_fault_evidence text,
  will_be_disputed boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rides;
  v_secs_since_matched int;
  v_fee int := 0;
  v_reason text := 'free';
  v_driver_busy_elsewhere boolean := false;
  v_fault record;
  v_disputed boolean := false;
  v_evidence text := null;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null or r.client_id <> auth.uid() then
    raise exception 'Ride not found';
  end if;

  if r.driver_id is not null then
    v_driver_busy_elsewhere := exists (
      select 1 from public.rides other
      where other.driver_id = r.driver_id
        and other.id <> r.id
        and other.status in ('matched', 'arrived', 'in_progress')
        and other.matched_at < r.matched_at
    );
    if v_driver_busy_elsewhere then
      return query select 0, 'free_driver_busy', 0, 0, true, false, null::text, false;
      return;
    end if;
  end if;

  -- Éval faute chauffeur : uniquement si la course a un chauffeur ET
  -- qu'une raison "chauffeur" est invoquée. (Sinon v_fault reste non
  -- assigné → on ne le référence jamais.)
  if r.driver_id is not null
     and p_user_reason in ('driver_not_moving', 'wrong_direction', 'wait_too_long', 'driver_asked') then
    select * into v_fault from public._eval_driver_fault(p_ride_id, p_user_reason);
    if v_fault.is_driver_fault then
      return query select 0, 'free_driver_fault', 0, 0, false, true, v_fault.evidence, false;
      return;
    end if;
    v_disputed := true;
    v_evidence := v_fault.evidence;
  end if;

  case
    when r.status = 'requested' then
      v_fee := 0;
      v_reason := 'free_no_match';
    when r.status = 'matched' then
      v_secs_since_matched := extract(epoch from (now() - r.matched_at))::int;
      if v_secs_since_matched <= 30 then
        v_fee := 0;
        v_reason := 'free_within_30s';
      else
        v_fee := public.round_to_50(300);
        v_reason := 'driver_on_way';
      end if;
    when r.status = 'arrived' then
      v_fee := public.round_to_50(500);
      v_reason := 'driver_arrived';
    when r.status = 'in_progress' then
      v_fee := public.round_to_50((r.price_total_fcfa * 0.50)::int);
      v_reason := 'ride_started';
    else
      v_fee := 0;
      v_reason := 'not_cancellable';
  end case;

  return query select
    v_fee,
    v_reason,
    (v_fee / 2)::int,
    v_fee - (v_fee / 2)::int,
    false,
    false,
    case when v_disputed then v_evidence else null end,
    v_disputed;
end;
$$;

-- ------------------------------------------------------------
-- Fix 2
-- ------------------------------------------------------------
create or replace function public.driver_oneshot_requests()
returns table (
  request_id uuid,
  client_first_name text,
  pickup_address text,
  dropoff_address text,
  category vehicle_category,
  distance_km numeric,
  duration_min int,
  price_total_fcfa int,
  expires_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  update public.driver_requests
  set status = 'expired'
  where status = 'pending' and driver_requests.expires_at <= now();

  return query
  select dr.id, split_part(coalesce(pr.full_name, 'Client'), ' ', 1),
         dr.pickup_address, dr.dropoff_address, dr.category,
         dr.distance_km, dr.duration_min, dr.price_total_fcfa, dr.expires_at
  from public.driver_requests dr
  join public.drivers d on d.id = dr.driver_id
  join public.profiles pr on pr.id = dr.client_id
  where d.profile_id = auth.uid()
    and dr.status = 'pending' and dr.expires_at > now()
  order by dr.created_at;
end;
$$;
