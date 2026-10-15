-- Objectif quotidien « tout compris » (versement + cotisation TamAssur : moto 3 500 F) et épargne GAGNÉE chaque jour d'objectif atteint ;
-- versement hors application déclaré par l'administrateur (espèces / Mobile Money). Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/driver_floor_target.sql --workdir backend
do $$
declare
  out text := ''; rc record; r jsonb; adm uuid; n int; v0 int; v1 int; e0 int; e1 int; st text; msg text; ride uuid;
  tue date := date '2026-10-06'; wed date := date '2026-10-07'; thu date := date '2026-10-08'; fri date := date '2026-10-09'; sat date := date '2026-10-10';
  m_did uuid; m_pid uuid; m_vers int; m_target int; today date := (now() at time zone 'Africa/Porto-Novo')::date; f record; c record;
begin
  update public._push_settings set value = '2020-01-01' where key = 'floor_debit_from';
  update public._push_settings set value = '2020-01-01' where key = 'tamassur_debit_from';
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select id into ride from public.rides where status = 'completed' limit 1;

  -- 1. objectifs tout compris par véhicule : versement + 1 000 F
  for rc in
    select distinct on (v.category) v.category::text as cat, d.id as did, d.profile_id as pid
      from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.application_type::text = 'cession' and d.tamassur_fcfa is null order by v.category, d.id
  loop
    out := out || '1. ' || rc.cat || ' : versement ' || public._vehicle_versement(rc.cat) || ' F + cotisation ' || public._tamassur_amount(rc.did) || ' F = objectif '
           || public._floor_target(rc.did) || ' F'
           || case when public._floor_target(rc.did) = public._vehicle_versement(rc.cat) + 1000
                    and (rc.cat <> 'moto' or public._floor_target(rc.did) = 3500) then ' OK' else ' *** KO' end || E'\n';
    insert into public.wallets (profile_id, kind, balance_fcfa) values (rc.pid, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
    insert into public.wallets (profile_id, kind, balance_fcfa) values (rc.pid, 'tamcar_epargne', 0) on conflict (profile_id, kind) do nothing;
    delete from public.driver_floor_log where driver_id = rc.did;
    delete from public.driver_excused_days where driver_id = rc.did;
    delete from public.driver_insurance_charges where driver_id = rc.did;
    delete from public.driver_offline_payments where driver_id = rc.did;
    update public.wallets set balance_fcfa = 10000 where profile_id = rc.pid and kind::text = 'tamcar_revenus';
    update public.wallets set balance_fcfa = 0 where profile_id = rc.pid and kind::text = 'tamcar_epargne';
    if rc.cat = 'moto' then m_did := rc.did; m_pid := rc.pid; end if;
  end loop;
  if m_did is null then raise exception 'Aucun chauffeur moto Cession actif pour tester'; end if;
  m_vers := public._vehicle_versement('moto'); m_target := public._floor_target(m_did);
  if ride is null then raise exception 'Aucune course terminée en base pour servir de modèle'; end if;

  -- 2. jauge du chauffeur (aujourd'hui, sans course) : objectif 3 500 F, épargne de 834 F à gagner
  perform set_config('request.jwt.claims', json_build_object('sub', m_pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into f from public.driver_floor_today(m_did);
  reset role;
  out := out || '2. jauge : objectif ' || f.versement_fcfa || ' F, part ' || f.tamcar_part_fcfa || ' F, reste ' || f.remaining_fcfa || ' F, cotisation ' || f.cotisation_fcfa
         || ' F, épargne à gagner ' || f.savings_fcfa || ' F, atteint=' || f.reached
         || case when f.versement_fcfa = 3500 and f.cotisation_fcfa = 1000 and f.savings_fcfa = 834 and not f.reached then ' OK' else ' *** KO' end || E'\n';

  -- 3. jour NON atteint, part de 1 000 F : manque de versement = 2 500 - 1 000 = 1 500 F prélevé, aucune cotisation, aucune épargne
  update public.rides set driver_id = m_did, status = 'completed', ended_at = (tue::timestamp + interval '12 hours') at time zone 'Africa/Porto-Novo',
         price_total_fcfa = 2000, driver_share_fcfa = 1000, platform_share_fcfa = 500, dealer_share_fcfa = 400, driver_rachat_fcfa = 100 where id = ride;
  r := public.charge_driver_floor(tue);
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  select count(*) into n from public.driver_insurance_charges where driver_id = m_did and period = tue;
  select status into st from public.driver_floor_log where driver_id = m_did and day = tue;
  out := out || '3. mardi, part de 1 000 F sur 3 500 F : Revenus 10000 -> ' || v1 || ', Épargne ' || e1 || ', lignes de cotisation ' || n || ', journal ' || coalesce(st, '?')
         || case when v1 = 10000 - (m_vers - 1000) and e1 = 0 and n = 0 and st = 'charged' then ' OK (manque du versement seul, pas d''épargne)' else ' *** KO' end || E'\n';

  -- 4. jour entre le versement et l'objectif (part de 3 000 F) : rien prélevé, mais pas d'épargne non plus
  update public.rides set ended_at = (wed::timestamp + interval '12 hours') at time zone 'Africa/Porto-Novo',
         price_total_fcfa = 5000, driver_share_fcfa = 2000, platform_share_fcfa = 1000, dealer_share_fcfa = 1500, driver_rachat_fcfa = 500 where id = ride;
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  r := public.charge_driver_floor(wed);
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  select status into st from public.driver_floor_log where driver_id = m_did and day = wed;
  out := out || '4. mercredi, part de 3 000 F (versement couvert, objectif 3 500 F non atteint) : Revenus ' || v0 || ' -> ' || v1 || ', Épargne ' || e1 || ', journal ' || coalesce(st, '?')
         || case when v1 = v0 and e1 = 0 and st = 'covered' then ' OK' else ' *** KO' end || E'\n';

  -- 5. jour ATTEINT (part de 12 000 F) : rien prélevé, 834 F épargnés ; le rejeu ne double rien
  update public.rides set ended_at = (thu::timestamp + interval '12 hours') at time zone 'Africa/Porto-Novo',
         price_total_fcfa = 20000, driver_share_fcfa = 8000, platform_share_fcfa = 4000, dealer_share_fcfa = 6000, driver_rachat_fcfa = 2000 where id = ride;
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  r := public.charge_driver_floor(thu);
  r := public.charge_driver_floor(thu);
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  select count(*) into n from public.driver_insurance_charges where driver_id = m_did and period = thu and status = 'paid' and saved_fcfa = 834 and collected_fcfa = 1000;
  select status into st from public.driver_floor_log where driver_id = m_did and day = thu;
  out := out || '5. jeudi, part de 12 000 F : Revenus ' || v0 || ' -> ' || v1 || ', Épargne ' || e1 || ', ligne de cotisation (834 F sur 1 000 F) ' || n || ', journal ' || coalesce(st, '?')
         || case when v1 = v0 and e1 = 834 and n = 1 and st = 'covered' then ' OK (la jauge d''épargne avance de 834 F, une seule fois)' else ' *** KO' end || E'\n';

  -- 6. VERSEMENT HORS APPLICATION sur un jour clôturé : mardi (manque de 1 500 F déjà prélevé, la course modèle a ensuite été déplacée : part 0 F) ;
  --    l'admin enregistre 3 500 F en espèces -> part 3 500 F = objectif atteint
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_declare_offline_payment(m_did, tue, 3500, 'cash', 'courses hors application');
  reset role;
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  select status, offline_fcfa, saved_fcfa into c from public.driver_floor_log where driver_id = m_did and day = tue;
  out := out || '6. mardi + 3 500 F en espèces : ' || r::text || ' ; Revenus ' || v0 || ' -> ' || v1 || ', Épargne ' || e0 || ' -> ' || e1 || ', journal ' || c.status || ' (hors application ' || c.offline_fcfa || ', épargne ' || c.saved_fcfa || ')'
         || case when (r ->> 'reached')::boolean and v1 = v0 + (m_vers - 1000) and e1 = e0 + 834 and c.status = 'covered' and c.offline_fcfa = 3500 and c.saved_fcfa = 834
                 then ' OK (manque remboursé, objectif atteint, épargne créditée)' else ' *** KO' end || E'\n';
  r := public.charge_driver_floor(tue);
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  out := out || '   rejeu de la clôture : Épargne ' || v0 || case when v0 = e1 then ' OK (pas de doublon)' else ' *** KO' end || E'\n';

  -- 7. versement hors application sur le jour EN COURS (aujourd'hui) : la jauge du chauffeur se met à jour tout de suite, l'épargne est créditée tout de suite
  select balance_fcfa into e0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r := public.admin_declare_offline_payment(m_did, today, 3500, 'mobile_money', null);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', m_pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into f from public.driver_floor_today(m_did);
    reset role;
    select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
    select count(*) into n from public.driver_floor_log where driver_id = m_did and day = today;
    out := out || '7. aujourd''hui + 3 500 F Mobile Money : jauge part ' || f.tamcar_part_fcfa || ' F, hors application ' || f.offline_fcfa || ' F, atteint=' || f.reached || ', Épargne ' || e0 || ' -> ' || e1
           || ', journal de clôture créé=' || n
           || case when f.reached and f.offline_fcfa = 3500 and e1 = e0 + 834 and n = 0 then ' OK (pas de prélèvement avant minuit)' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || '7. ECHEC : ' || sqlerrm || E'\n'; end;

  -- 8. garde-fous de la déclaration
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_declare_offline_payment(m_did, today + 1, 1000, 'cash', null); msg := 'accepté *** KO'; exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '8a. jour futur : ' || msg || E'\n';
  begin perform public.admin_declare_offline_payment(m_did, date '2026-10-04', 1000, 'cash', null); msg := 'accepté *** KO'; exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '8b. dimanche : ' || msg || E'\n';
  begin perform public.admin_declare_offline_payment(m_did, today, 1000, 'virement', null); msg := 'accepté *** KO'; exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '8c. moyen invalide : ' || msg || E'\n';
  begin perform public.admin_declare_offline_payment(m_did, today, 0, 'cash', null); msg := 'accepté *** KO'; exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '8d. montant nul : ' || msg || E'\n';
  select count(*) into n from public.admin_driver_offline_payments(m_did);
  out := out || '8e. liste admin des versements : ' || n || case when n = 2 then ' OK' else ' *** KO' end || E'\n';
  reset role;

  -- 9. permissions : le chauffeur ne peut ni déclarer, ni lister, ni écrire dans la table
  perform set_config('request.jwt.claims', json_build_object('sub', m_pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_declare_offline_payment(m_did, today, 1000, 'cash', null); msg := 'accepté *** KO'; exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '9a. chauffeur déclare un versement : ' || msg || E'\n';
  select count(*) into n from public.admin_driver_offline_payments(m_did);
  out := out || '9b. chauffeur lit la liste admin : ' || n || case when n = 0 then ' OK' else ' *** KO' end || E'\n';
  begin insert into public.driver_offline_payments (driver_id, day, amount_fcfa, method) values (m_did, today, 1000, 'cash'); msg := 'écriture directe acceptée *** KO'; exception when others then msg := 'refusée OK'; end;
  out := out || '9c. écriture directe dans la table : ' || msg || E'\n';
  select count(*) into n from public.driver_offline_payments where driver_id = m_did;
  out := out || '9d. le chauffeur voit ses propres versements : ' || n || case when n = 2 then ' OK' else ' *** KO' end || E'\n';
  reset role;

  -- 10. le prélèvement de 22 h ne touche plus un chauffeur Cession une fois l'objectif démarré
  delete from public.driver_insurance_charges where driver_id = m_did and period = fri;
  r := public.charge_driver_insurance(fri);
  select count(*) into n from public.driver_insurance_charges where driver_id = m_did and period = fri;
  out := out || '10. prélèvement de 22 h le vendredi : lignes pour le chauffeur Cession=' || n || case when n = 0 then ' OK (cotisation comprise dans l''objectif)' else ' *** KO' end || E'\n';
  update public._push_settings set value = '2027-01-01' where key = 'floor_debit_from';
  r := public.charge_driver_insurance(fri);
  select count(*) into n from public.driver_insurance_charges where driver_id = m_did and period = fri;
  out := out || '    avant le démarrage de l''objectif : lignes=' || n || case when n = 1 then ' OK (ancien prélèvement séparé)' else ' *** KO' end || E'\n';

  raise exception E'RESULTATS\n%', out;
end $$;
