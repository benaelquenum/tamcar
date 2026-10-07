-- Réservations à l'avance : création, visibilité chauffeur, acceptation, désistement, annulation, passage en course immédiate.
-- Rôles réels, tout est annulé. Usage : supabase db query --linked -f backend/tests/scheduled_booking_flow.sql --workdir backend
do $$
declare
  c uuid; d_prof uuid; d_id uuid; r public.rides; r2 public.rides;
  out text := '';
  step text; n int; st text; rec record;
  plat double precision := 6.4969; plng double precision := 2.6283;
begin
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  select dr.id, dr.profile_id into d_id, d_prof
    from public.drivers dr join public.vehicles v on v.id = dr.current_vehicle_id
   where dr.status = 'active' and v.category = 'moto' limit 1;
  update public.drivers set is_online = true, current_location = st_setsrid(st_makepoint(plng + 0.0005, plat), 4326)::geography, updated_at = now() where id = d_id;

  -- 1. le client réserve pour dans 3 h
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'create_ride programmée';
    r := public.create_ride('moto', plat, plng, 'Départ réservation', 6.5100, 2.6000, 'Arrivée réservation', 3.2, 12, false, false, now() + interval '3 hours');
    out := out || '1. réservation créée : statut=' || r.status || ' prévue ' || to_char(r.scheduled_at at time zone 'Africa/Porto-Novo', 'DD/MM HH24:MI') || case when r.status = 'scheduled' then ' OK' else ' *** KO (statut attendu scheduled)' end || E'\n';
  exception when others then out := out || '1. réservation ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;
  if r.id is null then raise exception E'RESULTATS\n%', out; end if;

  -- 2. visible dans « mes réservations » du client
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.my_scheduled_rides() s where s.id = r.id;
  out := out || '2. dans « mes réservations » du client : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  reset role;

  -- 3. le chauffeur la voit (réservations disponibles) puis l'accepte
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select count(*) into n from public.pending_scheduled_rides_for_driver(12) p where p.id = r.id;
    out := out || '3a. visible dans les réservations du chauffeur : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
    step := 'accept_scheduled_ride';
    r2 := public.accept_scheduled_ride(r.id);
    out := out || '3b. acceptée : statut=' || r2.status || ' chauffeur affecté=' || (r2.driver_id is not null) || E'\n';
    select count(*) into n from public.driver_bookings('all') b where b.id = r.id;
    out := out || '3c. dans « mes réservations » du chauffeur (driver_bookings) : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  exception when others then out := out || '3. ECHEC à ' || coalesce(step, '?') || ' : ' || sqlerrm || E'\n'; end;
  reset role;

  -- 4. le client voit le chauffeur confirmé
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select s.driver_confirmed into rec from public.my_scheduled_rides() s where s.id = r.id;
  out := out || '4. chauffeur confirmé visible du client : ' || coalesce(rec.driver_confirmed::text, 'ligne absente') || E'\n';
  reset role;

  -- 5. désistement du chauffeur : la réservation retourne dans le pool
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'cancel_scheduled_by_driver';
    perform public.cancel_scheduled_by_driver(r.id);
    reset role;
    select status::text || ' / chauffeur ' || coalesce(driver_id::text, 'aucun') into st from public.rides where id = r.id;
    out := out || '5. désistement du chauffeur : ' || st || E'\n';
  exception when others then reset role; out := out || '5. désistement ECHEC : ' || sqlerrm || E'\n'; end;

  -- 6. annulation par le client
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'cancel_scheduled_ride';
    perform public.cancel_scheduled_ride(r.id);
    reset role;
    select status::text into st from public.rides where id = r.id;
    out := out || '6. annulation par le client : statut=' || st || case when st like 'cancelled%' then ' OK' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || '6. annulation ECHEC : ' || sqlerrm || E'\n'; end;

  -- 7. une réservation arrivée à échéance devient une course immédiate (tâche planifiée)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r := public.create_ride('moto', plat, plng, 'Départ échéance', 6.5100, 2.6000, 'Arrivée échéance', 3.2, 12, false, false, now() + interval '3 hours');
    reset role;
    update public.rides set scheduled_at = now() + interval '5 minutes' where id = r.id;
    perform public._release_due_scheduled_rides();
    perform public._scheduled_rides_tick();
    select status::text into st from public.rides where id = r.id;
    out := out || '7. réservation à échéance (5 min) après la tâche planifiée : statut=' || st || E' (requested attendu quand la fenêtre de libération est atteinte)\n';
  exception when others then reset role; out := out || '7. échéance ECHEC : ' || sqlerrm || E'\n'; end;

  raise exception E'RESULTATS\n%', out;
end $$;
