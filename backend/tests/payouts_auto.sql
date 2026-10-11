-- Retraits chauffeur automatiques (FeexPay) : règles de validation, verrou d'envoi, finalisation idempotente, recrédit unique, garde-fous
-- des boutons « Payé » / « Refuser », droits d'accès. Aucun appel réseau ; tout est annulé en fin de test (résultat dans « RESULTATS »).
-- Usage : supabase db query --linked -f tests/payouts_auto.sql  (depuis backend/)
do $$
declare
  out text := '';
  adm uuid; did uuid; pid uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid;
  j jsonb; r text; bal int; st text; ref text; n int; msg text;
  num text := '97000001';
begin
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select d.id, d.profile_id into did, pid
    from public.drivers d join public.profiles q on q.id = d.profile_id
   where d.status::text = 'active' and q.role::text <> 'admin' order by d.id limit 1;
  if did is null then raise exception 'Aucun chauffeur actif pour tester'; end if;

  insert into public.wallets (profile_id, kind, balance_fcfa) values (pid, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
  update public.wallets set balance_fcfa = 1000000 where profile_id = pid and kind::text = 'tamcar_revenus';
  delete from public.driver_payouts where driver_id = did;
  update public.program_rules set value = 100000 where key = 'payout_auto_max_fcfa';
  update public.program_rules set value = 200000 where key = 'payout_auto_daily_cap_fcfa';
  update public.program_rules set value = 1 where key = 'payout_hold_new_number';

  -- 1. demande de retrait (en chauffeur) : montant réservé, retrait « pending »
  perform set_config('request.jwt.claims', json_build_object('sub', pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select id into p1 from public.request_driver_payout(1000, 'mtn', num);
  reset role;
  select balance_fcfa into bal from public.wallets where profile_id = pid and kind::text = 'tamcar_revenus';
  select status into st from public.driver_payouts where id = p1;
  out := out || '1. demande de 1 000 F : statut ' || coalesce(st, '∅') || ', solde ' || bal || case when st = 'pending' and bal = 999000 then ' OK' else ' *** KO' end || E'\n';

  -- 2. premier retrait vers ce numéro : validation requise (hold), le retrait reste en attente
  r := public._payout_hold_reason(p1);
  j := public.feexpay_payout_prepare(p1, false);
  select status, hold_reason into st, msg from public.driver_payouts where id = p1;
  out := out || '2. premier retrait vers ce numéro : ' || coalesce(r, '∅') || ' | action ' || coalesce(j ->> 'action', '∅') || ', statut ' || st
         || case when r like 'Premier retrait%' and j ->> 'action' = 'hold' and st = 'pending' and msg is not null then ' OK' else ' *** KO' end || E'\n';

  -- 3. envoi forcé par l'équipe : prise du verrou ; un second appel ne reprend pas le verrou
  j := public.feexpay_payout_prepare(p1, true);
  select status, auto, attempts into st, ref, n from public.driver_payouts where id = p1;
  out := out || '3. envoi forcé : action ' || coalesce(j ->> 'action', '∅') || ', statut ' || st || ', tentatives ' || n;
  j := public.feexpay_payout_prepare(p1, true);
  out := out || ' | 2e appel : action ' || coalesce(j ->> 'action', '∅') || ', statut ' || coalesce(j ->> 'status', '∅')
         || case when st = 'processing' and n = 1 and j ->> 'action' = 'none' then ' OK (un seul envoi possible)' else ' *** KO' end || E'\n';

  -- 4. identifiant FeexPay enregistré une seule fois
  perform public.feexpay_payout_set_ref(p1, 'ref-1');
  perform public.feexpay_payout_set_ref(p1, 'ref-2');
  select fedapay_payout_id into ref from public.driver_payouts where id = p1;
  out := out || '4. identifiant FeexPay : ' || coalesce(ref, '∅') || case when ref = 'ref-1' then ' OK' else ' *** KO' end || E'\n';

  -- 5. « Payé » et « Refuser » refusés pour un retrait déjà parti chez FeexPay
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_mark_payout_paid(p1, 'X');
    out := out || E'5a. Payé sur un retrait parti : *** KO (accepté)\n';
  exception when others then out := out || '5a. Payé sur un retrait parti refusé' || case when sqlerrm like '%déjà parti chez FeexPay%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  begin
    perform public.admin_reject_payout(p1, 'X');
    out := out || E'5b. Refuser un retrait parti : *** KO (accepté)\n';
  exception when others then out := out || '5b. Refuser un retrait parti refusé' || case when sqlerrm like '%déjà parti chez FeexPay%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  reset role;

  -- 6. issue SUCCESSFUL : payé, débit définitif, idempotent
  r := public.feexpay_payout_finalize(p1, 'success', 'ref-1', null);
  out := out || '6. finalisation payée : ' || r;
  r := public.feexpay_payout_finalize(p1, 'success', 'ref-1', null);
  select status into st from public.driver_payouts where id = p1;
  select t.status::text into msg from public.driver_payouts d join public.wallet_transactions t on t.id = d.wallet_tx_id where d.id = p1;
  select balance_fcfa into bal from public.wallets where profile_id = pid and kind::text = 'tamcar_revenus';
  out := out || ' | rejouée : ' || r || ', statut ' || st || ', transaction ' || coalesce(msg, '∅') || ', solde ' || bal
         || case when r = 'paid' and st = 'paid' and msg = 'success' and bal = 999000 then ' OK' else ' *** KO' end || E'\n';

  -- 7. numéro déjà payé : plus de validation ; échec FAILED → recrédit UNE seule fois ; un SUCCESS tardif = conflit signalé
  perform set_config('request.jwt.claims', json_build_object('sub', pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select id into p2 from public.request_driver_payout(2000, 'mtn', num);
  reset role;
  r := public._payout_hold_reason(p2);
  j := public.feexpay_payout_prepare(p2, false);
  perform public.feexpay_payout_set_ref(p2, 'ref-2');
  out := out || '7. numéro connu : motif ' || coalesce(r, 'aucun') || ', action ' || coalesce(j ->> 'action', '∅') || case when r is null and j ->> 'action' = 'send' then ' OK' else ' *** KO' end || E'\n';
  r := public.feexpay_payout_finalize(p2, 'failed', 'ref-2', 'Solde insuffisant chez l''opérateur');
  select balance_fcfa into bal from public.wallets where profile_id = pid and kind::text = 'tamcar_revenus';
  out := out || '   échec : ' || r || ', solde ' || bal;
  r := public.feexpay_payout_finalize(p2, 'failed', 'ref-2', 'again');
  select balance_fcfa into bal from public.wallets where profile_id = pid and kind::text = 'tamcar_revenus';
  out := out || ' | rejoué : ' || r || ', solde ' || bal;
  r := public.feexpay_payout_finalize(p2, 'success', 'ref-2', null);
  select status into st from public.driver_payouts where id = p2;
  out := out || ' | succès tardif : ' || r || ', statut ' || st || case when bal = 999000 and r = 'conflict' and st = 'failed' then ' OK (recrédit unique, conflit signalé)' else ' *** KO' end || E'\n';

  -- 8. montant au-dessus du seuil automatique : validation requise
  perform set_config('request.jwt.claims', json_build_object('sub', pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select id into p3 from public.request_driver_payout(120000, 'mtn', num);
  reset role;
  r := public._payout_hold_reason(p3);
  out := out || '8. 120 000 F : ' || coalesce(r, 'aucun') || case when r like 'Montant supérieur à 100000 F%' then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_reject_payout(p3, 'test');
  reset role;
  select balance_fcfa into bal from public.wallets where profile_id = pid and kind::text = 'tamcar_revenus';
  out := out || '   refus de l''équipe (retrait sans envoi) : solde ' || bal || case when bal = 999000 then ' OK' else ' *** KO' end || E'\n';

  -- 9. plafond du jour : 150 000 F déjà payés aujourd'hui + 60 000 F > 200 000 F
  insert into public.driver_payouts (driver_id, profile_id, amount_fcfa, provider, msisdn, status, processed_at)
  values (did, pid, 150000, 'mtn', num, 'paid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select id into p4 from public.request_driver_payout(60000, 'mtn', num);
  reset role;
  r := public._payout_hold_reason(p4);
  out := out || '9. plafond du jour : ' || coalesce(r, 'aucun') || case when r like 'Plafond de 200000 F%' then ' OK' else ' *** KO' end || E'\n';

  -- 10. refus définitif de FeexPay : le retrait revient en attente avec le motif ; sans effet s'il est déjà parti (identifiant connu)
  j := public.feexpay_payout_prepare(p4, true);
  perform public.feexpay_payout_release(p4, 'HTTP 403 : IP non autorisée');
  select status, hold_reason into st, msg from public.driver_payouts where id = p4;
  out := out || '10. refus de FeexPay : statut ' || st || ', motif ' || coalesce(msg, '∅');
  j := public.feexpay_payout_prepare(p4, true);
  perform public.feexpay_payout_set_ref(p4, 'ref-4');
  perform public.feexpay_payout_release(p4, 'ne doit rien changer');
  select status into st from public.driver_payouts where id = p4;
  out := out || ' | après envoi : ' || st || case when msg like 'Envoi automatique impossible : HTTP 403%' and st = 'processing' then ' OK' else ' *** KO' end || E'\n';
  r := public.feexpay_payout_finalize(p4, 'failed', 'ref-4', 'test');

  -- 11. envoi incertain signalé une seule fois, sans rien modifier d'autre
  perform set_config('request.jwt.claims', json_build_object('sub', pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select id into p5 from public.request_driver_payout(1500, 'moov', '96000002');
  reset role;
  j := public.feexpay_payout_prepare(p5, true);
  perform public.feexpay_payout_hold(p5, 'Envoi incertain : à vérifier');
  select status, hold_reason into st, msg from public.driver_payouts where id = p5;
  out := out || '11. envoi incertain : statut ' || st || ', motif ' || coalesce(msg, '∅') || case when st = 'processing' and msg = 'Envoi incertain : à vérifier' then ' OK' else ' *** KO' end || E'\n';
  -- sans identifiant FeexPay, l'équipe peut trancher (Refuser) : le chauffeur est recrédité
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_reject_payout(p5, 'vérifié : rien reçu');
  reset role;
  select status into st from public.driver_payouts where id = p5;
  out := out || '    l''équipe tranche (sans identifiant) : ' || st || case when st = 'failed' then ' OK' else ' *** KO' end || E'\n';

  -- 12. liste à relire chez FeexPay
  perform set_config('request.jwt.claims', json_build_object('sub', pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select id into p6 from public.request_driver_payout(1000, 'mtn', num);
  reset role;
  j := public.feexpay_payout_prepare(p6, false);
  perform public.feexpay_payout_set_ref(p6, 'ref-6');
  update public.driver_payouts set sent_at = now() - interval '1 minute' where id = p6;
  select count(*) into n from public.feexpay_payouts_to_check() t where t.id = p6 and t.ref = 'ref-6';
  out := out || '12. retrait parti il y a 1 min : relu par la vérification planifiée : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  r := public.feexpay_payout_finalize(p6, 'success', 'ref-6', null);

  -- 13. droits : un compte connecté ne peut appeler aucune fonction interne ; il lit seulement la configuration
  perform set_config('request.jwt.claims', json_build_object('sub', pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.feexpay_payout_prepare(p6, true);
    out := out || E'13a. prepare appelable par un chauffeur : *** KO\n';
  exception when others then out := out || '13a. prepare refusé à un chauffeur' || case when sqlerrm like '%permission denied%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  begin
    perform public.feexpay_payout_finalize(p6, 'failed', null, null);
    out := out || E'13b. finalize appelable par un chauffeur : *** KO\n';
  exception when others then out := out || '13b. finalize refusé à un chauffeur' || case when sqlerrm like '%permission denied%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  begin
    perform public._payout_hold_reason(p6);
    out := out || E'13c. règle de validation appelable par un chauffeur : *** KO\n';
  exception when others then out := out || '13c. règle de validation refusée à un chauffeur' || case when sqlerrm like '%permission denied%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  begin
    perform public.admin_driver_payouts('open');
    out := out || E'13d. liste admin appelable par un chauffeur : *** KO\n';
  exception when others then out := out || '13d. liste admin refusée à un chauffeur' || case when sqlerrm like '%Réservé%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  select count(*) into n from public.payouts_config();
  out := out || '13e. configuration lisible par le chauffeur : ' || n || ' ligne' || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  reset role;

  -- 14. l'équipe : liste enrichie et réglages bornés
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.admin_driver_payouts('done') where id = p1 and provider_ref = 'ref-1' and auto;
  out := out || '14a. liste admin (retraits clos) avec identifiant FeexPay : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  begin
    perform public.admin_set_program_rule('payout_auto_max_fcfa', 600000);
    out := out || E'14b. seuil à 600 000 F : *** KO (accepté)\n';
  exception when others then out := out || '14b. seuil à 600 000 F refusé' || case when sqlerrm like '%500 000%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  begin
    perform public.admin_set_program_rule('payout_hold_new_number', 2);
    out := out || E'14c. validation du nouveau numéro à 2 : *** KO (accepté)\n';
  exception when others then out := out || '14c. validation du nouveau numéro à 2 refusée' || case when sqlerrm like '%0 ou 1%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  reset role;

  raise exception E'RESULTATS\n%', out;
end $$;
