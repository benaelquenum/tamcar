-- Changements en cours de course, en rôles réels, tout est annulé : arrêts (ajout, ordre, retrait, échange avec la destination, passage
-- du chauffeur), nouvelle destination, lien de suivi public, changement de catégorie / déclassement avant acceptation,
-- accès interdits. Vérifie à chaque étape que la somme des parts reste égale au prix.
-- Usage : supabase db query --linked -f backend/tests/ride_stops_and_changes.sql --workdir backend
do $$
declare
  c uuid; d_prof uuid; d_id uuid; other uuid;
  r public.rides; r2 public.rides; s1 public.ride_stops; s2 public.ride_stops; sx public.ride_stops;
  out text := '';
  n int; j jsonb; tok text; trk record; vcat text;
  plat double precision := 6.4969; plng double precision := 2.6283;
  function_note text;
begin
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  select dr.id, dr.profile_id into d_id, d_prof
    from public.drivers dr join public.vehicles v on v.id = dr.current_vehicle_id
   where dr.status = 'active' and v.category = 'moto' limit 1;
  select p.id into other from public.profiles p where p.role::text = 'client' and p.id <> c limit 1;
  update public.drivers set is_online = true, current_location = st_setsrid(st_makepoint(plng + 0.0005, plat), 4326)::geography,
         updated_at = now() where id = d_id;

  -- 1. course acceptée
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.create_ride('moto', plat, plng, 'Départ test', 6.5100, 2.6000, 'Arrivée test', 3.2, 12);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.accept_ride(r.id);
  reset role;
  out := out || '1. course acceptée : prix=' || r.price_total_fcfa || ' statut=' || r.status || E'\n';

  -- 2. le client ajoute deux arrêts ; le prix suit, la somme des parts reste égale au prix
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    j := public.add_ride_stop(r.id, 'Arrêt 1', 6.5050, 2.6200, 5.0, 18);
    select * into r2 from public.rides where id = r.id;
    out := out || '2a. arrêt 1 : prix ' || r.price_total_fcfa || ' -> ' || r2.price_total_fcfa || ', arrêts=' || r2.stops_count
           || case when r2.price_total_fcfa >= r.price_total_fcfa and r2.stops_count = 1 and r2.driver_share_fcfa + r2.driver_rachat_fcfa + r2.dealer_share_fcfa + r2.platform_share_fcfa = r2.price_total_fcfa then ' OK (parts = prix)' else ' *** KO' end || E'\n';
    j := public.add_ride_stop(r.id, 'Arrêt 2', 6.5080, 2.6100, 6.5, 24);
    select * into r2 from public.rides where id = r.id;
    out := out || '2b. arrêt 2 : prix=' || r2.price_total_fcfa || ', arrêts=' || r2.stops_count
           || case when r2.stops_count = 2 and r2.driver_share_fcfa + r2.driver_rachat_fcfa + r2.dealer_share_fcfa + r2.platform_share_fcfa = r2.price_total_fcfa then ' OK' else ' *** KO' end || E'\n';
  exception when others then out := out || '2. ajout d''arrêt ECHEC : ' || sqlerrm || E'\n'; end;
  begin
    perform public.add_ride_stop(r.id, 'Hors zone', 0.0, 0.0, 9.0, 30);
    out := out || E'2c. arrêt hors zone de service : ACCEPTÉ *** KO\n';
  exception when others then out := out || '2c. arrêt hors zone refusé : ' || left(sqlerrm, 50) || E' OK\n'; end;
  select * into s1 from public.ride_stops where ride_id = r.id and order_idx = 1;
  select * into s2 from public.ride_stops where ride_id = r.id and order_idx = 2;

  -- 3. réordonner, puis retirer le deuxième arrêt
  begin
    j := public.reorder_ride_stops(r.id, array[s2.id, s1.id], 6.5, 24);
    select count(*) into n from public.ride_stops where ride_id = r.id and status <> 'cancelled' and order_idx = 1 and id = s2.id;
    out := out || '3a. ordre inversé : arrêt 2 passe en premier=' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  exception when others then out := out || '3a. reorder ECHEC : ' || sqlerrm || E'\n'; end;
  begin
    j := public.remove_ride_stop(s2.id, 5.0, 18);
    select * into r2 from public.rides where id = r.id;
    out := out || '3b. arrêt retiré : arrêts actifs=' || (select count(*) from public.ride_stops where ride_id = r.id and status <> 'cancelled') || ', prix=' || r2.price_total_fcfa
           || case when r2.driver_share_fcfa + r2.driver_rachat_fcfa + r2.dealer_share_fcfa + r2.platform_share_fcfa = r2.price_total_fcfa then ' OK (parts = prix)' else ' *** KO' end || E'\n';
  exception when others then out := out || '3b. remove ECHEC : ' || sqlerrm || E'\n'; end;

  -- 4. un autre client ne peut ni voir, ni modifier, ni partager cette course
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.add_ride_stop(r.id, 'Intrus', 6.5, 2.6, 5, 18); out := out || E'4a. arrêt ajouté par un autre client *** KO\n';
  exception when others then out := out || '4a. ajout par un autre client refusé OK' || E'\n'; end;
  begin perform public.remove_ride_stop(s1.id, 3.2, 12); out := out || E'4b. arrêt retiré par un autre client *** KO\n';
  exception when others then out := out || '4b. retrait par un autre client refusé OK' || E'\n'; end;
  begin tok := public.create_ride_share_link(r.id); out := out || E'4c. lien de suivi créé par un autre client *** KO\n';
  exception when others then out := out || '4c. lien de suivi par un autre client refusé OK' || E'\n'; end;
  begin perform public.client_switch_category(r.id, 'essentiel'); out := out || E'4d. catégorie changée par un autre client *** KO\n';
  exception when others then out := out || '4d. changement de catégorie par un autre client refusé OK' || E'\n'; end;
  reset role;

  -- 5. lien de suivi : créé par le client, lisible sans compte, sans données privées
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tok := public.create_ride_share_link(r.id);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    select * into trk from public.public_ride_track(tok);
    out := out || '5a. suivi public (anonyme) : statut=' || coalesce(trk.status::text, '?') || ' conducteur=' || coalesce(trk.driver_first_name, '?') || ' plaque=' || coalesce(trk.vehicle_plate, '?')
           || case when trk.status is not null then ' OK' else ' *** KO' end || E'\n';
    select * into trk from public.public_ride_track('jeton-invalide-xxxxxxxx');
    out := out || '5b. jeton invalide : ' || case when trk.status is null then 'aucune donnée OK' else '*** KO (données renvoyées)' end || E'\n';
  exception when others then out := out || '5. suivi public ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;

  -- 6. le chauffeur arrive, démarre, passe par l'arrêt restant, termine
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r := public.driver_arrived(r.id, 10);
    r := public.driver_start_ride(r.id);
    sx := public.driver_arrive_at_stop(s1.id);
    out := out || '6a. arrivée à l''arrêt : statut=' || sx.status || case when sx.status = 'arrived' then ' OK' else ' *** KO' end || E'\n';
    sx := public.driver_depart_from_stop(s1.id);
    out := out || '6b. départ de l''arrêt : statut=' || sx.status || case when sx.status = 'departed' then ' OK' else ' *** KO' end || E'\n';
    r := public.driver_complete_ride(r.id);
    out := out || '6c. course terminée : statut=' || r.status || ' prix=' || r.price_total_fcfa
           || case when r.status = 'completed' and r.driver_share_fcfa + r.driver_rachat_fcfa + r.dealer_share_fcfa + r.platform_share_fcfa = r.price_total_fcfa then ' OK (parts = prix)' else ' *** KO' end || E'\n';
  exception when others then out := out || '6. parcours chauffeur ECHEC : ' || sqlerrm || E'\n'; end;
  begin
    perform public.driver_arrive_at_stop(s1.id);
    out := out || E'6d. arrêt déjà passé : arrivée acceptée de nouveau (à vérifier)\n';
  exception when others then out := out || '6d. arrêt déjà passé refusé : ' || left(sqlerrm, 50) || E' OK\n'; end;
  reset role;

  -- 7. après la fin : plus de modification d'arrêt ; lien de suivi toujours valide
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.add_ride_stop(r.id, 'Trop tard', 6.5, 2.6, 8, 30); out := out || E'7. arrêt ajouté après la fin *** KO\n';
  exception when others then out := out || '7. arrêt après la fin refusé : ' || left(sqlerrm, 50) || E' OK\n'; end;
  reset role;

  -- 8. changement de catégorie avant acceptation (aucun chauffeur Confort en ligne) : alternatives, bascule, relance
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r2 := public.create_ride('confort', plat, plng, 'Départ confort', 6.5100, 2.6000, 'Arrivée confort', 8.0, 20);
    out := out || '8a. course Confort demandée : prix=' || r2.price_total_fcfa || ' statut=' || r2.status || E'\n';
    select count(*) into n from public.preview_alternative_offers(r2.id);
    out := out || '8b. alternatives proposées : ' || n || case when n >= 1 then ' OK' else ' *** KO' end || E'\n';
    j := public.preview_downgrade_price(r2.id);
    out := out || '8c. prix en Essentiel : ' || coalesce(j ->> 'new_price_fcfa', '?') || ' (remboursement ' || coalesce(j ->> 'refund_fcfa', '?') || ' F)'
           || case when (j ->> 'new_price_fcfa')::int <= r2.price_total_fcfa then ' OK' else ' *** KO' end || E'\n';
    r2 := public.client_switch_category(r2.id, 'essentiel');
    out := out || '8d. bascule vers Essentiel : catégorie=' || r2.requested_category || ' prix=' || r2.price_total_fcfa
           || case when r2.requested_category = 'essentiel' and r2.driver_share_fcfa + r2.driver_rachat_fcfa + r2.dealer_share_fcfa + r2.platform_share_fcfa = r2.price_total_fcfa then ' OK (parts = prix)' else ' *** KO' end || E'\n';
    j := public.client_relaunch_search(r2.id);
    out := out || '8e. recherche relancée : ' || left(j::text, 80) || E' OK\n';
    begin perform public.client_switch_category(r2.id, 'essentiel'); out := out || E'8f. même catégorie redemandée *** KO\n';
    exception when others then out := out || '8f. même catégorie refusée : ' || left(sqlerrm, 40) || E' OK\n'; end;
    r2 := public.cancel_ride_by_client(r2.id, null);
    out := out || '8g. annulation avant acceptation : statut=' || r2.status || E'\n';
  exception when others then out := out || '8. changement de catégorie ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;

  -- 9. responsable d'opérations : rattachement d'un point à une ville
  begin
    select public.ops_city_for_point(plat, plng) into function_note;
    out := out || '9. ville du point de départ : ' || coalesce(function_note, '(aucune)') || E'\n';
  exception when others then out := out || '9. ops_city_for_point : ' || sqlerrm || E'\n'; end;

  raise exception E'RESULTATS\n%', out;
end $$;
