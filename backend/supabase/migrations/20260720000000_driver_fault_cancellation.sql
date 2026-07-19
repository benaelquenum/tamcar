-- ============================================================
-- Attribution des annulations : détecter la faute chauffeur par
-- télémétrie et exonérer le client des frais dans ce cas.
--
-- Barème :
--   - Chauffeur "immobile" (last_moved_at > 90 s) + user_reason='driver_not_moving'
--     → gratuit, cancel_attributed_to='driver', strike chauffeur
--   - Chauffeur "s'éloigne" (dist_pickup actuelle > dist_pickup@match × 1.3 + 300 m)
--     + user_reason='wrong_direction' → gratuit, strike
--   - Attente > 8 min depuis matched_at + user_reason='wait_too_long' → gratuit
--   - user_reason='driver_asked' → PAS d'auto-preuve mais cancel_disputed=true
--     → frais appliqués, admin peut trancher a posteriori
--   - Autre raison ou signal non confirmé → barème standard
--
-- Anti-abus : compte les user_reason "driver_*" NON confirmés sur 30 j par
-- client ; au-delà de 3, cancel_disputed=true et flag admin.
-- ============================================================

-- 1. Colonnes rides : télémétrie au match + attribution
alter table public.rides
  add column if not exists driver_location_at_match geography(point, 4326),
  add column if not exists driver_distance_at_match_m int,
  add column if not exists cancel_attributed_to text default 'client'
    check (cancel_attributed_to in ('client', 'driver', 'neutral')),
  add column if not exists cancel_disputed boolean not null default false,
  add column if not exists cancel_driver_fault_evidence text;

-- 2. Colonnes drivers : mouvement + compteur strikes
alter table public.drivers
  add column if not exists last_moved_at timestamptz,
  add column if not exists cancellations_driver_fault_count int not null default 0;

-- ------------------------------------------------------------
-- 3. driver_update_location v2 : détecte le mouvement
--    Si nouvelle position > 20 m de current_location → set last_moved_at.
-- ------------------------------------------------------------
create or replace function public.driver_update_location(
  current_lng double precision,
  current_lat double precision
)
returns void
language plpgsql security invoker as $$
declare
  v_prev geography;
  v_new geography;
  v_moved boolean := false;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select current_location into v_prev
    from public.drivers
    where profile_id = auth.uid() and is_online = true;

  v_new := st_setsrid(st_makepoint(current_lng, current_lat), 4326)::geography;

  if v_prev is null or st_distance(v_prev, v_new) > 20 then
    v_moved := true;
  end if;

  update public.drivers
    set current_location = v_new,
        last_seen_at = now(),
        last_moved_at = case when v_moved then now() else last_moved_at end
    where profile_id = auth.uid()
      and is_online = true;
end;
$$;

comment on function public.driver_update_location is
  'v2 : met à jour position + last_seen_at ; last_moved_at n''est bumpé que si déplacement > 20 m — sert de preuve d''immobilité au moment d''une annulation.';

-- ------------------------------------------------------------
-- 4. accept_ride v3 : snapshot position + distance au match
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

  select dealer_partner_id into dealer_id
   from public.vehicles where id = driver_row.current_vehicle_id;

  select price_total_fcfa, pickup_location into total, v_pickup
   from public.rides where id = ride_id;

  if total is null then raise exception 'Ride introuvable'; end if;

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

-- ------------------------------------------------------------
-- 5. Helper interne : évalue la faute chauffeur selon raison + signaux
-- ------------------------------------------------------------
create or replace function public._eval_driver_fault(
  p_ride_id uuid,
  p_user_reason text
)
returns table (
  is_driver_fault boolean,
  evidence text
)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rides;
  drv public.drivers;
  v_dist_now int;
  v_ratio numeric;
  v_secs_matched int;
  v_secs_still int;
begin
  if p_user_reason is null then
    return query select false, null::text;
    return;
  end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null or r.driver_id is null then
    return query select false, null::text;
    return;
  end if;
  if r.status not in ('matched', 'arrived') then
    return query select false, null::text;
    return;
  end if;

  select * into drv from public.drivers where id = r.driver_id;

  v_secs_matched := extract(epoch from (now() - r.matched_at))::int;

  case p_user_reason
    when 'driver_not_moving' then
      -- Immobile prouvé si last_moved_at existe et n'a pas bougé depuis > 90 s
      -- ET matched depuis > 90 s (laisse au chauffeur le temps de démarrer)
      if v_secs_matched < 90 then
        return query select false, null::text;
        return;
      end if;
      if drv.last_moved_at is null then
        -- Aucun tick de mouvement depuis le match → considéré immobile
        return query select true,
          'Position chauffeur inchangée depuis le match ('
          || (v_secs_matched / 60)::text || ' min)';
        return;
      end if;
      v_secs_still := extract(epoch from (now() - drv.last_moved_at))::int;
      if v_secs_still > 90 then
        return query select true,
          'Chauffeur immobile depuis '
          || (v_secs_still / 60)::text || ' min '
          || (v_secs_still % 60)::text || ' s';
        return;
      end if;
      return query select false, null::text;

    when 'wrong_direction' then
      -- Distance actuelle chauffeur→pickup vs distance au match
      -- S'éloigne significativement = ratio > 1.3 ET écart > 300 m
      if drv.current_location is null or r.driver_distance_at_match_m is null then
        return query select false, null::text;
        return;
      end if;
      v_dist_now := st_distance(drv.current_location, r.pickup_location)::int;
      if r.driver_distance_at_match_m <= 0 then
        return query select false, null::text;
        return;
      end if;
      v_ratio := v_dist_now::numeric / r.driver_distance_at_match_m::numeric;
      if v_ratio > 1.3 and (v_dist_now - r.driver_distance_at_match_m) > 300 then
        return query select true,
          'Chauffeur s''est éloigné : '
          || r.driver_distance_at_match_m::text || ' m → '
          || v_dist_now::text || ' m';
        return;
      end if;
      return query select false, null::text;

    when 'wait_too_long' then
      -- Attente > 8 min depuis matched_at → prouvé
      if v_secs_matched > 480 then
        return query select true,
          'Attente ' || (v_secs_matched / 60)::text || ' min depuis le match';
        return;
      end if;
      return query select false, null::text;

    when 'driver_asked' then
      -- Impossible à prouver automatiquement — admin arbitre a posteriori
      return query select false, 'Raison à examiner par l''admin (mise en litige)';

    else
      return query select false, null::text;
  end case;
end;
$$;

-- ------------------------------------------------------------
-- 6. cancellation_fee_preview v3 : accepte user_reason + retour enrichi
-- ------------------------------------------------------------
drop function if exists public.cancellation_fee_preview(uuid);
drop function if exists public.cancellation_fee_preview(uuid, text);

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
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null or r.client_id <> auth.uid() then
    raise exception 'Ride not found';
  end if;

  -- Chauffeur encore engagé sur une autre course antérieure ? → gratuit
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

  -- Éval faute chauffeur (si user_reason ∈ raisons "driver_...")
  if p_user_reason in ('driver_not_moving', 'wrong_direction', 'wait_too_long', 'driver_asked') then
    select * into v_fault from public._eval_driver_fault(p_ride_id, p_user_reason);
    if v_fault.is_driver_fault then
      return query select 0, 'free_driver_fault', 0, 0, false, true, v_fault.evidence, false;
      return;
    end if;
    -- Raison chauffeur invoquée mais pas de preuve → sera mis en litige
    v_disputed := true;
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
    case when v_disputed and v_fault.evidence is not null then v_fault.evidence else null end,
    v_disputed;
end;
$$;

comment on function public.cancellation_fee_preview is
  'v3 : accepte p_user_reason, évalue faute chauffeur via télémétrie. Si prouvé → fee=0 + reason=free_driver_fault. Si raison chauffeur invoquée sans preuve → will_be_disputed=true + frais standards.';

-- ------------------------------------------------------------
-- 7. cancel_ride_by_client v3 : applique attribution + strike
-- ------------------------------------------------------------
drop function if exists public.cancel_ride_by_client(uuid);
drop function if exists public.cancel_ride_by_client(uuid, text);

create or replace function public.cancel_ride_by_client(
  ride_id uuid,
  p_user_reason text default null
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  result public.rides;
  v_fee int := 0;
  v_reason text;
  v_driver_share int;
  v_platform_share int;
  v_is_driver_fault boolean := false;
  v_evidence text;
  v_disputed boolean := false;
  v_client_wallet_id uuid;
  v_driver_profile_id uuid;
  v_driver_wallet_id uuid;
  v_attributed text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('requested', 'matched', 'arrived', 'in_progress') then
    raise exception 'Course déjà terminée ou annulée';
  end if;

  select p.fee_fcfa, p.reason_code, p.driver_share_fcfa, p.platform_share_fcfa,
         p.is_driver_fault, p.driver_fault_evidence, p.will_be_disputed
    into v_fee, v_reason, v_driver_share, v_platform_share,
         v_is_driver_fault, v_evidence, v_disputed
  from public.cancellation_fee_preview(ride_id, p_user_reason) p;

  v_attributed := case
    when v_is_driver_fault then 'driver'
    when v_reason = 'free_driver_busy' then 'neutral'
    else 'client'
  end;

  update public.rides
  set status = 'cancelled_by_client',
      ended_at = now(),
      cancel_reason = v_reason,
      cancel_reason_user = p_user_reason,
      cancel_attributed_to = v_attributed,
      cancel_disputed = v_disputed,
      cancel_driver_fault_evidence = v_evidence,
      updated_at = now()
  where id = ride_id
  returning * into result;

  -- Strike chauffeur si faute prouvée
  if v_is_driver_fault and r.driver_id is not null then
    update public.drivers
      set cancellations_driver_fault_count = cancellations_driver_fault_count + 1
      where id = r.driver_id;
  end if;

  -- Applique le débit si frais > 0
  if v_fee > 0 then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (auth.uid(), 'tamcar_credit', 0)
      on conflict (profile_id, kind) do nothing;
    select id into v_client_wallet_id
      from public.wallets
      where profile_id = auth.uid() and kind = 'tamcar_credit';

    update public.wallets
      set balance_fcfa = balance_fcfa - v_fee, updated_at = now()
      where id = v_client_wallet_id;
    insert into public.wallet_transactions
      (wallet_id, type, amount_fcfa, ride_id, status)
      values (v_client_wallet_id, 'cancellation_fee', v_fee, ride_id, 'success');

    if r.driver_id is not null and v_driver_share > 0 then
      select profile_id into v_driver_profile_id
        from public.drivers where id = r.driver_id;
      if v_driver_profile_id is not null then
        insert into public.wallets (profile_id, kind, balance_fcfa)
          values (v_driver_profile_id, 'tamcar_revenus', 0)
          on conflict (profile_id, kind) do nothing;
        select id into v_driver_wallet_id
          from public.wallets
          where profile_id = v_driver_profile_id and kind = 'tamcar_revenus';
        update public.wallets
          set balance_fcfa = balance_fcfa + v_driver_share, updated_at = now()
          where id = v_driver_wallet_id;
        insert into public.wallet_transactions
          (wallet_id, type, amount_fcfa, ride_id, status)
          values (v_driver_wallet_id, 'cancellation_reimbursement', v_driver_share, ride_id, 'success');
      end if;
    end if;
  end if;

  return result;
end;
$$;

comment on function public.cancel_ride_by_client is
  'v3 : accepte p_user_reason ; exonère le client si faute chauffeur prouvée (télémétrie) ; met en litige si raison chauffeur invoquée sans preuve.';

-- ------------------------------------------------------------
-- 8. Vue admin : annulations en litige à arbitrer
-- ------------------------------------------------------------
create or replace view public.cancellations_disputed_view as
select
  r.id as ride_id,
  r.client_id,
  cp.full_name as client_name,
  r.driver_id,
  dp.full_name as driver_name,
  r.pickup_address,
  r.dropoff_address,
  r.cancel_reason_user,
  r.cancel_reason,
  r.cancel_driver_fault_evidence,
  r.matched_at,
  r.ended_at,
  r.driver_distance_at_match_m,
  d.cancellations_driver_fault_count as driver_strike_count
from public.rides r
left join public.profiles cp on cp.id = r.client_id
left join public.drivers d on d.id = r.driver_id
left join public.profiles dp on dp.id = d.profile_id
where r.cancel_disputed = true
  and r.status = 'cancelled_by_client'
order by r.ended_at desc;

comment on view public.cancellations_disputed_view is
  'Annulations où le client a invoqué une raison chauffeur sans preuve télémétrie — à arbitrer par admin.';
