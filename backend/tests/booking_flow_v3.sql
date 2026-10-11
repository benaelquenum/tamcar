-- Réservations v3 : départ anticipé (H-30), désistement qui relance TOUJOURS la recherche, pénalité de 200 F uniquement à moins de
-- 10 minutes du départ (reversée en entier à l'autre partie), gratuité avant H-10, frais affichés, annulation du client, course
-- immédiate inchangée, chauffeur désisté non reproposé. Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/booking_flow_v3.sql --workdir backend
do $$
declare
  c uuid; d_prof uuid; d_id uuid; r public.rides; r2 public.rides;
  out text := ''; msg text; n int; pv record;
  plat double precision := 6.4969; plng double precision := 2.6283;
  w_c uuid; w_d uuid; cb0 int; cb1 int; db0 int; db1 int; s0 int; s1 int;
begin
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  select dr.id, dr.profile_id into d_id, d_prof
    from public.drivers dr join public.vehicles v on v.id = dr.current_vehicle_id
   where dr.status = 'active' and v.category = 'moto' limit 1;
  update public.drivers set is_online = true, current_location = st_setsrid(st_makepoint(plng + 0.0005, plat), 4326)::geography, updated_at = now() where id = d_id;
  insert into public.wallets (profile_id, kind, balance_fcfa) values (c, 'tamcar_credit', 5000) on conflict (profile_id, kind) do nothing;
  insert into public.wallets (profile_id, kind, balance_fcfa) values (d_prof, 'tamcar_revenus', 5000) on conflict (profile_id, kind) do nothing;
  update public.wallets set balance_fcfa = 5000 where (profile_id = c and kind::text = 'tamcar_credit') or (profile_id = d_prof and kind::text = 'tamcar_revenus');
  select id into w_c from public.wallets where profile_id = c and kind::text = 'tamcar_credit';
  select id into w_d from public.wallets where profile_id = d_prof and kind::text = 'tamcar_revenus';
  select cancellations_driver_fault_count into s0 from public.drivers where id = d_id;

  -- 1. réservation dans 3 h, acceptée par le chauffeur ; départ anticipé impossible trop tôt
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.create_ride('moto', plat, plng, 'Départ réservation', 6.5100, 2.6000, 'Arrivée réservation', 3.2, 12, false, false, now() + interval '3 hours');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.accept_scheduled_ride(r.id);
  begin perform public.driver_start_booking(r.id); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  reset role;
  out := out || '1. réservation +3 h acceptée (statut ' || r2.status || '), départ anticipé trop tôt : ' || msg || E'\n';

  -- 2. à 25 minutes du départ le chauffeur peut partir : la course passe en « matched »
  update public.rides set scheduled_at = now() + interval '25 minutes' where id = r.id;
  perform public._remind_upcoming_bookings();
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.driver_start_booking(r.id);
  reset role;
  out := out || '2. départ anticipé à H-25 : statut=' || r2.status || case when r2.status = 'matched' then ' OK' else ' *** KO' end || E'\n';

  -- 3. frais affichés au client avant H-10, chauffeur en route : gratuit
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into pv from public.cancellation_fee_preview(r.id, null);
  reset role;
  out := out || '3. aperçu client avant H-10 : frais=' || pv.fee_fcfa || ' motif=' || pv.reason_code || case when pv.fee_fcfa = 0 and pv.reason_code = 'free_booking_early' then ' OK' else ' *** KO' end || E'\n';

  -- 4. désistement avant H-10 : gratuit, la réservation repart en recherche, rien ne bouge côté argent ni strike
  select balance_fcfa into cb0 from public.wallets where id = w_c;
  select balance_fcfa into db0 from public.wallets where id = w_d;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.cancel_ride_by_driver(r.id, 'imprévu');
  reset role;
  select balance_fcfa into cb1 from public.wallets where id = w_c;
  select balance_fcfa into db1 from public.wallets where id = w_d;
  select cancellations_driver_fault_count into s1 from public.drivers where id = d_id;
  out := out || '4. désistement à H-25 : statut=' || r2.status || ', chauffeur=' || coalesce(r2.driver_id::text, 'aucun') || ', client ' || cb0 || '->' || cb1 || ', chauffeur ' || db0 || '->' || db1 || ', strikes ' || s0 || '->' || s1
         || case when r2.status = 'scheduled' and r2.driver_id is null and cb1 = cb0 and db1 = db0 and s1 = s0 then ' OK (gratuit, recherche relancée)' else ' *** KO' end || E'\n';
  select count(*) into n from public.ride_driver_exclusions where ride_id = r.id and driver_id = d_id;
  out := out || '4b. chauffeur désisté exclu de cette course : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';

  -- 5. le chauffeur désisté ne peut pas reprendre la même course
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.accept_scheduled_ride(r.id); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  reset role;
  out := out || '5. même chauffeur reprend la course : ' || msg || E'\n';

  -- 6. désistement TARDIF (à 8 minutes du départ, course déjà en route) : pénalité de 200 F reversée au client, strike, recherche relancée
  delete from public.ride_driver_exclusions where ride_id = r.id;
  update public.rides set status = 'matched', driver_id = d_id, matched_at = now(), scheduled_at = now() + interval '8 minutes' where id = r.id;
  select balance_fcfa into cb0 from public.wallets where id = w_c;
  select balance_fcfa into db0 from public.wallets where id = w_d;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.cancel_ride_by_driver(r.id, null);
  reset role;
  select balance_fcfa into cb1 from public.wallets where id = w_c;
  select balance_fcfa into db1 from public.wallets where id = w_d;
  select cancellations_driver_fault_count into s1 from public.drivers where id = d_id;
  out := out || '6. désistement à H-8 : statut=' || r2.status || ', client ' || cb0 || '->' || cb1 || ', chauffeur ' || db0 || '->' || db1 || ', strikes ' || s0 || '->' || s1
         || case when r2.status = 'requested' and r2.driver_id is null and cb1 = cb0 + 200 and db1 = db0 - 200 and s1 = s0 + 1 then ' OK (200 F au client, recherche relancée)' else ' *** KO' end || E'\n';

  -- 7. annulation du CLIENT à H-8, chauffeur en route : 200 F au débit du client, versés au chauffeur
  delete from public.ride_driver_exclusions where ride_id = r.id;
  update public.rides set status = 'matched', driver_id = d_id, matched_at = now(), scheduled_at = now() + interval '8 minutes' where id = r.id;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into pv from public.cancellation_fee_preview(r.id, null);
  reset role;
  out := out || '7a. aperçu client à H-8 : frais=' || pv.fee_fcfa || ' motif=' || pv.reason_code || case when pv.fee_fcfa = 200 and pv.reason_code = 'booking_late' then ' OK' else ' *** KO' end || E'\n';
  select balance_fcfa into cb0 from public.wallets where id = w_c;
  select balance_fcfa into db0 from public.wallets where id = w_d;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.cancel_ride_by_client(r.id, null);
  reset role;
  select balance_fcfa into cb1 from public.wallets where id = w_c;
  select balance_fcfa into db1 from public.wallets where id = w_d;
  out := out || '7b. annulation client à H-8 : statut=' || r2.status || ', client ' || cb0 || '->' || cb1 || ', chauffeur ' || db0 || '->' || db1
         || case when r2.status = 'cancelled_by_client' and cb1 = cb0 - 200 and db1 = db0 + 200 then ' OK' else ' *** KO' end || E'\n';

  -- 8. annulation du client avant la bascule : gratuite à H-3 h ; à H-8 avec chauffeur engagé : pénalité reversée au chauffeur
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.create_ride('moto', plat, plng, 'Départ réservation 2', 6.5100, 2.6000, 'Arrivée réservation 2', 3.2, 12, false, false, now() + interval '3 hours');
  reset role;
  update public.rides set status = 'scheduled', driver_id = d_id where id = r.id;
  select balance_fcfa into cb0 from public.wallets where id = w_c;
  select balance_fcfa into db0 from public.wallets where id = w_d;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cancel_scheduled_ride(r.id);
  reset role;
  select balance_fcfa into cb1 from public.wallets where id = w_c;
  select balance_fcfa into db1 from public.wallets where id = w_d;
  out := out || '8a. annulation client à H-3 h (chauffeur engagé) : client ' || cb0 || '->' || cb1 || ', chauffeur ' || db0 || '->' || db1 || case when cb1 = cb0 and db1 = db0 then ' OK (gratuit)' else ' *** KO' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.create_ride('moto', plat, plng, 'Départ réservation 3', 6.5100, 2.6000, 'Arrivée réservation 3', 3.2, 12, false, false, now() + interval '3 hours');
  reset role;
  update public.rides set status = 'scheduled', driver_id = d_id, scheduled_at = now() + interval '8 minutes' where id = r.id;
  select balance_fcfa into cb0 from public.wallets where id = w_c;
  select balance_fcfa into db0 from public.wallets where id = w_d;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cancel_scheduled_ride(r.id);
  reset role;
  select balance_fcfa into cb1 from public.wallets where id = w_c;
  select balance_fcfa into db1 from public.wallets where id = w_d;
  out := out || '8b. annulation client à H-8 (chauffeur engagé) : client ' || cb0 || '->' || cb1 || ', chauffeur ' || db0 || '->' || db1 || case when cb1 = cb0 - 200 and db1 = db0 + 200 then ' OK (200 F au chauffeur)' else ' *** KO' end || E'\n';

  -- 9. course IMMÉDIATE : le désistement garde son comportement (course « annulée par le chauffeur »)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.create_ride('moto', plat, plng, 'Départ immédiat', 6.5100, 2.6000, 'Arrivée immédiate', 3.2, 12);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.accept_ride(r.id);
  r2 := public.cancel_ride_by_driver(r.id, null);
  reset role;
  out := out || '9. course immédiate annulée par le chauffeur : statut=' || r2.status || case when r2.status = 'cancelled_by_driver' then ' OK (inchangé)' else ' *** KO' end || E'\n';

  -- 10. le réglage de la pénalité est lisible et validé
  out := out || '10. montant de la pénalité : ' || public._booking_penalty_amount() || ' F' || case when public._booking_penalty_amount() = 200 then ' OK' else ' *** KO' end || E'\n';

  raise exception E'RESULTATS\n%', out;
end $$;
