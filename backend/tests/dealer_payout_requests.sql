-- Versements aux partenaires véhicule (contrat de partenariat, article 9) : compte de paiement enregistré et validé, demande dans la fenêtre du début de mois,
-- facture normalisée exigée à la demande, part demandable (sommes acquises à la fin du mois écoulé), frais de transaction et AIB, annulation / refus / règlement,
-- accès réservé. Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/dealer_payout_requests.sql --workdir backend
do $$
declare
  out text := ''; dp record; adm uuid; ride uuid; other uuid; o record; q record; r public.dealer_payout_requests; err text; w1 int; n int;
  paid0 int; paid1 int; alerts0 int; alerts1 int; sum_tx int; st text; cnt int; okb boolean; mtd int;
begin
  select d.id as did, d.profile_id as pid, d.company_name into dp from public.dealer_partners d where d.archived_at is null order by d.id limit 1;
  if dp.did is null then raise exception 'Aucun partenaire véhicule pour tester'; end if;
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select id into other from public.profiles where role::text = 'client' and id <> dp.pid order by id limit 1;
  select id into ride from public.rides where status = 'completed' limit 1;
  if ride is null then raise exception 'Aucune course terminée en base pour servir de modèle'; end if;

  update public.program_rules set value = 31 where key = 'dealer_payout_window_days';       -- fenêtre toujours ouverte, sauf aux étapes qui la testent
  insert into public.wallets (profile_id, kind, balance_fcfa) values (dp.pid, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
  update public.wallets set balance_fcfa = 100000 where profile_id = dp.pid and kind::text = 'tamcar_revenus';
  delete from public.dealer_payout_requests where dealer_id = dp.did;
  update public.dealer_partners set ifu = null, aib_exempt = false, aib_exempt_reason = null, payout_method = null, payout_provider = null, payout_account = null,
         payout_account_status = 'none', payout_account_validated_at = null, payout_account_validated_by = null where id = dp.did;
  update public.rides set dealer_partner_id = dp.did, ended_at = now() - interval '45 days' where id = ride;     -- première course il y a 45 jours

  -- 1. aperçu côté partenaire : compte absent, fenêtre ouverte, part demandable = solde moins les gains du mois en cours
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into o from public.dealer_payout_overview(null);
  reset role;
  mtd := o.month_to_date_fcfa;
  if mtd > 50000 then raise exception 'Jeu de données inattendu : % F gagnés ce mois-ci', mtd; end if;
  out := out || '1. aperçu : solde ' || o.wallet_fcfa || ' F, gains du mois ' || mtd || ' F, demandable ' || o.requestable_fcfa || ' F, compte ' || o.account_status || ', fenêtre ouverte=' || o.window_open
         || ', éligible=' || o.eligible || case when o.requestable_fcfa = 100000 - mtd and o.account_status = 'none' and o.window_open and o.eligible and o.window_days = 31 then ' OK' else ' *** KO' end || E'\n';

  -- 2. sans compte de paiement validé : refus
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(50000, 'FN-2026-001');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '2. demande sans compte : ' || coalesce(err, '*** aucune erreur') || case when err like '%compte de paiement%' then ' OK' else ' *** KO' end || E'\n';

  -- 3. enregistrement du compte (en attente), refus tant qu'il n'est pas validé, validation par l'équipe, changement = revalidation
  select count(*) into alerts0 from public.admin_alerts where kind = 'dealer_account';
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.dealer_save_payout_account('mobile_money', 'mtn', '+229 97 00 00 00');
  select * into o from public.dealer_payout_overview(null);
  reset role;
  select count(*) into alerts1 from public.admin_alerts where kind = 'dealer_account';
  out := out || '3a. compte enregistré : statut ' || o.account_status || ', alertes ' || alerts0 || ' -> ' || alerts1 || case when o.account_status = 'pending' and alerts1 = alerts0 + 1 then ' OK' else ' *** KO' end || E'\n';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(50000, 'FN-2026-001');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '3b. demande avec compte en attente : ' || coalesce(err, '*** aucune erreur') || case when err like '%validation%' then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_validate_dealer_account(dp.did);
  reset role;
  select payout_account_status into st from public.dealer_partners where id = dp.did;
  out := out || '3c. validation par l''équipe : ' || st || case when st = 'validated' then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.dealer_save_payout_account('mobile_money', 'mtn', '+229 97 00 00 00');      -- identique : reste validé
  reset role;
  select payout_account_status into st from public.dealer_partners where id = dp.did;
  out := out || '3d. même compte réenregistré : ' || st || case when st = 'validated' then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.dealer_save_payout_account('mobile_money', 'moov', '+229 95 11 22 33');      -- autre numéro : retour en attente
  reset role;
  select payout_account_status into st from public.dealer_partners where id = dp.did;
  out := out || '3e. numéro changé : ' || st || case when st = 'pending' then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_validate_dealer_account(dp.did);
  reset role;

  -- 4. devis : sans IFU (5 %), avec IFU (3 %)
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into q from public.dealer_payout_quote(50000, 'mobile_money');
  reset role;
  out := out || '4a. sans IFU, 50 000 F : AIB ' || q.aib_fcfa || ', frais ' || q.fee_fcfa || ', net ' || q.net_fcfa
         || case when q.aib_fcfa = 2500 and q.fee_fcfa = 475 and q.net_fcfa = 47025 then ' OK' else ' *** KO' end || E'\n';
  update public.dealer_partners set ifu = 'IFU-TEST-001' where id = dp.did;
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into q from public.dealer_payout_quote(50000, 'mobile_money');
  reset role;
  out := out || '4b. avec IFU : AIB ' || q.aib_fcfa || ', frais ' || q.fee_fcfa || ', net ' || q.net_fcfa
         || case when q.aib_fcfa = 1500 and q.fee_fcfa = 485 and q.net_fcfa = 48015 then ' OK' else ' *** KO' end || E'\n';

  -- 5. facture exigée à la demande
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(50000, '   ');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '5. demande sans facture : ' || coalesce(err, '*** aucune erreur') || case when err like '%facture normalisée%' then ' OK' else ' *** KO' end || E'\n';

  -- 6. demande de 50 000 F : somme réservée, deux lignes en attente, alerte, compte et facture figés sur la demande
  select count(*) into alerts0 from public.admin_alerts where kind = 'dealer_payout';
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.dealer_request_payout(50000, 'FN-2026-001');
  reset role;
  select balance_fcfa into w1 from public.wallets where profile_id = dp.pid and kind::text = 'tamcar_revenus';
  select coalesce(sum(t.amount_fcfa), 0), count(*) into sum_tx, cnt from public.wallet_transactions t where t.id in (r.wallet_tx_id, r.aib_tx_id) and t.status::text = 'pending';
  select count(*) into alerts1 from public.admin_alerts where kind = 'dealer_payout';
  out := out || '6. demande : statut ' || r.status || ', net ' || r.net_fcfa || ', compte ' || r.provider || ' ' || r.account || ', facture ' || r.invoice_number || ', portefeuille 100000 -> ' || w1
         || ', lignes en attente ' || cnt || ' pour ' || sum_tx || ' F, alertes ' || alerts0 || ' -> ' || alerts1
         || case when r.status = 'requested' and w1 = 50000 and cnt = 2 and sum_tx = -50000 and alerts1 = alerts0 + 1 and r.net_fcfa = 48015 and r.account = '+229 95 11 22 33'
                  and r.invoice_number = 'FN-2026-001' then ' OK' else ' *** KO' end || E'\n';

  -- 7. une seule demande à la fois ; le compte ne peut pas changer pendant une demande
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(1000, 'FN-2');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '7a. deuxième demande refusée : ' || coalesce(err, '*** aucune erreur') || case when err like '%déjà en cours%' then ' OK' else ' *** KO' end || E'\n';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_save_payout_account('virement', null, 'BJ66 BOA0 1234 5678 9012');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '7b. changement de compte pendant une demande : ' || coalesce(err, '*** aucune erreur') || case when err like '%en cours%' then ' OK' else ' *** KO' end || E'\n';

  -- 8. annulation : somme remise
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.dealer_cancel_payout(r.id);
  reset role;
  select balance_fcfa into w1 from public.wallets where profile_id = dp.pid and kind::text = 'tamcar_revenus';
  select status into st from public.dealer_payout_requests where id = r.id;
  out := out || '8. annulation : statut ' || st || ', portefeuille ' || w1 || case when st = 'cancelled' and w1 = 100000 then ' OK' else ' *** KO' end || E'\n';

  -- 9. fenêtre fermée (0 jour) : refus et aperçu fermé ; fenêtre rouverte ensuite
  update public.program_rules set value = 0 where key = 'dealer_payout_window_days';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(50000, 'FN-2026-002');
  exception when others then err := sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into o from public.dealer_payout_overview(null);
  reset role;
  out := out || '9. fenêtre fermée : ' || coalesce(err, '*** aucune erreur') || ' ; ouverte=' || o.window_open || ', prochaine ouverture ' || o.next_window_start
         || case when err like '%ouvertes du 1er au 0%' and not o.window_open and o.next_window_start > (now() at time zone 'Africa/Porto-Novo')::date then ' OK' else ' *** KO' end || E'\n';
  update public.program_rules set value = 31 where key = 'dealer_payout_window_days';

  -- 10. au-delà de la part demandable, sous le minimum, première course trop récente
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(100000 - mtd + 1, 'FN-2026-002');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '10a. au-delà du demandable : ' || coalesce(err, '*** aucune erreur') || case when err like '%part demandable%' then ' OK' else ' *** KO' end || E'\n';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(100, 'FN-2026-002');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '10b. 100 F sous le minimum : ' || coalesce(err, '*** aucune erreur') || case when err like '%minimal%' then ' OK' else ' *** KO' end || E'\n';
  update public.rides set ended_at = now() - interval '10 days' where id = ride;
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dealer_request_payout(10000, 'FN-2026-002');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '10c. première course il y a 10 jours : ' || coalesce(err, '*** aucune erreur') || case when err like '%un mois après%' then ' OK' else ' *** KO' end || E'\n';
  update public.rides set ended_at = now() - interval '45 days' where id = ride;

  -- 11. règlement par l'équipe : lignes validées, statut payé, « déjà versé » compte le montant demandé en entier
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select coalesce(s.paid_fcfa, 0) into paid0 from public.dealer_my_summary(dp.did) s;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.dealer_request_payout(50000, 'FN-2026-002');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_settle_dealer_payout(r.id, 'MTN-REF-123', null);
  select coalesce(s.paid_fcfa, 0) into paid1 from public.dealer_my_summary(dp.did) s;
  reset role;
  select status, invoice_number into st, err from public.dealer_payout_requests where id = r.id;
  select count(*) into cnt from public.wallet_transactions t where t.id in (r.wallet_tx_id, r.aib_tx_id) and t.status::text = 'success';
  select balance_fcfa into w1 from public.wallets where profile_id = dp.pid and kind::text = 'tamcar_revenus';
  out := out || '11a. règlement : statut ' || st || ', facture ' || err || ', lignes validées ' || cnt || ', déjà versé ' || paid0 || ' -> ' || paid1 || ', portefeuille ' || w1
         || case when st = 'paid' and cnt = 2 and paid1 - paid0 = 50000 and w1 = 50000 and err = 'FN-2026-002' then ' OK' else ' *** KO' end || E'\n';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.admin_settle_dealer_payout(r.id, 'AUTRE', 'FN-X');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '11b. double règlement refusé : ' || coalesce(err, '*** aucune erreur') || case when err like '%déjà traitée%' then ' OK' else ' *** KO' end || E'\n';

  -- 12. refus par l'équipe : somme remise au partenaire
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.dealer_request_payout(10000, 'FN-2026-003');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_reject_dealer_payout(r.id, 'Facture à corriger');
  select count(*) into n from public.admin_dealer_payout_requests('all') where id = r.id and status = 'rejected';
  reset role;
  select balance_fcfa into w1 from public.wallets where profile_id = dp.pid and kind::text = 'tamcar_revenus';
  out := out || '12. refus : demandes refusées lues par l''équipe ' || n || ', portefeuille ' || w1 || case when n = 1 and w1 = 50000 then ' OK' else ' *** KO' end || E'\n';

  -- 13. accès : un autre compte ne voit pas les demandes ; le partenaire les voit ; l'équipe lit les partenaires et leur compte
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dealer_payout_requests;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', dp.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.dealer_my_payout_requests(null, 10);
  select count(*) into alerts1 from public.dealer_my_payouts(null, 10) where amount_fcfa = 48500;
  reset role;
  out := out || '13a. autre compte : ' || n || ' demande visible ; partenaire : ' || cnt || ' demandes listées, doublons dans les versements manuels ' || alerts1
         || case when n = 0 and cnt = 3 and alerts1 = 0 then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dealer_partners where payout_account_status = 'validated';
  reset role;
  out := out || '13b. l''équipe lit les comptes validés : ' || n || case when n >= 1 then ' OK' else ' *** KO' end || E'\n';

  -- 14. comptabilité : la retenue d'AIB est rangée sur le compte 447
  select (prosrc like '%aib_withholding%447%') into okb from pg_proc where proname = 'bo_sync_platform';
  out := out || '14. synchronisation comptable : AIB sur 447 ' || case when okb then 'OK' else '*** KO' end || E'\n';

  raise exception 'RESULTATS%', E'\n' || out;
end $$;
