-- Contrat de partenariat véhicule : planchers de recettes, durée du contrat par véhicule, fiche véhicule et suspension, sort du fonds de rachat, relevé mensuel,
-- avis de fin de Durée à 15 jours. Rôles réels, tout est annulé.
-- Usage : migration + ce test concaténés dans une seule transaction (simulation), ou après application : bash runtest.sh contract_sheet_fund_notices
do $$
declare
  out text := ''; adm uuid; other uuid; drv record; dprof uuid; ride uuid;
  today date := (now() at time zone 'Africa/Porto-Novo')::date;
  n int; n0 int; n1 int; err text; s text; st text; reason text; on_line boolean; ex int; exp_end date; got_end date; m int; j jsonb;
  b0 record; b1 record; b2 record; w_rachat int; w_rev int; cnt int; k0 int; k1 int; okb boolean;
begin
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select p.id into other from public.profiles p where p.role::text = 'client' and not exists (select 1 from public.dealer_partners x where x.profile_id = p.id) order by p.id limit 1;
  select d.id as did, d.profile_id as pid, d.current_vehicle_id as vid, v.category::text as cat, v.dealer_partner_id as dealer into drv
    from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
   where d.application_type::text = 'cession' and d.status::text = 'active' and v.dealer_partner_id is not null
   order by d.cession_start_on nulls last, d.id limit 1;
  if drv.did is null then raise exception 'Aucun chauffeur en cession avec véhicule de partenaire pour tester'; end if;
  select profile_id into dprof from public.dealer_partners where id = drv.dealer;
  update public.drivers set cession_start_on = coalesce(cession_start_on, today - 100) where id = drv.did;
  delete from public.driver_excused_days where driver_id = drv.did;

  -- 1. planchers de recettes
  out := out || '1. planchers : moto ' || public._vehicle_floor('moto') || ', tricycle ' || public._vehicle_floor('tricycle') || ', Essentiel ' || public._vehicle_floor('essentiel')
         || ', Confort ' || public._vehicle_floor('confort')
         || case when public._vehicle_floor('moto') = 5850 and public._vehicle_floor('tricycle') = 10000 and public._vehicle_floor('essentiel') = 13700
                      and public._vehicle_floor('confort') = 16700 then ' OK' else ' *** KO' end || E'\n';

  -- 2. durée du contrat par catégorie, puis durée retenue sur la fiche du véhicule
  update public.vehicles set contract_months = null where id = drv.vid;
  m := public._contract_months(drv.did);
  out := out || '2a. durée de la catégorie ' || drv.cat || ' : ' || m || ' mois'
         || case when m = public._program_rule('contract_months_' || drv.cat) then ' OK' else ' *** KO' end || E'\n';
  update public.vehicles set contract_months = 7 where id = drv.vid;
  select cession_start_on into exp_end from public.drivers where id = drv.did;
  got_end := public._cession_end(drv.did);
  out := out || '2b. durée retenue 7 mois : fin ' || got_end || ' (début ' || exp_end || ')'
         || case when public._contract_months(drv.did) = 7 and got_end = (exp_end + interval '7 months')::date then ' OK' else ' *** KO' end || E'\n';
  insert into public.driver_excused_days (driver_id, day, reason) values (drv.did, today - 2, 'maladie') on conflict do nothing;
  got_end := public._cession_end(drv.did);
  out := out || '2c. un jour excusé prolonge d''un jour : ' || got_end || case when got_end = (exp_end + interval '7 months')::date + 1 then ' OK' else ' *** KO' end || E'\n';
  delete from public.driver_excused_days where driver_id = drv.did;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_driver_contract(drv.did);
  reset role;
  out := out || '2d. fiche chauffeur : mois ' || (j->>'months') || ', retrait TamAssur ' || (j->>'tamassur_months') || ' mois'
         || case when (j->>'months')::int = 7 and (j->>'tamassur_months')::int = public._tamassur_months(drv.did) then ' OK' else ' *** KO' end || E'\n';

  -- 3. fiche véhicule : accès réservé, assurance expirée = suspension (hors ligne, alerte), mise en ligne refusée, régularisation = remise en service
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.admin_update_vehicle_sheet(drv.vid, null, null, null, null, null, null, null, null, null, null, null);
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '3a. fiche modifiée par un non-admin : ' || coalesce(err, '*** aucune erreur') || case when err like '%Admin only%' then ' OK' else ' *** KO' end || E'\n';
  update public.drivers set is_online = true where id = drv.did;
  select count(*) into n0 from public.admin_alerts where kind = 'vehicle_suspended';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  s := public.admin_update_vehicle_sheet(drv.vid, 'VIN-TEST-123', 12500, 'essence', 7, 'NSIA', 'POL-001', today - 1, today + 200, 'TRK-9', today - 30, 'Reçu n° 55');
  reset role;
  select status::text, suspension_reason into st, reason from public.vehicles where id = drv.vid;
  select is_online into on_line from public.drivers where id = drv.did;
  select count(*) into n1 from public.admin_alerts where kind = 'vehicle_suspended';
  out := out || '3b. assurance expirée : ' || s || ', véhicule ' || st || ' (' || coalesce(reason, '-') || '), chauffeur en ligne=' || on_line || ', alertes ' || n0 || ' -> ' || n1
         || case when s = 'suspended' and st = 'maintenance' and reason like 'Assurance expirée%' and not on_line and n1 = n0 + 1 then ' OK' else ' *** KO' end || E'\n';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', drv.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.driver_go_online(2.6, 6.5);
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '3c. mise en ligne d''un véhicule suspendu : ' || coalesce(err, '*** aucune erreur') || case when err like '%Véhicule suspendu%' then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  s := public.admin_update_vehicle_sheet(drv.vid, 'VIN-TEST-123', 12500, 'essence', 7, 'NSIA', 'POL-001', today + 60, today + 200, 'TRK-9', today - 30, 'Reçu n° 55');
  reset role;
  select status::text, suspension_reason into st, reason from public.vehicles where id = drv.vid;
  out := out || '3d. assurance renouvelée : ' || s || ', véhicule ' || st
         || case when s = 'reactivated' and st = 'active' and reason is null then ' OK' else ' *** KO' end || E'\n';

  -- 4. rappels à 30 et 7 jours, une seule fois chacun
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_update_vehicle_sheet(drv.vid, 'VIN-TEST-123', 12500, 'essence', 7, 'NSIA', 'POL-001', today + 60, today + 5, 'TRK-9', today - 30, 'Reçu n° 55');
  reset role;
  delete from public.vehicle_compliance_notices where vehicle_id = drv.vid;
  j := public._vehicle_compliance_sweep();
  select count(*) into cnt from public.vehicle_compliance_notices where vehicle_id = drv.vid and kind = 'visit';
  out := out || '4a. rappels de visite à J-5 : ' || (j->>'reminders') || ' envoyés, ' || cnt || ' enregistrés'
         || case when (j->>'reminders')::int = 2 and cnt = 2 then ' OK' else ' *** KO' end || E'\n';
  j := public._vehicle_compliance_sweep();
  out := out || '4b. second passage le même jour : ' || (j->>'reminders') || ' rappel' || case when (j->>'reminders')::int = 0 then ' OK' else ' *** KO' end || E'\n';
  update public.vehicles set technical_visit_expires_on = today - 3 where id = drv.vid;
  j := public._vehicle_compliance_sweep();
  select status::text, suspension_reason into st, reason from public.vehicles where id = drv.vid;
  out := out || '4c. visite expirée au passage de nuit : suspendus ' || (j->>'suspended') || ', véhicule ' || st || ' (' || coalesce(reason, '-') || ')'
         || case when (j->>'suspended')::int = 1 and st = 'maintenance' and reason like 'Visite technique expirée%' then ' OK' else ' *** KO' end || E'\n';
  update public.vehicles set technical_visit_expires_on = today + 300 where id = drv.vid;
  j := public._vehicle_compliance_sweep();
  select status::text into st from public.vehicles where id = drv.vid;
  out := out || '4d. visite renouvelée : remis en service ' || (j->>'reactivated') || ', véhicule ' || st
         || case when (j->>'reactivated')::int = 1 and st = 'active' then ' OK' else ' *** KO' end || E'\n';

  -- 5. sort du fonds de rachat : restitution, puis conservation sur faute motivée
  insert into public.wallets (profile_id, kind, balance_fcfa) values (drv.pid, 'tamcar_rachat', 0) on conflict (profile_id, kind) do nothing;
  insert into public.wallets (profile_id, kind, balance_fcfa) values (drv.pid, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
  update public.wallets set balance_fcfa = 80000 where profile_id = drv.pid and kind::text = 'tamcar_rachat';
  select balance_fcfa into w_rev from public.wallets where profile_id = drv.pid and kind::text = 'tamcar_revenus';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', drv.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.admin_settle_driver_fund(drv.did, false, null);
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '5a. règlement du fonds par le chauffeur lui-même : ' || coalesce(err, '*** aucune erreur') || case when err like '%Admin only%' then ' OK' else ' *** KO' end || E'\n';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.admin_settle_driver_fund(drv.did, true, '   ');
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '5b. faute sans motif : ' || coalesce(err, '*** aucune erreur') || case when err like '%motivée%' then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_settle_driver_fund(drv.did, false, 'Fin de contrat normale');
  reset role;
  select balance_fcfa into w_rachat from public.wallets where profile_id = drv.pid and kind::text = 'tamcar_rachat';
  out := out || '5c. restitution : ' || (j->>'settled_fcfa') || ' F, fonds -> ' || w_rachat || ', revenus ' || w_rev || ' -> ' || (select balance_fcfa from public.wallets where profile_id = drv.pid and kind::text = 'tamcar_revenus')
         || case when (j->>'settled_fcfa')::int = 80000 and w_rachat = 0 and (select balance_fcfa from public.wallets where profile_id = drv.pid and kind::text = 'tamcar_revenus') = w_rev + 80000
                      and (j->>'outcome') = 'returned' then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_settle_driver_fund(drv.did, false, null);
  reset role;
  out := out || '5d. second règlement sans solde : ' || (j->>'settled_fcfa') || ' F' || case when (j->>'settled_fcfa')::int = 0 then ' OK' else ' *** KO' end || E'\n';
  update public.wallets set balance_fcfa = 50000 where profile_id = drv.pid and kind::text = 'tamcar_rachat';
  select balance_fcfa into w_rev from public.wallets where profile_id = drv.pid and kind::text = 'tamcar_revenus';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_settle_driver_fund(drv.did, true, 'Véhicule dégradé volontairement, constat du 12 octobre');
  reset role;
  select balance_fcfa into w_rachat from public.wallets where profile_id = drv.pid and kind::text = 'tamcar_rachat';
  select count(*) into cnt from public.wallet_transactions t join public.wallets w on w.id = t.wallet_id where w.profile_id = drv.pid and t.type::text = 'rachat_forfeit' and t.amount_fcfa = -50000;
  out := out || '5e. faute : ' || (j->>'settled_fcfa') || ' F conservés par TamCar, fonds -> ' || w_rachat || ', revenus inchangés '
         || ((select balance_fcfa from public.wallets where profile_id = drv.pid and kind::text = 'tamcar_revenus') = w_rev)::text || ', écriture ' || cnt
         || case when (j->>'outcome') = 'kept' and w_rachat = 0 and (select balance_fcfa from public.wallets where profile_id = drv.pid and kind::text = 'tamcar_revenus') = w_rev and cnt = 1 then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_driver_fund(drv.did);
  reset role;
  out := out || '5f. historique : ' || jsonb_array_length(j->'settlements') || ' règlements' || case when jsonb_array_length(j->'settlements') = 2 and (j->'settlements'->0->>'outcome') = 'kept' then ' OK' else ' *** KO' end || E'\n';

  -- 6. relevé mensuel : la course du mois apparaît, ni le mois précédent ni un autre compte ne la voient
  select id into ride from public.rides where status = 'completed' and vehicle_id is distinct from drv.vid order by id limit 1;
  if ride is null then raise exception 'Aucune course terminée de modèle'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', dprof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into b0 from public.dealer_my_statement(null) where vehicle_id = drv.vid;
  select * into b2 from public.dealer_my_statement((date_trunc('month', now() at time zone 'Africa/Porto-Novo') - interval '1 month')::date) where vehicle_id = drv.vid;
  reset role;
  update public.rides set vehicle_id = drv.vid, dealer_partner_id = drv.dealer, ended_at = now(), price_total_fcfa = 10000, driver_share_fcfa = 4000, dealer_share_fcfa = 3000, driver_rachat_fcfa = 500, platform_share_fcfa = 2500 where id = ride;
  perform set_config('request.jwt.claims', json_build_object('sub', dprof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into b1 from public.dealer_my_statement(null) where vehicle_id = drv.vid;
  reset role;
  out := out || '6a. relevé du mois : courses ' || b0.rides || ' -> ' || b1.rides || ', part +' || (b1.share_fcfa - b0.share_fcfa)
         || ', solde du fonds +' || (b1.fund_total_fcfa - b0.fund_total_fcfa)
         || case when b1.rides = b0.rides + 1 and b1.share_fcfa = b0.share_fcfa + 3000
                      and b1.fund_total_fcfa = b0.fund_total_fcfa + 500 and b1.active_days >= 1 then ' OK' else ' *** KO' end || E'
';
  perform set_config('request.jwt.claims', json_build_object('sub', dprof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into b1 from public.dealer_my_statement((date_trunc('month', now() at time zone 'Africa/Porto-Novo') - interval '1 month')::date) where vehicle_id = drv.vid;
  reset role;
  out := out || '6b. mois précédent : la course du mois n''y est pas, courses ' || b2.rides || ' -> ' || b1.rides || ', fonds cumulé ' || b2.fund_total_fcfa || ' -> ' || b1.fund_total_fcfa
         || case when b1.fund_total_fcfa = b2.fund_total_fcfa and b1.rides = b2.rides and b1.active_days is not null then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.dealer_my_statement(null);
  select count(*) into n from public.dealer_my_vehicle_sheets(null);
  reset role;
  out := out || '6c. autre compte : ' || cnt || ' ligne de relevé, ' || n || ' fiche' || case when cnt = 0 and n = 0 then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', dprof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.dealer_my_statement_payouts(null);
  select suspension_reason, insurance_company, contract_months into reason, s, m from public.dealer_my_vehicle_sheets(null) where vehicle_id = drv.vid;
  reset role;
  out := out || '6d. fiche vue par le partenaire : assureur ' || coalesce(s, '-') || ', durée ' || m || ' mois, versements du mois ' || cnt
         || case when s = 'NSIA' and m = 7 and reason is null then ' OK' else ' *** KO' end || E'\n';

  -- 7. avis écrit 15 jours avant la fin de la Durée : envoyé une fois, pas avant 15 jours
  update public.vehicles set contract_months = 7 where id = drv.vid;
  update public.drivers set cession_start_on = (today + 10 - interval '7 months')::date where id = drv.did;
  delete from public.cession_notices where driver_id = drv.did;
  select count(*) into n0 from public.admin_alerts where kind = 'cession_end';
  n := public._notify_cession_end();
  select count(*) into cnt from public.cession_notices where driver_id = drv.did and end_date = today + 10;
  select count(*) into n1 from public.admin_alerts where kind = 'cession_end';
  out := out || '7a. fin à 10 jours : ' || n || ' avis, enregistrés ' || cnt || ', alertes ' || n0 || ' -> ' || n1
         || case when n >= 1 and cnt = 1 and n1 = n0 + n then ' OK' else ' *** KO' end || E'\n';
  n := public._notify_cession_end();
  select count(*) into cnt from public.cession_notices where driver_id = drv.did;
  out := out || '7b. second passage : ' || n || ' avis, ' || cnt || ' enregistrement' || case when n = 0 and cnt = 1 then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', dprof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select e.end_on, e.notified_on into got_end, exp_end from public.dealer_my_contract_ends(null) e where e.vehicle_id = drv.vid;
  reset role;
  out := out || '7c. vu par le partenaire : fin le ' || got_end || ', avis du ' || coalesce(exp_end::text, '-')
         || case when got_end = today + 10 and exp_end = today then ' OK' else ' *** KO' end || E'\n';
  delete from public.cession_notices where driver_id = drv.did;
  update public.drivers set cession_start_on = (today + 20 - interval '7 months')::date where id = drv.did;
  n := public._notify_cession_end();
  select count(*) into cnt from public.cession_notices where driver_id = drv.did;
  out := out || '7d. fin à 20 jours : ' || cnt || ' avis' || case when cnt = 0 then ' OK' else ' *** KO' end || E'\n';

  -- 8. fonctions internes inaccessibles aux comptes connectés
  select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) into okb
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_contract_months', '_vehicle_compliance_one', '_vehicle_compliance_sweep', '_notify_cession_end');
  out := out || '8a. fonctions internes ouvertes aux comptes connectés : ' || okb || case when not okb then ' OK' else ' *** KO' end || E'\n';
  select bool_or(has_function_privilege('anon', p.oid, 'execute')) into okb
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('admin_update_vehicle_sheet', 'admin_settle_driver_fund', 'admin_driver_fund', 'dealer_my_statement', 'dealer_my_statement_payouts', 'dealer_my_vehicle_sheets', 'dealer_my_contract_ends');
  out := out || '8b. fonctions publiques ouvertes aux anonymes : ' || okb || case when not okb then ' OK' else ' *** KO' end || E'\n';
  select count(*) into cnt from cron.job where jobname in ('vehicle-compliance', 'cession-end-notices');
  out := out || '8c. tâches planifiées : ' || cnt || case when cnt = 2 then ' OK' else ' *** KO' end || E'\n';

  raise exception 'RESULTATS%', E'\n' || out;
end $$;
