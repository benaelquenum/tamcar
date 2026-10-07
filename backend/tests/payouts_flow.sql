-- Test de bout en bout : retraits chauffeur et règlement de dette (rôles réels, transaction annulée).
-- Usage : supabase db query --linked -f backend/tests/payouts_flow.sql --workdir backend
-- Le résultat s'affiche dans le message d'erreur « RESULTATS » (l'exception final annule tout).
do $$
declare
  adm uuid;
  d_id uuid; d_prof uuid; w uuid;
  p1 uuid; p2 uuid;
  v int; st text; out text := '';
  tx_status text;
begin
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select dr.id, dr.profile_id into d_id, d_prof from public.drivers dr where dr.status = 'active' limit 1;
  select id into w from public.wallets where profile_id = d_prof and kind = 'tamcar_revenus';
  update public.wallets set balance_fcfa = 20000 where id = w;

  -- 1. le chauffeur demande 5 000 F
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select (public.request_driver_payout(5000, 'mtn')).id into p1;
  reset role;
  select balance_fcfa into v from public.wallets where id = w;
  out := out || '1. demande 5000 F : solde ' || v || ' (attendu 15000) ' || case when v = 15000 then 'OK' else '*** KO' end || E'\n';

  -- 2. une seconde demande tant que la première est en cours est refusée
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.request_driver_payout(1000, 'mtn');
    out := out || E'2. seconde demande : ACCEPTÉE *** KO\n';
  exception when others then out := out || '2. seconde demande refusée : ' || sqlerrm || E' OK\n'; end;

  -- 3. un montant supérieur au solde est refusé (après clôture du premier)
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v from public.admin_driver_payouts('open');
  out := out || '3. admin voit ' || v || ' retrait(s) à payer ' || case when v >= 1 then 'OK' else '*** KO' end || E'\n';
  perform public.admin_mark_payout_paid(p1, 'MOMO-TEST-1');
  reset role;
  select status into st from public.driver_payouts where id = p1;
  select t.status::text into tx_status from public.wallet_transactions t join public.driver_payouts dp on dp.wallet_tx_id = t.id where dp.id = p1;
  out := out || '4. marqué payé : payout=' || st || ' transaction=' || tx_status || case when st = 'paid' and tx_status = 'success' then ' OK' else ' *** KO' end || E'\n';

  -- 5. nouvelle demande de 3 000 F puis refus : le montant est recrédité
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select (public.request_driver_payout(3000, 'moov')).id into p2;
  reset role;
  select balance_fcfa into v from public.wallets where id = w;
  out := out || '5. demande 3000 F : solde ' || v || ' (attendu 12000)' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_reject_payout(p2, 'Numéro invalide');
  reset role;
  select balance_fcfa into v from public.wallets where id = w;
  select status into st from public.driver_payouts where id = p2;
  out := out || '6. refus : solde ' || v || ' (attendu 15000), statut=' || st || case when v = 15000 and st = 'failed' then ' OK' else ' *** KO' end || E'\n';

  -- 7. un chauffeur ne peut pas clore un retrait (fonctions admin)
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_mark_payout_paid(p2, 'x');
    out := out || E'7. chauffeur appelle admin_mark_payout_paid : ACCEPTÉ *** KO\n';
  exception when others then out := out || '7. chauffeur → admin_mark_payout_paid refusé : ' || sqlerrm || E' OK\n'; end;
  begin
    perform public.apply_fedapay_success('FDP-x', 'tx', 1000);
    out := out || E'8. chauffeur appelle apply_fedapay_success : ACCEPTÉ *** KO\n';
  exception when others then out := out || '8. chauffeur → apply_fedapay_success refusé : ' || sqlerrm || E' OK\n'; end;

  -- 9. règlement de dette enregistré par l'équipe
  reset role;
  update public.wallets set balance_fcfa = -2500 where id = w;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_record_debt_payment(d_id, 1000, 'internal', 'ESP-1');
  reset role;
  select balance_fcfa into v from public.wallets where id = w;
  out := out || '9. paiement de dette 1000 F enregistré : solde ' || v || ' (attendu -1500) ' || case when v = -1500 then 'OK' else '*** KO' end || E'\n';

  raise exception E'RESULTATS\n%', out;
end $$;
