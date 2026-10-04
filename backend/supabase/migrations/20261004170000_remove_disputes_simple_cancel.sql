-- ============================================================
-- TamCar — Suppression des litiges ; annulation client simplifiée (2026-10-04)
--
--   Décision de Terence : on supprime TOUTE la partie litiges (motifs d'annulation,
--   preuves GPS, contestations, strikes, points de fiabilité, moteur automatique,
--   page admin). Il ne reste que deux cas où le client paie, 300 F débités de son
--   portefeuille TamCar Crédit :
--     - le chauffeur est arrivé au point de prise en charge ;
--     - le chauffeur est à moins d'une minute du point de prise en charge
--       (≈ 250 m, réglage `cancel_fee_radius_m`).
--   Dans tous les autres cas l'annulation est gratuite (avant attribution, dans
--   les 30 s suivant l'attribution, chauffeur encore loin, chauffeur occupé
--   ailleurs). Inchangés : réservation tardive (200 F) et course commencée (50 %).
-- ============================================================

-- A. Réglages -------------------------------------------------------------
insert into public.program_rules (key, value, label) values
  ('cancel_fee_fcfa',     300, 'Annulation par le client : frais quand le chauffeur est arrivé ou à moins d''une minute (F)'),
  ('cancel_fee_radius_m', 250, 'Annulation : distance du chauffeur au point de prise en charge comptée comme « moins d''une minute » (m)')
on conflict (key) do nothing;

-- B. Badge « Litiges » retiré des compteurs admin -------------------------------
create or replace function public.admin_badge_counts()
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.is_admin() then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'sos',             (select count(*) from public.sos_alerts where status = 'open'),
    'sos_active',      (select count(*) from public.sos_alerts where status <> 'resolved'),
    'debts',           (select count(*) from public.admin_alerts where kind = 'driver_debt' and seen_at is null),
    'debts_suspended', (select count(*) from public.drivers where status::text = 'suspended' and suspension_reason = 'debt'),
    'disputes',        0
  );
end;
$fn$;
revoke execute on function public.admin_badge_counts() from public, anon;
grant execute on function public.admin_badge_counts() to authenticated;

-- C. Annulation : aperçu des frais (même signature et mêmes colonnes) ----------
create or replace function public.cancellation_fee_preview(p_ride_id uuid, p_user_reason text default null)
returns table (
  fee_fcfa int, reason_code text, driver_share_fcfa int, platform_share_fcfa int,
  driver_still_busy_elsewhere boolean, is_driver_fault boolean, driver_fault_evidence text, will_be_disputed boolean
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  r public.rides;
  drv public.drivers;
  v_fee int := 0;
  v_reason text := 'free';
  v_busy boolean := false;
  v_secs int;
  v_dist int;
  v_fee_amt int := public._program_rule('cancel_fee_fcfa');
  v_radius int := public._program_rule('cancel_fee_radius_m');
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r.id is null or r.client_id <> auth.uid() then raise exception 'Ride not found'; end if;

  -- Chauffeur encore engagé sur une course antérieure : gratuit
  if r.driver_id is not null then
    v_busy := exists (
      select 1 from public.rides other
      where other.driver_id = r.driver_id and other.id <> r.id
        and other.status in ('matched', 'arrived', 'in_progress')
        and other.matched_at < r.matched_at);
    if v_busy then
      return query select 0, 'free_driver_busy', 0, 0, true, false, null::text, false;
      return;
    end if;
  end if;

  -- Réservation à moins de 10 min du départ : tarif annoncé dans les rappels (inchangé)
  if public._booking_is_late(r) and r.status in ('matched', 'arrived') then
    return query select 200, 'booking_late', 200, 0, false, false, null::text, false;
    return;
  end if;

  case
    when r.status = 'requested' then
      v_reason := 'free_no_match';
    when r.status = 'matched' then
      v_secs := extract(epoch from (now() - r.matched_at))::int;
      if v_secs <= 30 then
        v_reason := 'free_within_30s';
      else
        select * into drv from public.drivers where id = r.driver_id;
        v_dist := case when drv.current_location is null or r.pickup_location is null then null
                       else st_distance(drv.current_location, r.pickup_location)::int end;
        if v_dist is not null and v_dist <= v_radius then
          v_fee := v_fee_amt; v_reason := 'driver_near';
        else
          v_reason := 'free_driver_far';
        end if;
      end if;
    when r.status = 'arrived' then
      v_fee := v_fee_amt; v_reason := 'driver_arrived';
    when r.status = 'in_progress' then
      v_fee := public.round_to_50((r.price_total_fcfa * 0.50)::int); v_reason := 'ride_started';
    else
      v_reason := 'not_cancellable';
  end case;

  return query select v_fee, v_reason, (v_fee / 2)::int, v_fee - (v_fee / 2)::int, false, false, null::text, false;
end;
$fn$;
revoke execute on function public.cancellation_fee_preview(uuid, text) from public, anon;
grant execute on function public.cancellation_fee_preview(uuid, text) to authenticated;

-- D. Annulation par le client : plus de motif, plus de faute chauffeur ----------
create or replace function public.cancel_ride_by_client(ride_id uuid, p_user_reason text default null)
returns public.rides
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  result public.rides;
  v_fee int := 0;
  v_reason text;
  v_driver_share int;
  v_client_wallet_id uuid;
  v_driver_profile_id uuid;
  v_driver_wallet_id uuid;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = ride_id;
  if r.id is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('requested', 'matched', 'arrived', 'in_progress') then
    raise exception 'Course déjà terminée ou annulée';
  end if;

  select p.fee_fcfa, p.reason_code, p.driver_share_fcfa
    into v_fee, v_reason, v_driver_share
  from public.cancellation_fee_preview(ride_id, null) p;

  update public.rides
     set status = 'cancelled_by_client',
         ended_at = now(),
         cancel_reason = v_reason,
         cancel_attributed_to = case when v_reason = 'free_driver_busy' then 'neutral' else 'client' end,
         cancel_disputed = false,
         updated_at = now()
   where id = ride_id
   returning * into result;

  if v_fee > 0 then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (auth.uid(), 'tamcar_credit', 0)
      on conflict (profile_id, kind) do nothing;
    select id into v_client_wallet_id
      from public.wallets where profile_id = auth.uid() and kind = 'tamcar_credit';
    update public.wallets
       set balance_fcfa = balance_fcfa - v_fee, updated_at = now()
     where id = v_client_wallet_id;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
      values (v_client_wallet_id, 'cancellation_fee', v_fee, ride_id, 'success');

    -- La moitié des frais revient au chauffeur pour son déplacement
    if r.driver_id is not null and v_driver_share > 0 then
      select profile_id into v_driver_profile_id from public.drivers where id = r.driver_id;
      if v_driver_profile_id is not null then
        insert into public.wallets (profile_id, kind, balance_fcfa)
          values (v_driver_profile_id, 'tamcar_revenus', 0)
          on conflict (profile_id, kind) do nothing;
        select id into v_driver_wallet_id
          from public.wallets where profile_id = v_driver_profile_id and kind = 'tamcar_revenus';
        update public.wallets
           set balance_fcfa = balance_fcfa + v_driver_share, updated_at = now()
         where id = v_driver_wallet_id;
        insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
          values (v_driver_wallet_id, 'cancellation_reimbursement', v_driver_share, ride_id, 'success');
      end if;
    end if;
  end if;

  return result;
end;
$fn$;
revoke execute on function public.cancel_ride_by_client(uuid, text) from public, anon;
grant execute on function public.cancel_ride_by_client(uuid, text) to authenticated;

-- E. Strikes : retour au « sans effet » (appelé par l'annulation volontaire du chauffeur)
create or replace function public._apply_driver_strike(p_driver_id uuid, p_ride_id uuid, p_reason_label text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  return;
end;
$fn$;
revoke execute on function public._apply_driver_strike(uuid, uuid, text) from public, anon, authenticated;

-- F. Suppression du moteur de litiges ---------------------------------------
drop trigger if exists rides_dispute_claim on public.rides;
drop trigger if exists rides_dispute_contest on public.rides;
drop trigger if exists rides_dispute_close on public.rides;
drop trigger if exists rides_strike_revoked on public.rides;

do $cron$
begin
  perform cron.unschedule('dispute-sweep');
exception when others then null;
end
$cron$;

do $drop$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in (
         '_dispute_rule', 'admin_set_dispute_rule', '_driver_active_points', 'my_reliability',
         '_strike_revoked_cleanup', '_dispute_apply_verdict', 'admin_resolve_cancellation_dispute',
         '_dispute_notify', '_dispute_decide_claim', '_dispute_decide_contest',
         '_dispute_trg_claim', '_dispute_trg_contest', '_dispute_trg_close', '_dispute_sweep',
         'client_appeal_dispute', 'client_dispute_for_ride', 'admin_dispute_queue',
         'admin_dispute_recent', 'admin_audit_case', 'admin_dispute_metrics',
         'admin_resolve_strike_dispute', 'driver_dispute_strike', 'my_driver_strikes',
         '_eval_driver_fault')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end
$drop$;

drop view if exists public.cancellations_disputed_view;
drop table if exists public.dispute_cases cascade;
drop table if exists public.dispute_rules cascade;
drop table if exists public.reliability_events cascade;

-- Les alertes « litige » déjà émises n'ont plus de sens
delete from public.admin_alerts where kind in ('dispute_review', 'driver_points');
