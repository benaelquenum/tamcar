-- Location VIP de bout en bout : demande client, confirmation équipe, règlement, démarrage, fin, kilométrage, repos du chauffeur.
-- Rôles réels, tout est annulé. Usage : supabase db query --linked -f backend/tests/vip_rental_flow.sql --workdir backend
do $$
declare
  c uuid; adm uuid; d_id uuid; d_prof uuid; veh uuid;
  rn public.vehicle_rentals; rn2 public.vehicle_rentals;
  v_start timestamptz := ((current_date + 3) + time '07:00') at time zone 'Africa/Porto-Novo';
  out text := '';
  step text;
  w_rev uuid; rev0 int; rev1 int; n int; r public.rides;
begin
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select dr.id, dr.profile_id, dr.current_vehicle_id into d_id, d_prof, veh
    from public.drivers dr join public.vehicles v on v.id = dr.current_vehicle_id
   where dr.status = 'active' and v.category = 'essentiel' limit 1;
  update public.vehicles set category = 'premium' where id = veh;       -- chauffeur VIP pour le test
  select id into w_rev from public.wallets where profile_id = d_prof and kind = 'tamcar_revenus';

  -- 1. demande du client : 7 h-22 h = forfait journée
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'request';
    rn := public.request_vehicle_rental(v_start, 15, 'Hôtel Test, Cotonou', 6.3654, 2.4258);
    out := out || '1. demande : statut=' || rn.status || ' prix=' || rn.price_fcfa || ' (attendu 45000) ' || case when rn.price_fcfa = 45000 then 'OK' else '*** KO' end || E'\n';
  exception when others then out := out || '1. demande ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;
  if rn.id is null then raise exception E'RESULTATS\n%', out; end if;

  -- 2. l'équipe confirme avec le chauffeur et enregistre le règlement
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'confirm';
    rn := public.admin_confirm_vehicle_rental(rn.id, d_id);
    out := out || '2a. confirmation : statut=' || rn.status || case when rn.status = 'confirmed' then ' OK' else ' *** KO' end || E'\n';
    step := 'paid';
    rn := public.admin_update_vehicle_rental(rn.id, null, null, 45000);
    out := out || '2b. règlement enregistré : payé=' || rn.paid_fcfa || E'\n';
  exception when others then out := out || '2. confirmation/règlement ECHEC à ' || step || ' : ' || sqlerrm || E'\n'; end;
  reset role;

  -- 3. repos du chauffeur : une 2e location qui démarre 1 h après la fin est refusée, 2 h 15 après acceptée
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'repos';
    perform public.admin_create_vehicle_rental(c, v_start + interval '16 hours', v_start + interval '20 hours', 'Test', 6.3654, 2.4258, d_id);
    out := out || E'3a. 2e location 1 h après la fin : ACCEPTÉE *** KO\n';
  exception when others then out := out || '3a. 2e location 1 h après la fin : refusée (' || left(sqlerrm, 70) || E') OK\n'; end;
  begin
    rn2 := public.admin_create_vehicle_rental(c, v_start + interval '17 hours 15 minutes', v_start + interval '21 hours', 'Test', 6.3654, 2.4258, d_id);
    out := out || '3b. 2e location 2 h 15 après la fin : acceptée, prix=' || rn2.price_fcfa || ' (4 h hors plage x 3500 = 14000 attendu) ' || case when rn2.price_fcfa = 14000 then 'OK' else '*** à vérifier' end || E'\n';
  exception when others then out := out || '3b. ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;

  -- 4. le jour J : démarrage puis fin avec 300 km (150 km inclus -> 150 km de supplément)
  update public.vehicle_rentals set starts_at = now() - interval '1 hour', ends_at = now() + interval '14 hours' where id = rn.id;
  select balance_fcfa into rev0 from public.wallets where id = w_rev;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'start';
    rn := public.driver_start_vehicle_rental(rn.id, 10000, rn.id::text || '/start.jpg');
    out := out || '4a. démarrage : statut=' || rn.status || case when rn.status = 'in_progress' then ' OK' else ' *** KO' end || E'\n';
    step := 'complete';
    rn := public.driver_complete_vehicle_rental(rn.id, 10300, rn.id::text || '/end.jpg');
    out := out || '4b. fin : statut=' || rn.status || ' km=' || coalesce(rn.km_used::text, '?') || ' supplément km=' || coalesce(rn.extra_km::text, '?')
           || ' soit ' || coalesce(rn.extra_fcfa::text, '?') || ' F (attendu 150 km / 30000 F)' || E'\n';
  exception when others then out := out || '4. ECHEC à ' || step || ' : ' || sqlerrm || E'\n'; end;
  reset role;

  select balance_fcfa into rev1 from public.wallets where id = w_rev;
  select * into r from public.rides where id = rn.ride_id;
  out := out || '5. course miroir : ' || coalesce(r.id::text, 'aucune') || ' prix=' || coalesce(r.price_total_fcfa::text, '?') || ' part chauffeur=' || coalesce(r.driver_share_fcfa::text, '?')
         || ' ; revenus chauffeur ' || rev0 || ' -> ' || rev1 || ' (écart ' || (rev1 - rev0) || ')' || E'\n';
  if r.id is not null then
    out := out || '   somme des parts = ' || (r.driver_share_fcfa + r.driver_rachat_fcfa + r.dealer_share_fcfa + r.platform_share_fcfa)
           || case when r.driver_share_fcfa + r.driver_rachat_fcfa + r.dealer_share_fcfa + r.platform_share_fcfa = r.price_total_fcfa then ' OK' else ' *** KO' end || E'\n';
  end if;

  raise exception E'RESULTATS\n%', out;
end $$;
