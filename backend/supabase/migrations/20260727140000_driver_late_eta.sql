-- ============================================================
-- Annulation v2 (delta 1/2) : « chauffeur en retard » = ETA + 5 min
-- (décision Terence 2026-07-27, remplace le seuil fixe de 8 min).
--
-- Contexte : le système de faute chauffeur existe déjà (20260720000000).
-- accept_ride capture déjà driver_distance_at_match_m (distance chauffeur→
-- point de départ à l'instant du match). On en déduit une ETA déterministe :
--   ETA_secondes ≈ distance_m × 1.4 (détour routier) ÷ 5 m/s (≈ 18 km/h ville)
-- puis « en retard » si l'attente dépasse ETA + 5 min.
--
-- On ne redéfinit QUE _eval_driver_fault ; le reste (preview, cancel, strikes,
-- litiges) est inchangé et continue d'appeler ce helper.
-- ============================================================

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
  v_eta_secs int;
  v_late_threshold int;
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
      -- « En retard » = attente > ETA + 5 min (ETA déduite de la distance au match).
      -- ETA bornée à [2 min, 25 min] pour rester juste (un chauffeur légitimement
      -- loin a droit à plus de temps ; un chauffeur tout proche ne peut pas traîner).
      v_eta_secs := least(1500, greatest(120,
        ceil(coalesce(nullif(r.driver_distance_at_match_m, 0), 1000)::numeric * 1.4 / 5.0)::int
      ));
      v_late_threshold := v_eta_secs + 300; -- + 5 min de marge
      if v_secs_matched > v_late_threshold then
        return query select true,
          'Attente ' || (v_secs_matched / 60)::text || ' min — au-delà de l''ETA ('
          || (v_eta_secs / 60)::text || ' min) + 5 min de marge';
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

comment on function public._eval_driver_fault is
  'v2 : « en retard » basé sur ETA (distance au match) + 5 min, au lieu d''un seuil fixe. Immobile / mauvaise direction inchangés.';
