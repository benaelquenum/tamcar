-- Parcours complet d'une course en rôles réels (client / chauffeur), tout est annulé à la fin.
-- Usage : supabase db query --linked -f backend/tests/ride_flow.sql --workdir backend  (résultat dans « RESULTATS »)
-- Couvre : commande, pool du chauffeur, acceptation, arrivée, démarrage, fin, partage de l'argent, note, messages,
--          annulation avant et après acceptation, accès interdits entre utilisateurs.
do $$
declare
  c uuid; d_prof uuid; d_id uuid; other uuid; adm uuid;
  r public.rides; r2 public.rides; r3 public.rides;
  out text := '';
  step text;
  n int; v numeric;
  w_rev_before int; w_rev_after int; w_rac_before int; w_rac_after int; w_cr_before int; w_cr_after int;
  plat double precision := 6.4969; plng double precision := 2.6283;
begin
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  -- client : celui qui a le plus de courses (donc un compte déjà utilisé) ; chauffeur : actif avec véhicule moto
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  select dr.id, dr.profile_id into d_id, d_prof
    from public.drivers dr join public.vehicles v on v.id = dr.current_vehicle_id
   where dr.status = 'active' and v.category = 'moto' limit 1;
  select p.id into other from public.profiles p where p.role::text = 'client' and p.id <> c limit 1;
  update public.drivers set is_online = true, current_location = st_setsrid(st_makepoint(plng + 0.0005, plat), 4326)::geography,
         updated_at = now() where id = d_id;
  select balance_fcfa into w_rev_before from public.wallets where profile_id = d_prof and kind = 'tamcar_revenus';
  select balance_fcfa into w_rac_before from public.wallets where profile_id = d_prof and kind = 'tamcar_rachat';
  select balance_fcfa into w_cr_before from public.wallets where profile_id = c and kind = 'tamcar_credit';

  -- ---- 1. le client commande une moto (espèces)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'create_ride';
    r := public.create_ride('moto', plat, plng, 'Test départ', 6.5100, 2.6000, 'Test arrivée', 3.2, 12, false, false);
    out := out || '1. create_ride : statut=' || r.status || ' prix=' || r.price_total_fcfa || ' part chauffeur=' || r.driver_share_fcfa
           || ' rachat=' || r.driver_rachat_fcfa || ' concess=' || r.dealer_share_fcfa || ' plateforme=' || r.platform_share_fcfa
           || case when r.price_total_fcfa > 0 and r.status = 'requested' then ' OK' else ' *** KO' end || E'\n';
  exception when others then out := out || '1. create_ride ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;
  if r.id is null then raise exception E'RESULTATS\n%', out; end if;

  -- ---- 2. le chauffeur voit la demande dans son pool
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select count(*) into n from public.pending_rides_for_driver(10) p where p.id = r.id;
    out := out || '2. pool du chauffeur contient la course : ' || n || case when n = 1 then ' OK' else ' *** KO (le chauffeur ne la voit pas)' end || E'\n';
  exception when others then out := out || '2. pool ECHEC : ' || sqlerrm || E'\n'; end;

  -- ---- 3. un autre client ne voit pas cette course
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.rides where id = r.id;
  out := out || '3. autre client voit la course : ' || n || case when n = 0 then ' OK' else ' *** FUITE' end || E'\n';
  begin
    perform public.cancel_ride_by_client(r.id, null);
    out := out || E'3b. autre client annule la course d''autrui : ACCEPTÉ *** KO\n';
  exception when others then out := out || '3b. autre client annule la course d''autrui : refusé (' || left(sqlerrm, 50) || E') OK\n'; end;
  reset role;

  -- ---- 4. acceptation, arrivée, démarrage, fin
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'accept_ride'; r := public.accept_ride(r.id);
    out := out || '4a. accept_ride : statut=' || r.status || case when r.status = 'matched' then ' OK' else ' *** KO' end || E'\n';
    step := 'driver_arrived'; r := public.driver_arrived(r.id, 15);
    out := out || '4b. driver_arrived : statut=' || r.status || case when r.status = 'arrived' then ' OK' else ' *** KO' end || E'\n';
    step := 'driver_start_ride'; r := public.driver_start_ride(r.id);
    out := out || '4c. driver_start_ride : statut=' || r.status || case when r.status = 'in_progress' then ' OK' else ' *** KO' end || E'\n';
    step := 'driver_complete_ride'; r := public.driver_complete_ride(r.id);
    out := out || '4d. driver_complete_ride : statut=' || r.status || case when r.status = 'completed' then ' OK' else ' *** KO' end || E'\n';
  exception when others then out := out || '4. ECHEC à l''étape ' || step || ' : ' || sqlerrm || E'\n'; end;
  reset role;

  -- ---- 5. répartition de l'argent
  select balance_fcfa into w_rev_after from public.wallets where profile_id = d_prof and kind = 'tamcar_revenus';
  select balance_fcfa into w_rac_after from public.wallets where profile_id = d_prof and kind = 'tamcar_rachat';
  select * into r2 from public.rides where id = r.id;
  out := out || '5. portefeuilles chauffeur : revenus ' || w_rev_before || ' -> ' || w_rev_after || ' (écart ' || (w_rev_after - w_rev_before)
         || '), rachat ' || w_rac_before || ' -> ' || w_rac_after || ' (écart ' || (w_rac_after - w_rac_before) || ') ; part chauffeur course=' || r2.driver_share_fcfa
         || ', rachat=' || r2.driver_rachat_fcfa || ', total course=' || r2.price_total_fcfa || E'\n';
  out := out || '   somme des parts = ' || (r2.driver_share_fcfa + r2.driver_rachat_fcfa + r2.dealer_share_fcfa + r2.platform_share_fcfa)
         || case when r2.driver_share_fcfa + r2.driver_rachat_fcfa + r2.dealer_share_fcfa + r2.platform_share_fcfa = r2.price_total_fcfa then ' OK (= prix)' else ' *** KO (≠ prix)' end || E'\n';

  -- ---- 6. note du client
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.rate_ride(r.id, 5, 'Test');
    out := out || E'6. rate_ride : OK\n';
  exception when others then out := out || '6. rate_ride ECHEC : ' || sqlerrm || E'\n'; end;
  begin
    perform public.rate_ride(r.id, 4, 'Deuxième note');
    out := out || E'6b. seconde note sur la même course : ACCEPTÉE (à vérifier)\n';
  exception when others then out := out || '6b. seconde note refusée : ' || left(sqlerrm, 60) || E' OK\n'; end;
  reset role;

  -- ---- 7. messages client <-> chauffeur sur une nouvelle course acceptée, puis annulation par le client
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r3 := public.create_ride('moto', plat, plng, 'Test départ 2', 6.5100, 2.6000, 'Test arrivée 2', 3.2, 12);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r3 := public.accept_ride(r3.id);
    perform public.send_ride_message(r3.id, 'Je suis en route');
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.send_ride_message(r3.id, 'Merci, je vous attends');
    select count(*) into n from public.ride_messages where ride_id = r3.id;
    out := out || '7a. messages échangés visibles du client : ' || n || case when n = 2 then ' OK' else ' *** KO' end || E'\n';
    r3 := public.cancel_ride_by_client(r3.id, null);
    out := out || '7b. annulation par le client après acceptation : statut=' || r3.status || E'\n';
  exception when others then out := out || '7. messages/annulation ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;

  select balance_fcfa into w_cr_after from public.wallets where profile_id = c and kind = 'tamcar_credit';
  out := out || '8. crédit du client : ' || w_cr_before || ' -> ' || w_cr_after || E'\n';

  raise exception E'RESULTATS\n%', out;
end $$;
