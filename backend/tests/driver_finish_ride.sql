-- Fin de course par le chauffeur : contrôles, prix, trace, litige, contestation, décision admin. Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/driver_finish_ride.sql --workdir backend  (résultat dans « RESULTATS »)
do $$
declare
  c uuid; adm uuid; d_id uuid; d_prof uuid; other uuid; d2_prof uuid;
  r public.rides; r2 public.rides; rv public.ride_end_reviews;
  res jsonb; info jsonb; prev jsonb;
  out text := '';
  k int; n int; v int; s int;
  plat double precision := 6.4969; plng double precision := 2.6283;
  dlat double precision := 6.5100; dlng double precision := 2.6000;
  off double precision; roff double precision; reason text; rtext text; mins int; stale boolean; err_first boolean;
  ride_ids uuid[] := '{}';
  w_cr_before int; w_cr_after int; warns_before int; warns_after int; stt text;
begin
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  select dr.id, dr.profile_id into d_id, d_prof
    from public.drivers dr join public.vehicles v on v.id = dr.current_vehicle_id
   where dr.status = 'active' and v.category = 'moto'
     and not exists (select 1 from public.rides ra where ra.driver_id = dr.id and ra.status in ('matched', 'arrived', 'in_progress'))
   limit 1;
  select p.id into other from public.profiles p where p.role::text = 'client' and p.id <> c limit 1;
  select dr.profile_id into d2_prof from public.drivers dr where dr.id <> d_id and dr.status = 'active' limit 1;

  -- le portefeuille Revenus du chauffeur d'essai est regarni (sinon la suspension pour dette peut s'enclencher en cours de test)
  update public.wallets set balance_fcfa = 50000 where profile_id = d_prof and kind = 'tamcar_revenus';

  for k in 1..8 loop
    off := 0.02; roff := 0.02; reason := null; rtext := null; mins := 1; stale := false; err_first := false;
    if k = 1 then off := 0.0009; roff := 0.0009; end if;
    if k = 2 then err_first := true; end if;
    if k = 3 then reason := 'client_asked_stop'; end if;
    if k = 4 then mins := 40; end if;
    if k = 5 then reason := 'other'; rtext := ''; err_first := true; end if;
    if k = 6 then reason := 'client_left'; end if;
    if k = 7 then off := 0.0009; roff := 0.0009; stale := true; end if;
    if k = 8 then roff := 0.0009; reason := 'other'; rtext := 'test position incoherente'; end if;

    -- le client commande ; le chauffeur accepte, arrive, démarre
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.create_ride('moto', plat, plng, 'Test départ', dlat, dlng, 'Test arrivée', 3.2, 12, false, false);
    reset role;
    update public.drivers set is_online = true, current_location = st_setsrid(st_makepoint(plng + 0.0005, plat), 4326)::geography,
           last_seen_at = now(), updated_at = now() where id = d_id;
    perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.accept_ride(r.id); r := public.driver_arrived(r.id, 15); r := public.driver_start_ride(r.id);
    reset role;
    ride_ids := ride_ids || r.id;

    -- le véhicule roule : position, ancienneté de la course, fraîcheur du signal
    update public.drivers set current_location = st_setsrid(st_makepoint(dlng, dlat - off), 4326)::geography,
           last_seen_at = case when stale then now() - interval '10 minutes' else now() end where id = d_id;
    update public.rides set started_at = now() - make_interval(mins => mins) where id = r.id;
    if k = 3 then update public.rides set price_total_fcfa = 1500, driver_share_fcfa = 600, driver_rachat_fcfa = 0, dealer_share_fcfa = 0, platform_share_fcfa = 900, distance_km = 10 where id = r.id; end if;   -- 10 km à 1 500 F : le prorata devient visible

    perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      res := public.driver_finish_ride(r.id, dlat - roff, dlng, 12, reason, rtext);
      out := out || k || '. fin acceptée : ' || res::text || E'\n';
    exception when others then
      res := null;
      out := out || k || '. fin refusée (' || left(sqlerrm, 110) || ')' || case when err_first then ' OK (attendu)' else ' *** KO' end || E'\n';
    end;
    reset role;
    if res is null and not err_first then raise exception E'RESULTATS (arrêt : fin refusée à tort)\n%', out; end if;

    if res is null and err_first then
      -- on referme la course près de la destination
      update public.drivers set current_location = st_setsrid(st_makepoint(dlng, dlat - 0.0009), 4326)::geography, last_seen_at = now() where id = d_id;
      perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
      set local role authenticated;
      res := public.driver_finish_ride(r.id, dlat - 0.0009, dlng, 12, null, null);
      reset role;
    end if;

    select * into r from public.rides where id = r.id;
    select * into rv from public.ride_end_reviews where ride_id = r.id;
    s := r.driver_share_fcfa + r.driver_rachat_fcfa + r.dealer_share_fcfa + r.platform_share_fcfa;
    out := out || '   statut=' || r.status || ' prix=' || r.price_total_fcfa || ' (parts ' || s || case when s = r.price_total_fcfa then ' OK' else ' *** KO' end || ')'
           || ' | trace : statut=' || coalesce(rv.status, '-') || ' dist=' || coalesce(rv.dist_to_dropoff_m::text, '-') || ' m, source=' || coalesce(rv.gps_source, '-')
           || ' écart=' || coalesce(rv.gps_gap_m::text, '-') || ' drapeaux=' || coalesce(rv.flags::text, '-')
           || ' prix ' || coalesce(rv.price_before_fcfa::text, '-') || '->' || coalesce(rv.price_after_fcfa::text, '-') || E'\n';
    select count(*) into n from public.wallet_transactions where ride_id = r.id;
    out := out || '   écritures de portefeuille : ' || n || case when n > 0 then ' OK' else ' *** KO (aucun crédit)' end
           || case when k = 3 then ' | prix attendu 1200 : ' || case when rv.price_after_fcfa = 1200 then 'OK' else '*** KO' end else '' end || E'\n';
  end loop;

  -- attentes de contrôle
  select count(*) into n from public.ride_end_reviews where ride_id = any (ride_ids) and status = 'dispute';
  out := out || 'A. litiges ouverts automatiquement : ' || n || ' (attendu 4 : fins 3, 4, 6, 8)' || case when n = 4 then ' OK' else ' *** KO' end || E'\n';
  select count(*) into n from public.admin_alerts where kind = 'ride_end_dispute' and created_at >= now();
  out := out || 'B. alertes admin « fin à examiner » : ' || n || ' (attendu 4)' || case when n = 4 then ' OK' else ' *** KO' end || E'\n';
  select count(*) into n from public.admin_alerts where kind = 'driver_early_ends' and created_at >= now();
  out := out || 'C. alerte « fins répétées » : ' || n || ' (attendu 1 : 4 fins loin en 7 jours, seuil 3)' || case when n = 1 then ' OK' else ' *** KO' end || E'\n';

  -- aperçu pour le chauffeur : loin de la destination -> raison requise
  update public.drivers set current_location = st_setsrid(st_makepoint(dlng, dlat - 0.02), 4326)::geography, last_seen_at = now() where id = d_id;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.create_ride('moto', plat, plng, 'Test départ', dlat, dlng, 'Test arrivée', 3.2, 12, false, false);
  reset role;
  update public.drivers set current_location = st_setsrid(st_makepoint(plng + 0.0005, plat), 4326)::geography, last_seen_at = now() where id = d_id;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.accept_ride(r2.id); r2 := public.driver_arrived(r2.id, 15); r2 := public.driver_start_ride(r2.id);
  reset role;
  update public.drivers set current_location = st_setsrid(st_makepoint(dlng, dlat - 0.02), 4326)::geography, last_seen_at = now() where id = d_id;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  prev := public.ride_end_preview(r2.id, dlat - 0.02, dlng);
  out := out || 'D. aperçu loin : ' || prev::text || case when (prev->>'reason_required')::boolean and not (prev->>'near')::boolean then ' OK' else ' *** KO' end || E'\n';
  -- un client ne peut pas utiliser la fonction du chauffeur ; l'ancienne fonction est fermée
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.driver_finish_ride(r2.id, dlat, dlng, 10, null, null);
    out := out || E'E1. un client termine comme un chauffeur : ACCEPTÉ *** KO\n';
  exception when others then out := out || 'E1. un client termine comme un chauffeur : refusé (' || left(sqlerrm, 40) || E') OK\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.driver_complete_ride(r2.id);
    out := out || E'E2. ancienne driver_complete_ride : ACCEPTÉE *** KO\n';
  exception when others then out := out || 'E2. ancienne driver_complete_ride : refusée (' || left(sqlerrm, 40) || E') OK\n'; end;
  reset role;
  if d2_prof is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', d2_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.driver_finish_ride(r2.id, dlat, dlng, 10, 'safety', null);
      out := out || E'E3. un autre chauffeur termine la course : ACCEPTÉ *** KO\n';
    exception when others then out := out || 'E3. un autre chauffeur termine la course : refusé (' || left(sqlerrm, 40) || E') OK\n'; end;
    reset role;
  end if;

  -- contestation du client sur la fin n° 3 (course ride_ids[3])
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  info := public.ride_end_info(ride_ids[3]);
  out := out || 'F1. infos client : ' || info::text || case when (info->>'can_contest')::boolean then ' OK' else ' *** KO' end || E'\n';
  begin
    perform public.client_contest_ride_end(ride_ids[3], 'Je n''étais pas arrivé');
    out := out || E'F2. contestation : OK\n';
  exception when others then out := out || 'F2. contestation ECHEC : ' || sqlerrm || E'\n'; end;
  begin
    perform public.client_contest_ride_end(ride_ids[3], 'Deuxième fois');
    out := out || E'F3. 2e contestation : ACCEPTÉE *** KO\n';
  exception when others then out := out || 'F3. 2e contestation refusée (' || left(sqlerrm, 40) || E') OK\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.client_contest_ride_end(ride_ids[1], 'Pas ma course');
    out := out || E'F4. un autre client conteste : ACCEPTÉ *** KO\n';
  exception when others then out := out || 'F4. un autre client conteste : refusé (' || left(sqlerrm, 40) || E') OK\n'; end;
  reset role;
  -- contestation hors délai
  update public.ride_end_reviews set contest_until = now() - interval '1 minute' where ride_id = ride_ids[1];
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.client_contest_ride_end(ride_ids[1], 'Trop tard');
    out := out || E'F5. contestation hors délai : ACCEPTÉE *** KO\n';
  exception when others then out := out || 'F5. contestation hors délai refusée (' || left(sqlerrm, 40) || E') OK\n'; end;
  reset role;
  select count(*) into n from public.admin_alerts where kind = 'ride_end_contest' and created_at >= now();
  out := out || 'F6. alerte admin « contestée » : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';

  -- décision admin : faute du chauffeur + geste de 300 F
  select balance_fcfa into w_cr_before from public.wallets where profile_id = c and kind = 'tamcar_credit';
  select count(*) into warns_before from public.driver_warnings where driver_id = d_id;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    n := jsonb_array_length(public.admin_ride_end_reviews('open'));
    out := out || 'G1. liste admin (ouverts) : ' || n || ' lignes' || case when n >= 4 then ' OK' else ' *** KO' end || E'\n';
    select * into rv from public.ride_end_reviews where ride_id = ride_ids[3];
    perform public.admin_resolve_ride_end(rv.id, 'driver_fault', 'Test', 300);
    out := out || E'G2. décision admin : OK\n';
    begin
      perform public.admin_resolve_ride_end(rv.id, 'valid', null, 0);
      out := out || E'G3. 2e décision : ACCEPTÉE *** KO\n';
    exception when others then out := out || 'G3. 2e décision refusée (' || left(sqlerrm, 30) || E') OK\n'; end;
    begin
      perform public.admin_resolve_ride_end(ride_ids[1], 'valid', null, 99999);
      out := out || E'G3b. geste hors plafond : ACCEPTÉ *** KO\n';
    exception when others then out := out || 'G3b. geste hors plafond refusé (' || left(sqlerrm, 40) || E') OK\n'; end;
  exception when others then out := out || 'G. ECHEC : ' || left(sqlerrm, 90) || E'\n'; end;
  reset role;
  select balance_fcfa into w_cr_after from public.wallets where profile_id = c and kind = 'tamcar_credit';
  select count(*) into warns_after from public.driver_warnings where driver_id = d_id;
  out := out || 'G4. crédit client ' || coalesce(w_cr_before, 0) || ' -> ' || coalesce(w_cr_after, 0) || ' (attendu +300)' || case when coalesce(w_cr_after, 0) - coalesce(w_cr_before, 0) = 300 then ' OK' else ' *** KO' end || E'\n';
  out := out || 'G5. avertissements chauffeur ' || warns_before || ' -> ' || warns_after || ' (attendu +1)' || case when warns_after - warns_before = 1 then ' OK' else ' *** KO' end || E'\n';
  select status into stt from public.ride_end_reviews where ride_id = ride_ids[3];
  out := out || 'G6. statut final de la fin n° 3 : ' || stt || case when stt = 'resolved' then ' OK' else ' *** KO' end || E'\n';
  raise exception E'RESULTATS\n%', out;
end $$;
