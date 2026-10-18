-- Objectif quotidien « tout compris » (versement + cotisation TamAssur : moto 3 500 F) : le manque se prélève sur l'OBJECTIF, l'épargne de 834 F
-- est créditée chaque jour travaillé ; versement hors application déclaré / annulé par l'administrateur (espèces / Mobile Money) et passé dans
-- TamCar Office. Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/driver_floor_target.sql --workdir backend
do $$
declare
  out text := ''; rc record; r jsonb; adm uuid; n int; v0 int; v1 int; e0 int; e1 int; st text; msg text; ride uuid;
  tue date := date '2026-10-06'; wed date := date '2026-10-07'; thu date := date '2026-10-08'; fri date := date '2026-10-09';
  m_did uuid; m_pid uuid; m_vers int; m_target int; today date := (now() at time zone 'Africa/Porto-Novo')::date; f record; c record;
  pay_tue uuid; pay_today uuid; en_tue text; bal int; n_off int; n_rev int; net7061 bigint; nrev bigint; has_open boolean; k int;
begin
  -- le dimanche il n'y a pas de jour « en cours » à tester (aucun objectif) : les étapes 7 et 10a/10b sont ignorées
  has_open := extract(dow from today) <> 0; k := case when has_open then 2 else 1 end;
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

  -- 3. jour NON atteint, part de 1 000 F : manque prélevé sur l'OBJECTIF = 3 500 - 1 000 = 2 500 F ; la cotisation est payée donc 834 F épargnés
  update public.rides set driver_id = m_did, status = 'completed', ended_at = (tue::timestamp + interval '12 hours') at time zone 'Africa/Porto-Novo',
         price_total_fcfa = 2000, driver_share_fcfa = 1000, platform_share_fcfa = 500, dealer_share_fcfa = 400, driver_rachat_fcfa = 100 where id = ride;
  r := public.charge_driver_floor(tue);
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  select count(*) into n from public.driver_insurance_charges where driver_id = m_did and period = tue and saved_fcfa = 834;
  select status into st from public.driver_floor_log where driver_id = m_did and day = tue;
  out := out || '3. mardi, part de 1 000 F sur 3 500 F : Revenus 10000 -> ' || v1 || ', Épargne ' || e1 || ', lignes d''épargne ' || n || ', journal ' || coalesce(st, '?')
         || case when v1 = 10000 - (m_target - 1000) and e1 = 834 and n = 1 and st = 'charged' then ' OK (manque sur l''objectif, épargne du jour créditée)' else ' *** KO' end || E'\n';

  -- 4. jour entre le versement et l'objectif (part de 3 000 F) : le manque de 500 F est prélevé (sur 3 500 F), épargne créditée
  update public.rides set ended_at = (wed::timestamp + interval '12 hours') at time zone 'Africa/Porto-Novo',
         price_total_fcfa = 5000, driver_share_fcfa = 2000, platform_share_fcfa = 1000, dealer_share_fcfa = 1500, driver_rachat_fcfa = 500 where id = ride;
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  r := public.charge_driver_floor(wed);
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  select status into st from public.driver_floor_log where driver_id = m_did and day = wed;
  select t.part into n from public._floor_day_totals(m_did, wed) t;  -- la course modèle (3 000 F) + d'éventuelles vraies courses du chauffeur ce jour-là
  out := out || '4. mercredi, part de ' || n || ' F sur 3 500 F : Revenus ' || v0 || ' -> ' || v1 || ', Épargne ' || e0 || ' -> ' || e1 || ', journal ' || coalesce(st, '?')
         || case when n >= 3000 and n < 3500 and v1 = v0 - (3500 - n) and e1 = e0 + 834 and st = 'charged' then ' OK (' || (3500 - n) || ' F prélevés, 834 F épargnés)' else ' *** KO' end || E'\n';

  -- 5. jour ATTEINT (part de 12 000 F) : rien prélevé, 834 F épargnés ; le rejeu ne double rien
  update public.rides set ended_at = (thu::timestamp + interval '12 hours') at time zone 'Africa/Porto-Novo',
         price_total_fcfa = 20000, driver_share_fcfa = 8000, platform_share_fcfa = 4000, dealer_share_fcfa = 6000, driver_rachat_fcfa = 2000 where id = ride;
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  r := public.charge_driver_floor(thu);
  r := public.charge_driver_floor(thu);
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  select count(*) into n from public.driver_insurance_charges where driver_id = m_did and period = thu and status = 'paid' and saved_fcfa = 834 and collected_fcfa = 1000;
  select status into st from public.driver_floor_log where driver_id = m_did and day = thu;
  out := out || '5. jeudi, part de 12 000 F : Revenus ' || v0 || ' -> ' || v1 || ', Épargne ' || e0 || ' -> ' || e1 || ', ligne d''épargne (834 F sur 1 000 F) ' || n || ', journal ' || coalesce(st, '?')
         || case when v1 = v0 and e1 = e0 + 834 and n = 1 and st = 'covered' then ' OK (834 F épargnés, une seule fois)' else ' *** KO' end || E'\n';

  -- 6. VERSEMENT HORS APPLICATION sur un jour clôturé : mardi (2 500 F déjà prélevés ; la course modèle a ensuite été déplacée : part 0 F) ;
  --    l'admin enregistre 3 500 F en espèces -> part 3 500 F = objectif atteint : les 2 500 F prélevés sont remboursés, l'épargne reste acquise (pas de doublon)
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_declare_offline_payment(m_did, tue, 3500, 'cash', 'courses hors application');
  reset role;
  pay_tue := (r ->> 'id')::uuid; en_tue := r ->> 'entry_no';
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  select status, offline_fcfa, saved_fcfa, shortfall_fcfa into c from public.driver_floor_log where driver_id = m_did and day = tue;
  out := out || '6. mardi + 3 500 F en espèces : ' || r::text || ' ; Revenus ' || v0 || ' -> ' || v1 || ', Épargne ' || e0 || ' -> ' || e1 || ', journal ' || c.status || ' (hors application ' || c.offline_fcfa || ', épargne ' || c.saved_fcfa || ', manque ' || c.shortfall_fcfa || ')'
         || case when (r ->> 'reached')::boolean and v1 = v0 + (m_target - 1000) and e1 = e0 and c.status = 'covered' and c.offline_fcfa = 3500 and c.saved_fcfa = 834 and c.shortfall_fcfa = 0
                 then ' OK (manque remboursé, épargne inchangée)' else ' *** KO' end || E'\n';
  r := public.charge_driver_floor(tue);
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  out := out || '   rejeu de la clôture : Épargne ' || v0 || case when v0 = e1 then ' OK (pas de doublon)' else ' *** KO' end || E'\n';

  -- 6b. comptabilité TamCar Office : écriture CS, 571 au débit / 7061 au crédit, 3 500 F
  select e.entry_no, e.journal_code, e.source, e.entry_date,
         (select sum(l.debit_fcfa) from public.bo_entry_lines l where l.entry_id = e.id and l.account_code = '571') as d571,
         (select sum(l.credit_fcfa) from public.bo_entry_lines l where l.entry_id = e.id and l.account_code = '7061') as c7061
    into c from public.bo_entries e join public.driver_offline_payments o on o.bo_entry_id = e.id where o.id = pay_tue;
  out := out || '6b. écriture ' || coalesce(c.entry_no, '?') || ' (' || coalesce(c.journal_code, '?') || ', ' || coalesce(c.source, '?') || ') : 571 débit ' || coalesce(c.d571, 0) || ' / 7061 crédit ' || coalesce(c.c7061, 0)
         || case when c.journal_code = 'CS' and c.source = 'offline_payment' and c.d571 = 3500 and c.c7061 = 3500 and c.entry_no = en_tue and c.entry_date = today then ' OK' else ' *** KO' end || E'\n';

  -- 7. versement hors application (Mobile Money MTN) sur le jour EN COURS : la jauge se met à jour tout de suite, l'épargne est créditée tout de suite
  if has_open then
  select balance_fcfa into e0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r := public.admin_declare_offline_payment(m_did, today, 3500, 'mobile_money', null, 'mtn');
    reset role;
    pay_today := (r ->> 'id')::uuid;
    perform set_config('request.jwt.claims', json_build_object('sub', m_pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into f from public.driver_floor_today(m_did);
    reset role;
    select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
    select count(*) into n from public.driver_floor_log where driver_id = m_did and day = today;
    out := out || '7. aujourd''hui + 3 500 F Mobile Money MTN : jauge part ' || f.tamcar_part_fcfa || ' F, hors application ' || f.offline_fcfa || ' F, atteint=' || f.reached || ', Épargne ' || e0 || ' -> ' || e1
           || ', journal de clôture créé=' || n
           || case when f.reached and f.offline_fcfa = 3500 and e1 = e0 + 834 and n = 0 then ' OK (pas de prélèvement avant minuit)' else ' *** KO' end || E'\n';
    select (select sum(l.debit_fcfa) from public.bo_entry_lines l where l.entry_id = e.id and l.account_code = '5311') as d5311, e.journal_code into c
      from public.bo_entries e join public.driver_offline_payments o on o.bo_entry_id = e.id where o.id = pay_today;
    out := out || '7b. écriture Mobile Money : ' || coalesce(c.journal_code, '?') || ', 5311 débit ' || coalesce(c.d5311, 0) || case when c.journal_code = 'MM' and c.d5311 = 3500 then ' OK' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || '7. ECHEC : ' || sqlerrm || E'\n'; end;
  else out := out || E'7. (dimanche : étape ignorée)\n';
  end if;

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
  begin perform public.admin_declare_offline_payment(m_did, today, 1000, 'mobile_money', null); msg := 'accepté *** KO'; exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '8e. Mobile Money sans opérateur : ' || msg || E'\n';
  select count(*) into n from public.admin_driver_offline_payments(m_did);
  out := out || '8f. liste admin des versements : ' || n || case when n = k then ' OK' else ' *** KO' end || E'\n';
  reset role;

  -- 9. permissions : le chauffeur ne peut ni déclarer, ni annuler, ni lister, ni écrire dans la table
  perform set_config('request.jwt.claims', json_build_object('sub', m_pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_declare_offline_payment(m_did, today, 1000, 'cash', null); msg := 'accepté *** KO'; exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '9a. chauffeur déclare un versement : ' || msg || E'\n';
  begin perform public.admin_cancel_offline_payment(pay_today, 'tentative'); msg := 'accepté *** KO'; exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '9b. chauffeur annule un versement : ' || msg || E'\n';
  select count(*) into n from public.admin_driver_offline_payments(m_did);
  out := out || '9c. chauffeur lit la liste admin : ' || n || case when n = 0 then ' OK' else ' *** KO' end || E'\n';
  begin insert into public.driver_offline_payments (driver_id, day, amount_fcfa, method) values (m_did, today, 1000, 'cash'); msg := 'écriture directe acceptée *** KO'; exception when others then msg := 'refusée OK'; end;
  out := out || '9d. écriture directe dans la table : ' || msg || E'\n';
  select count(*) into n from public.driver_offline_payments where driver_id = m_did;
  out := out || '9e. le chauffeur voit ses propres versements : ' || n || case when n = k then ' OK' else ' *** KO' end || E'\n';
  reset role;

  -- 10. ANNULATION du versement d'aujourd'hui : la jauge retombe, le versement reste listé (annulé), l'écriture est extournée, l'épargne déjà créditée reste acquise
  if has_open then
  select balance_fcfa into e0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_cancel_offline_payment(pay_today, 'saisi par erreur');
  begin perform public.admin_cancel_offline_payment(pay_today, 'deuxième fois'); msg := 'accepté *** KO'; exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m_pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into f from public.driver_floor_today(m_did);
  reset role;
  select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  select o.cancelled_at is not null as is_cancelled, o.cancel_reason, (select e.reversed_by is not null from public.bo_entries e where e.id = o.bo_entry_id) as entry_reversed,
         (select sum(l.credit_fcfa) from public.bo_entry_lines l where l.entry_id = o.bo_reversal_id and l.account_code = '5311') as rev5311
    into c from public.driver_offline_payments o where o.id = pay_today;
  out := out || '10a. annulation d''aujourd''hui : ' || r::text || ' ; jauge part ' || f.tamcar_part_fcfa || ' F, hors application ' || f.offline_fcfa || ' F, atteint=' || f.reached
         || ' ; annulé=' || c.is_cancelled || ' (' || coalesce(c.cancel_reason, '') || '), écriture extournée=' || coalesce(c.entry_reversed::text, '?') || ', extourne 5311 crédit ' || coalesce(c.rev5311, 0) || ', Épargne ' || e0 || ' -> ' || e1
         || case when f.tamcar_part_fcfa = 0 and f.offline_fcfa = 0 and not f.reached and c.is_cancelled and c.entry_reversed and c.rev5311 = 3500 and e1 = e0 then ' OK' else ' *** KO' end || E'\n';
  out := out || '10b. annuler deux fois : ' || msg || E'\n';
  else out := out || E'10a. (dimanche : étape ignorée)\n';
  end if;

  -- 10c. ANNULATION du versement de mardi (jour clôturé) : la part retombe à 0 F, le manque de 3 500 F est de nouveau prélevé, l'épargne reste acquise
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_cancel_offline_payment(pay_tue, 'espèces jamais reçues');
  select count(*) into n from public.admin_driver_offline_payments(m_did) where cancelled_at is not null;
  reset role;
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select balance_fcfa into e1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_epargne';
  select status, offline_fcfa, shortfall_fcfa, saved_fcfa into c from public.driver_floor_log where driver_id = m_did and day = tue;
  out := out || '10c. annulation de mardi : ' || r::text || ' ; Revenus ' || v0 || ' -> ' || v1 || ', Épargne ' || e0 || ' -> ' || e1 || ', journal ' || c.status || ' (manque ' || c.shortfall_fcfa || ', hors application ' || c.offline_fcfa || ', épargne ' || c.saved_fcfa || '), annulés listés ' || n
         || case when v1 = v0 - m_target and e1 = e0 and c.status = 'charged' and c.shortfall_fcfa = m_target and c.offline_fcfa = 0 and c.saved_fcfa = 834 and n = k and (r ->> 'extra_debited_fcfa')::int = m_target
                 then ' OK (manque prélevé de nouveau)' else ' *** KO' end || E'\n';

  -- 10d. TamCar Office : les deux encaissements sont extournés (solde net 0 sur 7061 et sur les comptes de trésorerie)
  select coalesce(sum(l.credit_fcfa - l.debit_fcfa), 0), count(distinct e.id) into net7061, n_off
    from public.bo_entries e join public.bo_entry_lines l on l.entry_id = e.id
   where l.account_code = '7061' and (e.id in (select bo_entry_id from public.driver_offline_payments where driver_id = m_did)
                                     or e.reverses in (select bo_entry_id from public.driver_offline_payments where driver_id = m_did));
  select count(*) into n_rev from public.bo_entries e where e.source = 'reversal' and e.reverses in (select bo_entry_id from public.driver_offline_payments where driver_id = m_did);
  out := out || '10d. TamCar Office : écritures ' || n_off || ' (dont ' || n_rev || ' extournes), solde net 7061 ' || net7061
         || case when net7061 = 0 and n_off = 2 * k and n_rev = k then ' OK' else ' *** KO' end || E'\n';

  -- 11. le prélèvement de 22 h ne touche plus un chauffeur Cession une fois l'objectif démarré
  delete from public.driver_insurance_charges where driver_id = m_did and period = fri;
  r := public.charge_driver_insurance(fri);
  select count(*) into n from public.driver_insurance_charges where driver_id = m_did and period = fri;
  out := out || '11. prélèvement de 22 h le vendredi : lignes pour le chauffeur Cession=' || n || case when n = 0 then ' OK (cotisation comprise dans l''objectif)' else ' *** KO' end || E'\n';
  update public._push_settings set value = '2027-01-01' where key = 'floor_debit_from';
  r := public.charge_driver_insurance(fri);
  select count(*) into n from public.driver_insurance_charges where driver_id = m_did and period = fri;
  out := out || '    avant le démarrage de l''objectif : lignes=' || n || case when n = 1 then ' OK (ancien prélèvement séparé)' else ' *** KO' end || E'\n';

  raise exception E'RESULTATS\n%', out;
end $$;
