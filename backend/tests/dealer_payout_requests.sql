-- Versements aux partenaires véhicule (contrat de partenariat, article 9) : demande en ligne à tout moment un mois après la première course,
-- frais de transaction à la charge du partenaire, facture normalisée et retenue d'AIB, annulation / refus / règlement, accès réservé.
-- Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/dealer_payout_requests.sql --workdir backend
do $$
declare
  out text := ''; dp record; adm uuid; ride uuid; other uuid; o record; q record; r public.dealer_payout_requests; err text; w0 int; w1 int; n int;
  paid0 int; paid1 int; alerts0 int; alerts1 int; sum_tx int; st text; cnt int; okb boolean;
begin
  select d.id as did, d.profile_id as pid, d.company_name into dp from public.dealer_partners d where d.archived_at is null order by d.id limit 1;
  if dp.did is null then raise exception 'Aucun partenaire véhicule pour tester'; end if;
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select id into other from public.profiles where role::text = 'client' and id <> dp.pid order by id limit 1;
  select id into ride from public.rides where status = 'completed' limit 1;
  if ride is null then raise exception 'Aucune course terminée en base pour servir de modèle'; end if;

  insert into public.wallets (profile_id, kind, balance_fcfa) values (dp.pid, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
  update public.wallets set balance_fcfa = 100000 where profile_id = dp.pid and kind::text = 'tamcar_revenus';
  delete from public.dealer_payout_requests where dealer_id = dp.did;
  update public.dealer_partners set ifu = null, aib_exempt = false, aib_exempt_reason = null where id = dp.did;
  -- première course il y a 45 jours : la demande est ouverte
  update public.rides set dealer_partner_id = dp.did, ended_at = now() - interval '45 days' where id = ride;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select coalesce(s.paid_fcfa, 0) into paid0 from public.dealer_my_summary(dp.did) s;
  reset role;

  -- 1. aperçu côté partenaire
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into o from public.dealer_payout_overview(null);
  reset role;
  out := out || '1. aperçu : disponible ' || o.available_fcfa || ' F, ouvert dès le ' || o.eligible_from || ', éligible=' || o.eligible || ', AIB ' || o.aib_rate_permille || ' ‰ (sans IFU), frais ' || o.fee_permille
         || ' ‰ ' || case when o.available_fcfa = 100000 and o.eligible and o.aib_rate_permille = 50 and o.fee_permille = 10 then 'OK' else '*** KO' end || E'\n';

  -- 2. devis : sans IFU, avec IFU, exonéré, virement
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into q from public.dealer_payout_quote(50000, 'mobile_money');
  reset role;
  out := out || '2a. sans IFU, 50 000 F : AIB ' || q.aib_fcfa || ' (5 %), frais ' || q.fee_fcfa || ', net ' || q.net_fcfa
         || case when q.aib_fcfa = 2500 and q.fee_fcfa = 475 and q.net_fcfa = 47025 then ' OK' else ' *** KO' end || E'\n';
  update public.dealer_partners set ifu = 'IFU-TEST-001' where id = dp.did;
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into q from public.dealer_payout_quote(50000, 'mobile_money');
  reset role;
  out := out || '2b. avec IFU : AIB ' || q.aib_fcfa || ' (3 %), frais ' || q.fee_fcfa || ', net ' || q.net_fcfa
         || case when q.aib_fcfa = 1500 and q.fee_fcfa = 485 and q.net_fcfa = 48015 then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_dealer_tax(dp.did, 'IFU-TEST-001', true, 'Attestation d''exonération');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into q from public.dealer_payout_quote(50000, 'mobile_money');
  reset role;
  out := out || '2c. exonéré : AIB ' || q.aib_fcfa || ', frais ' || q.fee_fcfa || ', net ' || q.net_fcfa
         || case when q.aib_fcfa = 0 and q.fee_fcfa = 500 and q.net_fcfa = 49500 then ' OK' else ' *** KO' end || E'\n';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.admin_set_dealer_tax(dp.did, 'IFU-TEST-001', true, '  ');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '2d. exonération sans motif refusée : ' || coalesce(err, '*** aucune erreur') || case when err like '%motif%' then ' OK' else ' *** KO' end || E'\n';
  update public.dealer_partners set aib_exempt = false, aib_exempt_reason = null where id = dp.did;   -- retour à « avec IFU »
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into q from public.dealer_payout_quote(50000, 'virement');
  reset role;
  out := out || '2e. virement, avec IFU : AIB ' || q.aib_fcfa || ', frais ' || q.fee_fcfa || ', net ' || q.net_fcfa
         || case when q.aib_fcfa = 1500 and q.fee_fcfa = 0 and q.net_fcfa = 48500 then ' OK' else ' *** KO' end || E'\n';

  -- 3. demande de 50 000 F (avec IFU) : somme réservée, deux lignes en attente, alerte à l'équipe
  select count(*) into alerts0 from public.admin_alerts where kind = 'dealer_payout';
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.dealer_request_payout(50000, 'mobile_money', '+229 97 00 00 00', 'mtn', 'FN-2026-001');
  reset role;
  select balance_fcfa into w1 from public.wallets where profile_id = dp.pid and kind::text = 'tamcar_revenus';
  select coalesce(sum(t.amount_fcfa), 0), count(*) into sum_tx, cnt from public.wallet_transactions t where t.id in (r.wallet_tx_id, r.aib_tx_id) and t.status::text = 'pending';
  select count(*) into alerts1 from public.admin_alerts where kind = 'dealer_payout';
  out := out || '3. demande : statut ' || r.status || ', net ' || r.net_fcfa || ', portefeuille 100000 -> ' || w1 || ', lignes en attente ' || cnt || ' pour ' || sum_tx || ' F, alertes ' || alerts0 || ' -> ' || alerts1
         || case when r.status = 'requested' and w1 = 50000 and cnt = 2 and sum_tx = -50000 and alerts1 = alerts0 + 1 and r.net_fcfa = 48015 then ' OK' else ' *** KO' end || E'\n';

  -- 4. une seule demande à la fois
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(1000, 'mobile_money', '+229 97 00 00 00', 'mtn', 'FN-2');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '4. deuxième demande refusée : ' || coalesce(err, '*** aucune erreur') || case when err like '%déjà en cours%' then ' OK' else ' *** KO' end || E'\n';

  -- 5. annulation par le partenaire : somme remise, lignes annulées
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.dealer_cancel_payout(r.id);
  reset role;
  select balance_fcfa into w1 from public.wallets where profile_id = dp.pid and kind::text = 'tamcar_revenus';
  select status into st from public.dealer_payout_requests where id = r.id;
  select count(*) into cnt from public.wallet_transactions t where t.id in (r.wallet_tx_id, r.aib_tx_id) and t.status::text = 'failed';
  out := out || '5. annulation : statut ' || st || ', portefeuille ' || w1 || ', lignes annulées ' || cnt
         || case when st = 'cancelled' and w1 = 100000 and cnt = 2 then ' OK' else ' *** KO' end || E'\n';

  -- 6. montant supérieur à la part disponible ; montant sous le minimum ; demande avant un mois d'activité
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(200000, 'mobile_money', '+229 97 00 00 00', 'moov', 'FN-3');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '6a. 200 000 F > disponible : ' || coalesce(err, '*** aucune erreur') || case when err like '%insuffisante%' then ' OK' else ' *** KO' end || E'\n';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(100, 'mobile_money', '+229 97 00 00 00', 'moov', 'FN-3');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '6b. 100 F sous le minimum : ' || coalesce(err, '*** aucune erreur') || case when err like '%minimal%' then ' OK' else ' *** KO' end || E'\n';
  update public.rides set ended_at = now() - interval '10 days' where id = ride;
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(10000, 'mobile_money', '+229 97 00 00 00', 'moov', 'FN-3');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '6c. première course il y a 10 jours : ' || coalesce(err, '*** aucune erreur') || case when err like '%un mois après%' then ' OK' else ' *** KO' end || E'\n';
  update public.rides set ended_at = now() - interval '45 days' where id = ride;

  -- 7. règlement : le n° de facture est exigé ; puis lignes validées, statut payé, « déjà versé » compte le montant demandé en entier
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.dealer_request_payout(50000, 'mobile_money', '+229 97 00 00 00', 'mtn', null);
  reset role;
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.admin_settle_dealer_payout(r.id, 'MTN-REF-123', null);
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '7a. règlement sans facture refusé : ' || coalesce(err, '*** aucune erreur') || case when err like '%facture%' then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_settle_dealer_payout(r.id, 'MTN-REF-123', 'FN-2026-002');
  reset role;
  select status, invoice_number into st, err from public.dealer_payout_requests where id = r.id;
  select count(*) into cnt from public.wallet_transactions t where t.id in (r.wallet_tx_id, r.aib_tx_id) and t.status::text = 'success';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select coalesce(s.paid_fcfa, 0) into paid1 from public.dealer_my_summary(dp.did) s;
  reset role;
  select balance_fcfa into w1 from public.wallets where profile_id = dp.pid and kind::text = 'tamcar_revenus';
  out := out || '7b. règlement : statut ' || st || ', facture ' || err || ', lignes validées ' || cnt || ', déjà versé ' || paid0 || ' -> ' || paid1 || ', portefeuille ' || w1
         || case when st = 'paid' and cnt = 2 and paid1 - paid0 = 50000 and w1 = 50000 and err = 'FN-2026-002' then ' OK' else ' *** KO' end || E'\n';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.admin_settle_dealer_payout(r.id, 'AUTRE', 'FN-X');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '7c. double règlement refusé : ' || coalesce(err, '*** aucune erreur') || case when err like '%déjà traitée%' then ' OK' else ' *** KO' end || E'\n';

  -- 8. refus par l'équipe : somme remise au partenaire
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.dealer_request_payout(10000, 'virement', 'BJ66 BOA0 1234 5678 9012', null, 'FN-2026-003');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_reject_dealer_payout(r.id, 'IBAN à vérifier');
  select count(*) into n from public.admin_dealer_payout_requests('all') where id = r.id and status = 'rejected';
  reset role;
  select balance_fcfa into w1 from public.wallets where profile_id = dp.pid and kind::text = 'tamcar_revenus';
  out := out || '8. refus : demandes refusées lues par l''équipe ' || n || ', portefeuille ' || w1 || case when n = 1 and w1 = 50000 then ' OK' else ' *** KO' end || E'\n';

  -- 9. accès : un autre compte ne voit pas les demandes ; la liste du partenaire les voit ; les versements « manuels » ne mélangent pas les demandes
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dealer_payout_requests;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.dealer_my_payout_requests(null, 10);
  select count(*) into alerts1 from public.dealer_my_payouts(null, 10) where amount_fcfa = 48500;
  reset role;
  out := out || '9. autre compte : ' || n || ' demande visible ; partenaire : ' || cnt || ' demandes listées, doublons dans les versements manuels ' || alerts1
         || case when n = 0 and cnt = 3 and alerts1 = 0 then ' OK' else ' *** KO' end || E'\n';

  -- 10. comptabilité : la retenue d'AIB est rangée sur le compte 447
  select (prosrc like '%aib_withholding%447%') into okb from pg_proc where proname = 'bo_sync_platform';
  out := out || '10. synchronisation comptable : AIB sur 447 ' || case when okb then 'OK' else '*** KO' end || E'
';

  raise exception 'RESULTATS%', E'\n' || out;
end $$;
