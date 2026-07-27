-- ============================================================
-- Annulation v2 (delta 2/2) — décision Terence 2026-07-27 :
--   • Crédit d'excuse 200 F (TamCar Crédit) au client quand le chauffeur
--     abandonne de façon FLAGRANTE (Option B), plafonné à 2 / 7 jours.
--   • Nouvelle RPC cancel_ride_by_driver : le chauffeur peut annuler lui-même
--     → strike + crédit d'excuse au client + 0 F facturé.
--
-- « Flagrant » = immobile OU s'éloigne OU très en retard (> ETA + 10 min).
-- Un simple retard (ETA + 5 à 10 min) reste gratuit mais SANS crédit.
-- ============================================================

alter type wallet_tx_type add value if not exists 'goodwill_credit';

-- ------------------------------------------------------------
-- 1. Helper ETA (source unique) : distance au match → secondes estimées.
--    dist × 1.4 (détour) ÷ 5 m/s (~18 km/h), borné [2 min, 25 min].
-- ------------------------------------------------------------
create or replace function public._driver_eta_secs(p_distance_m int)
returns int language sql immutable as $$
  select least(1500, greatest(120,
    ceil(coalesce(nullif(p_distance_m, 0), 1000)::numeric * 1.4 / 5.0)::int
  ));
$$;

-- ------------------------------------------------------------
-- 2. _eval_driver_fault : utilise désormais le helper _driver_eta_secs
--    (identique à 20260727140000, factorisé).
-- ------------------------------------------------------------
create or replace function public._eval_driver_fault(
  p_ride_id uuid,
  p_user_reason text
)
returns table (is_driver_fault boolean, evidence text)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rides;
  drv public.drivers;
  v_dist_now int;
  v_ratio numeric;
  v_secs_matched int;
  v_secs_still int;
  v_late_threshold int;
begin
  if p_user_reason is null then
    return query select false, null::text; return;
  end if;
  select * into r from public.rides where id = p_ride_id;
  if r is null or r.driver_id is null then
    return query select false, null::text; return;
  end if;
  if r.status not in ('matched', 'arrived') then
    return query select false, null::text; return;
  end if;
  select * into drv from public.drivers where id = r.driver_id;
  v_secs_matched := extract(epoch from (now() - r.matched_at))::int;

  case p_user_reason
    when 'driver_not_moving' then
      if v_secs_matched < 90 then
        return query select false, null::text; return;
      end if;
      if drv.last_moved_at is null then
        return query select true,
          'Position chauffeur inchangée depuis le match (' || (v_secs_matched / 60)::text || ' min)';
        return;
      end if;
      v_secs_still := extract(epoch from (now() - drv.last_moved_at))::int;
      if v_secs_still > 90 then
        return query select true,
          'Chauffeur immobile depuis ' || (v_secs_still / 60)::text || ' min ' || (v_secs_still % 60)::text || ' s';
        return;
      end if;
      return query select false, null::text;

    when 'wrong_direction' then
      if drv.current_location is null or r.driver_distance_at_match_m is null then
        return query select false, null::text; return;
      end if;
      v_dist_now := st_distance(drv.current_location, r.pickup_location)::int;
      if r.driver_distance_at_match_m <= 0 then
        return query select false, null::text; return;
      end if;
      v_ratio := v_dist_now::numeric / r.driver_distance_at_match_m::numeric;
      if v_ratio > 1.3 and (v_dist_now - r.driver_distance_at_match_m) > 300 then
        return query select true,
          'Chauffeur s''est éloigné : ' || r.driver_distance_at_match_m::text || ' m → ' || v_dist_now::text || ' m';
        return;
      end if;
      return query select false, null::text;

    when 'wait_too_long' then
      v_late_threshold := public._driver_eta_secs(r.driver_distance_at_match_m) + 300; -- ETA + 5 min
      if v_secs_matched > v_late_threshold then
        return query select true,
          'Attente ' || (v_secs_matched / 60)::text || ' min — au-delà de l''ETA + 5 min';
        return;
      end if;
      return query select false, null::text;

    when 'driver_asked' then
      return query select false, 'Raison à examiner par l''admin (mise en litige)';
    else
      return query select false, null::text;
  end case;
end;
$$;

-- ------------------------------------------------------------
-- 3. _grant_goodwill_credit : 200 F au client, plafonné 2 / 7 jours.
-- ------------------------------------------------------------
create or replace function public._grant_goodwill_credit(
  p_client_id uuid,
  p_ride_id uuid
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_recent int;
  v_wallet_id uuid;
begin
  if p_client_id is null then return; end if;

  select count(*) into v_recent
    from public.wallet_transactions wt
    join public.wallets w on w.id = wt.wallet_id
    where w.profile_id = p_client_id
      and w.kind = 'tamcar_credit'
      and wt.type = 'goodwill_credit'
      and wt.created_at > now() - interval '7 days';
  if v_recent >= 2 then return; end if; -- plafond anti-abus

  insert into public.wallets (profile_id, kind, balance_fcfa)
    values (p_client_id, 'tamcar_credit', 0)
    on conflict (profile_id, kind) do nothing;
  select id into v_wallet_id
    from public.wallets where profile_id = p_client_id and kind = 'tamcar_credit';

  update public.wallets
    set balance_fcfa = balance_fcfa + 200, updated_at = now()
    where id = v_wallet_id;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
    values (v_wallet_id, 'goodwill_credit', 200, p_ride_id, 'success');
end;
$$;

comment on function public._grant_goodwill_credit is
  'Crédite 200 F de TamCar Crédit au client (excuse abandon chauffeur), plafonné à 2 sur 7 jours glissants.';

-- ------------------------------------------------------------
-- 4. cancel_ride_by_client v3.2 : ajoute le crédit d'excuse flagrant (Option B)
-- ------------------------------------------------------------
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
  v_secs_matched int;
  v_flagrant boolean;
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
    perform public._apply_driver_strike(
      r.driver_id, ride_id, coalesce(v_evidence, p_user_reason, 'faute prouvée')
    );

    -- Crédit d'excuse — Option B : uniquement abandon FLAGRANT.
    v_secs_matched := extract(epoch from (now() - r.matched_at))::int;
    v_flagrant :=
      (p_user_reason in ('driver_not_moving', 'wrong_direction'))
      or (p_user_reason = 'wait_too_long'
          and v_secs_matched > public._driver_eta_secs(r.driver_distance_at_match_m) + 600); -- ETA + 10 min
    if v_flagrant then
      perform public._grant_goodwill_credit(r.client_id, ride_id);
    end if;
  end if;

  if v_fee > 0 then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (auth.uid(), 'tamcar_credit', 0)
      on conflict (profile_id, kind) do nothing;
    select id into v_client_wallet_id
      from public.wallets where profile_id = auth.uid() and kind = 'tamcar_credit';
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
          from public.wallets where profile_id = v_driver_profile_id and kind = 'tamcar_revenus';
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

-- ------------------------------------------------------------
-- 5. cancel_ride_by_driver : le chauffeur annule → strike + crédit client, 0 F.
-- ------------------------------------------------------------
create or replace function public.cancel_ride_by_driver(
  ride_id uuid,
  p_reason text default null
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  result public.rides;
  v_driver public.drivers;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Course introuvable'; end if;
  if r.driver_id is null then raise exception 'Aucun chauffeur sur cette course'; end if;

  select * into v_driver from public.drivers where id = r.driver_id;
  if v_driver.profile_id is null or v_driver.profile_id <> auth.uid() then
    raise exception 'Ce n''est pas votre course';
  end if;
  if r.status not in ('matched', 'arrived') then
    raise exception 'Annulation impossible à ce stade';
  end if;

  update public.rides
  set status = 'cancelled_by_driver',
      ended_at = now(),
      cancel_reason = 'driver_cancelled',
      cancel_reason_user = p_reason,
      cancel_attributed_to = 'driver',
      cancel_driver_fault_evidence =
        'Annulation volontaire du chauffeur' || coalesce(' : ' || nullif(trim(p_reason), ''), ''),
      updated_at = now()
  where id = ride_id
  returning * into result;

  -- Strike chauffeur (faute volontaire) + push + auto-suspension au seuil
  update public.drivers
    set cancellations_driver_fault_count = cancellations_driver_fault_count + 1
    where id = r.driver_id;
  perform public._apply_driver_strike(r.driver_id, ride_id, 'Annulation volontaire du chauffeur');

  -- Crédit d'excuse au client (abandon flagrant par définition), plafonné.
  perform public._grant_goodwill_credit(r.client_id, ride_id);

  return result;
end;
$$;

comment on function public.cancel_ride_by_driver is
  'Le chauffeur annule une course acceptée (matched/arrived) : statut cancelled_by_driver, strike + auto-suspension, crédit d''excuse au client, aucun frais client.';

grant execute on function public.cancel_ride_by_driver(uuid, text) to authenticated;
