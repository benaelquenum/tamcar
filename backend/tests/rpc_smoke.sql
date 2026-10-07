-- Test de contrat : toutes les fonctions de LECTURE exposées sont appelées pour chaque rôle avec des paramètres réalistes.
-- Une erreur de classe 42 (colonne / fonction / relation inexistante, droit manquant), XX, 0A ou 22P = BUG.
-- Les refus métier (P0001), « Auth required » et les droits refusés à un rôle non concerné sont normaux.
-- GÉNÉRÉ par scratchpad/review/gen_smoke.py ; usage : supabase db query --linked -f backend/tests/rpc_smoke.sql --workdir backend
create or replace function pg_temp.try_call(p_fn text, p_args text) returns void language plpgsql as $f$
declare
  v_sql text;
  v_state text;
  v_msg text;
begin
  v_sql := replace(replace(replace(format('select * from public.%I(%s)', p_fn, p_args), ':ride', quote_literal(current_setting('smoke.ride'))||'::uuid'),
                           ':drv', quote_literal(current_setting('smoke.drv'))||'::uuid'),
                   ':uid', quote_literal(current_setting('smoke.uid'))||'::uuid');
  begin
    execute v_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state like '42%' and v_state <> '42501' or v_state like 'XX%' or v_state like '0A%' or v_state like '22P%' or v_state like '53%' or v_state like '54%' or v_state like '58%'
       or v_state like '2F%' or v_state like '21%' or v_state = '42501' and current_setting('smoke.role') <> 'anon' and v_msg not ilike '%execute%' then
      perform set_config('smoke.bugs', current_setting('smoke.bugs') || current_setting('smoke.role') || ' ' || p_fn || ' [' || v_state || '] ' || left(v_msg, 110) || E'\n', true);
    end if;
  end;
end $f$;

do $$
declare
  c uuid; d_prof uuid; adm uuid; dealer uuid; ops uuid; ride uuid; drv uuid;
  roles uuid[]; labels text[]; i int; n int;
begin
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  select dr.profile_id, dr.id into d_prof, drv from public.drivers dr where dr.status = 'active' limit 1;
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select profile_id into dealer from public.dealer_partners limit 1;
  select profile_id into ops from public.ops_city_managers limit 1;
  select r0.id into ride from public.rides r0 where r0.client_id = c order by r0.requested_at desc limit 1;
  perform set_config('smoke.ride', ride::text, true);
  perform set_config('smoke.drv', drv::text, true);
  perform set_config('smoke.bugs', '', true);
  roles := array[c, d_prof, adm, dealer, ops];
  labels := array['client', 'chauffeur', 'admin', 'partenaire', 'responsable-ville'];
  for i in 1 .. array_length(roles, 1) loop
    continue when roles[i] is null;
    perform set_config('smoke.uid', roles[i]::text, true);
    perform set_config('smoke.role', labels[i], true);
    perform set_config('request.jwt.claims', json_build_object('sub', roles[i], 'role', 'authenticated')::text, true);
    set local role authenticated;
      perform pg_temp.try_call('admin_active_drivers', '');
      perform pg_temp.try_call('admin_available_rental_drivers', $a$now(), now(), 'moto', :ride$a$);
      perform pg_temp.try_call('admin_badge_counts', '');
      perform pg_temp.try_call('admin_bonus_summary', '');
      perform pg_temp.try_call('admin_city_managers', '');
      perform pg_temp.try_call('admin_dealer_wallets', '');
      perform pg_temp.try_call('admin_driver_debts', '');
      perform pg_temp.try_call('admin_driver_history', $a$:drv, null, 10, 10$a$);
      perform pg_temp.try_call('admin_driver_history_counts', $a$:drv$a$);
      perform pg_temp.try_call('admin_driver_payouts', $a$'open'$a$);
      perform pg_temp.try_call('admin_driver_summary', $a$:drv$a$);
      perform pg_temp.try_call('admin_find_client', $a$'a'$a$);
      perform pg_temp.try_call('admin_live_driver_detail', $a$:drv$a$);
      perform pg_temp.try_call('admin_live_drivers', '');
      perform pg_temp.try_call('admin_ops_wallets', '');
      perform pg_temp.try_call('admin_tamassur_withdrawals', '');
      perform pg_temp.try_call('admin_unpaid_insurance', '');
      perform pg_temp.try_call('admin_vehicle_rentals', $a$'open'$a$);
      perform pg_temp.try_call('available_slots', $a$10$a$);
      perform pg_temp.try_call('cancellation_fee_preview', $a$:ride, 'a'$a$);
      perform pg_temp.try_call('ceil_to_50', $a$10$a$);
      perform pg_temp.try_call('compute_price', $a$6.4969, 2.6283, 6.4969, 2.6283, 5, 10, 'moto', false, false$a$);
      perform pg_temp.try_call('compute_revenue_share', $a$10$a$);
      perform pg_temp.try_call('dealer_my_daily', $a$null::uuid$a$);
      perform pg_temp.try_call('dealer_my_months', $a$null::uuid, 10$a$);
      perform pg_temp.try_call('dealer_my_payouts', $a$null::uuid, 10$a$);
      perform pg_temp.try_call('dealer_my_recent', $a$null::uuid, 10$a$);
      perform pg_temp.try_call('dealer_my_summary', $a$null::uuid$a$);
      perform pg_temp.try_call('dealer_my_vehicles', $a$null::uuid$a$);
      perform pg_temp.try_call('driver_active_ride_of', $a$:ride$a$);
      perform pg_temp.try_call('driver_bookings', $a$'open'$a$);
      perform pg_temp.try_call('driver_my_vehicle_rentals', $a$'open'$a$);
      perform pg_temp.try_call('driver_oneshot_requests', '');
      perform pg_temp.try_call('driver_photo_verified', $a$:ride$a$);
      perform pg_temp.try_call('driver_stats', $a$10$a$);
      perform pg_temp.try_call('driver_today_progress', $a$:drv$a$);
      perform pg_temp.try_call('driver_today_rides_count', $a$:drv$a$);
      perform pg_temp.try_call('driver_today_volume', $a$:drv$a$);
      perform pg_temp.try_call('drivers_availability_by_category', $a$6.4969, 2.6283, 5$a$);
      perform pg_temp.try_call('drivers_nearby', $a$6.4969, 2.6283, 5$a$);
      perform pg_temp.try_call('f_unaccent', $a$'a'$a$);
      perform pg_temp.try_call('find_nearby_drivers', $a$6.4969, 2.6283, 5, 10$a$);
      perform pg_temp.try_call('has_rated_ride', $a$:ride$a$);
      perform pg_temp.try_call('is_admin', '');
      perform pg_temp.try_call('is_backoffice', '');
      perform pg_temp.try_call('is_backoffice_reader', '');
      perform pg_temp.try_call('is_driver_senior', $a$:drv$a$);
      perform pg_temp.try_call('my_accepted_scheduled_rides', '');
      perform pg_temp.try_call('my_active_ride', '');
      perform pg_temp.try_call('my_appointment', '');
      perform pg_temp.try_call('my_approach_plan', '');
      perform pg_temp.try_call('my_bookings', $a$'open'$a$);
      perform pg_temp.try_call('my_driver_payouts', $a$10$a$);
      perform pg_temp.try_call('my_favorite_places', '');
      perform pg_temp.try_call('my_incoming_call', $a$:ride$a$);
      perform pg_temp.try_call('my_insurance_status', '');
      perform pg_temp.try_call('my_pending_oneshot', '');
      perform pg_temp.try_call('my_recent_destinations', $a$10$a$);
      perform pg_temp.try_call('my_recent_drivers', $a$10$a$);
      perform pg_temp.try_call('my_scheduled_rides', '');
      perform pg_temp.try_call('my_tamassur', '');
      perform pg_temp.try_call('my_tamassur_plan', '');
      perform pg_temp.try_call('my_tamassur_withdrawals', '');
      perform pg_temp.try_call('my_unread_messages_count', '');
      perform pg_temp.try_call('my_vehicle_rentals', $a$'open'$a$);
      perform pg_temp.try_call('my_wallets', '');
      perform pg_temp.try_call('nearby_drivers_for_map', $a$6.4969, 2.6283, 5, 10$a$);
      perform pg_temp.try_call('ops_city_for_point', $a$6.4969, 2.6283$a$);
      perform pg_temp.try_call('ops_is_manager', '');
      perform pg_temp.try_call('ops_my_daily', $a$current_date$a$);
      perform pg_temp.try_call('ops_my_dashboard', $a$current_date$a$);
      perform pg_temp.try_call('ops_my_months', $a$10$a$);
      perform pg_temp.try_call('ops_pro_daily', '');
      perform pg_temp.try_call('ops_pro_drivers', '');
      perform pg_temp.try_call('ops_pro_summary', '');
      perform pg_temp.try_call('pending_rides_for_driver', $a$5$a$);
      perform pg_temp.try_call('pending_scheduled_rides_for_driver', $a$5$a$);
      perform pg_temp.try_call('preview_alternative_offers', $a$:ride$a$);
      perform pg_temp.try_call('preview_downgrade_price', $a$:ride$a$);
      perform pg_temp.try_call('preview_promo_code', $a$'x', 10$a$);
      perform pg_temp.try_call('public_ride_track', $a$'x'$a$);
      perform pg_temp.try_call('quote_ride_route_change', $a$:ride, 5, 10, 6.4969, 2.6283$a$);
      perform pg_temp.try_call('recent_addresses_for_user', $a$10$a$);
      perform pg_temp.try_call('rental_quote', $a$now(), 10, 'moto'$a$);
      perform pg_temp.try_call('ride_messages_history', $a$:ride$a$);
      perform pg_temp.try_call('ride_ring_plan', '');
      perform pg_temp.try_call('ride_stops_of', $a$:ride$a$);
      perform pg_temp.try_call('ride_with_driver_details', $a$:ride$a$);
      perform pg_temp.try_call('round_to_50', $a$10$a$);
      perform pg_temp.try_call('search_places', $a$'a', 2.6283, 6.4969, 10$a$);
      perform pg_temp.try_call('tampass_driver_planning', $a$current_date$a$);
      perform pg_temp.try_call('tampass_driver_subscriptions', '');
      perform pg_temp.try_call('tampass_open_offers', '');
      perform pg_temp.try_call('tampass_pass_detail', $a$:ride$a$);
      perform pg_temp.try_call('wallet_transactions_for_user', $a$10$a$);
    reset role;
  end loop;
  raise exception E'RESULTATS % fonctions x % rôles\n%', 95, array_length(labels, 1),
    case when current_setting('smoke.bugs') = '' then 'aucune erreur d''exécution' else current_setting('smoke.bugs') end;
end $$;
