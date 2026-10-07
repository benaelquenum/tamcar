-- Paiement par crédit TamCar, frais d'annulation, arrêt supplémentaire, monnaie, SOS : rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/ride_payments_cancellations.sql --workdir backend  (résultat dans « RESULTATS »)
do $$
declare
  c uuid; d_prof uuid; d_id uuid;
  r public.rides;
  out text := '';
  step text;
  n int; v int;
  plat double precision := 6.4969; plng double precision := 2.6283;
  w_cr uuid; w_rev uuid;
  cr0 int; cr1 int; rev0 int; rev1 int;
  fee record; jr jsonb;
  pm text;
begin
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  select dr.id, dr.profile_id into d_id, d_prof
    from public.drivers dr join public.vehicles v on v.id = dr.current_vehicle_id
   where dr.status = 'active' and v.category = 'moto' limit 1;
  update public.drivers set is_online = true, current_location = st_setsrid(st_makepoint(plng + 0.0005, plat), 4326)::geography,
         updated_at = now() where id = d_id;
  select id into w_cr from public.wallets where profile_id = c and kind = 'tamcar_credit';
  select id into w_rev from public.wallets where profile_id = d_prof and kind = 'tamcar_revenus';
  select string_agg(e::text, ',') into pm from unnest(enum_range(null::payment_method)) e;
  out := out || 'modes de paiement : ' || pm || E'\n';

  -- ---- A. course payée par TamCar Crédit, solde insuffisant
  update public.wallets set balance_fcfa = 0 where id = w_cr;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r := public.create_ride('moto', plat, plng, 'Départ', 6.5100, 2.6000, 'Arrivée', 3.2, 12, false, false, null, 'tamcar_credit');
    out := out || E'A. crédit à 0 : course créée sans garde de solde (statut ' || r.status || E') *** à vérifier\n';
  exception when others then out := out || 'A. crédit à 0 : refus attendu -> ' || sqlerrm || E' OK\n'; end;
  reset role;

  -- ---- B. crédit suffisant : la course est payée par le crédit à la fin
  update public.wallets set balance_fcfa = 5000 where id = w_cr;
  select balance_fcfa into rev0 from public.wallets where id = w_rev;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'create'; r := public.create_ride('moto', plat, plng, 'Départ', 6.5100, 2.6000, 'Arrivée', 3.2, 12, false, false, null, 'tamcar_credit');
    reset role;
    select balance_fcfa into cr1 from public.wallets where id = w_cr;
    out := out || 'B1. course crédit créée : prix=' || r.price_total_fcfa || ', crédit après création=' || cr1 || E' (5000 avant)\n';
    perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    step := 'accept'; r := public.accept_ride(r.id);
    step := 'arrived'; r := public.driver_arrived(r.id, 10);
    step := 'start'; r := public.driver_start_ride(r.id);
    step := 'complete'; r := public.driver_complete_ride(r.id);
    reset role;
    select balance_fcfa into cr1 from public.wallets where id = w_cr;
    select balance_fcfa into rev1 from public.wallets where id = w_rev;
    out := out || 'B2. fin de course : crédit client 5000 -> ' || cr1 || ' (attendu ' || (5000 - r.price_total_fcfa) || '), revenus chauffeur ' || rev0 || ' -> ' || rev1
           || ' (attendu +' || r.driver_share_fcfa || ')' || case when cr1 = 5000 - r.price_total_fcfa and rev1 - rev0 = r.driver_share_fcfa then ' OK' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || 'B. ECHEC à ' || coalesce(step, '?') || ' : ' || sqlerrm || E'\n'; end;

  -- ---- C. annulation par le client une fois le chauffeur arrivé : frais ?
  update public.wallets set balance_fcfa = 5000 where id = w_cr;
  select balance_fcfa into rev0 from public.wallets where id = w_rev;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'create'; r := public.create_ride('moto', plat, plng, 'Départ', 6.5100, 2.6000, 'Arrivée', 3.2, 12);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    step := 'accept'; r := public.accept_ride(r.id);
    step := 'arrived'; r := public.driver_arrived(r.id, 10);
    reset role;
    update public.rides set arrived_at = now() - interval '9 minutes' where id = r.id;
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    step := 'fee_preview'; select * into fee from public.cancellation_fee_preview(r.id, null);
    out := out || 'C1. aperçu des frais d''annulation après 9 min d''attente : ' || coalesce(row_to_json(fee)::text, 'null') || E'\n';
    step := 'cancel'; r := public.cancel_ride_by_client(r.id, null);
    reset role;
    select balance_fcfa into cr1 from public.wallets where id = w_cr;
    select balance_fcfa into rev1 from public.wallets where id = w_rev;
    out := out || 'C2. annulation après arrivée : statut=' || r.status || ', crédit client 5000 -> ' || cr1 || ', revenus chauffeur ' || rev0 || ' -> ' || rev1 || E'\n';
  exception when others then reset role; out := out || 'C. ECHEC à ' || coalesce(step, '?') || ' : ' || sqlerrm || E'\n'; end;

  -- ---- D. annulation par le chauffeur
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'create'; r := public.create_ride('moto', plat, plng, 'Départ', 6.5100, 2.6000, 'Arrivée', 3.2, 12);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    step := 'accept'; r := public.accept_ride(r.id);
    step := 'driver cancel'; r := public.cancel_ride_by_driver(r.id, 'test');
    reset role;
    select status::text into step from public.rides where id = r.id;
    out := out || 'D. annulation par le chauffeur : statut=' || r.status || ' (la course revient-elle au pool ? statut en base=' || step || E')\n';
  exception when others then reset role; out := out || 'D. ECHEC : ' || sqlerrm || E'\n'; end;

  -- ---- E. SOS pendant une course
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'create'; r := public.create_ride('moto', plat, plng, 'Départ', 6.5100, 2.6000, 'Arrivée', 3.2, 12);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.accept_ride(r.id); r := public.driver_arrived(r.id, 10); r := public.driver_start_ride(r.id);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    step := 'sos'; perform public.send_sos_alert(r.id, plat, plng, 'test');
    reset role;
    select count(*) into n from public.sos_alerts where ride_id = r.id;
    out := out || 'E. SOS enregistré : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || 'E. ECHEC à ' || coalesce(step, '?') || ' : ' || sqlerrm || E'\n'; end;

  raise exception E'RESULTATS\n%', out;
end $$;
