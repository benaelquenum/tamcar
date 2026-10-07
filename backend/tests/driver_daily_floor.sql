-- Versement quotidien (formule Cession) : part de TamCar du jour, prélèvement du manque, jours non travaillés, prolongation du contrat.
-- Rôles réels, rien n'est conservé (la transaction finit par une exception).
-- Usage : supabase db query --linked -f backend/tests/driver_daily_floor.sql --workdir backend
do $$
declare
  out text := ''; rc record; r jsonb; adm uuid; n int; v0 int; v1 int; exp_short int; due int; part int; vol int; st text; msg text;
  tue date := date '2026-10-06'; wed date := date '2026-10-07'; thu date := date '2026-10-08';
  fri date := date '2026-10-09'; sat date := date '2026-10-10'; sun date := date '2026-10-04';
  m_did uuid; m_pid uuid; m_cat text; ride uuid; c jsonb; t_did uuid; t_pid uuid; t_cat text; id_sat uuid; id_tue uuid;
begin
  update public._push_settings set value = '2020-01-01' where key = 'floor_debit_from';
  update public._push_settings set value = '2020-01-01' where key = 'tamassur_debit_from';
  select id into adm from public.profiles where role::text = 'admin' limit 1;

  -- 0. un chauffeur Cession par catégorie : portefeuille à 10 000 F, aucun reste d'un test précédent
  for rc in
    select distinct on (v.category) v.category::text as cat, d.id as did, d.profile_id as pid
      from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.application_type::text = 'cession' order by v.category, d.id
  loop
    insert into public.wallets (profile_id, kind, balance_fcfa) values (rc.pid, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
    update public.wallets set balance_fcfa = 10000 where profile_id = rc.pid and kind::text = 'tamcar_revenus';
    delete from public.driver_floor_log where driver_id = rc.did;
    delete from public.driver_excused_days where driver_id = rc.did;
    if m_did is null then m_did := rc.did; m_pid := rc.pid; m_cat := rc.cat; end if;
  end loop;
  if m_did is null then raise exception 'Aucun chauffeur Cession actif pour tester'; end if;

  -- 1. le mardi : chaque chauffeur est débité de max(0, versement - part de TamCar du jour)
  r := public.charge_driver_floor(tue);
  out := out || '1. mardi : ' || r::text || E'\n';
  for rc in
    select distinct on (v.category) v.category::text as cat, d.id as did, d.profile_id as pid
      from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.application_type::text = 'cession' order by v.category, d.id
  loop
    due := public._vehicle_versement(rc.cat);
    select t.volume, t.part into vol, part from public._floor_day_totals(rc.did, tue) t;
    exp_short := greatest(0, due - part);
    select balance_fcfa into v1 from public.wallets where profile_id = rc.pid and kind::text = 'tamcar_revenus';
    select count(*) into n from public.driver_floor_log where driver_id = rc.did and day = tue
       and status = case when exp_short = 0 then 'covered' else 'charged' end and shortfall_fcfa = exp_short;
    out := out || '   ' || rc.cat || ' : versement ' || due || ', part du jour ' || part || ', manque attendu ' || exp_short || ', Revenus 10000 -> ' || v1
           || case when v1 = 10000 - exp_short and n = 1 then ' OK' else ' *** KO' end || E'\n';
  end loop;

  -- 2. rejeu : aucun second prélèvement
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  r := public.charge_driver_floor(tue);
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select count(*) into n from public.driver_floor_log where driver_id = m_did and day = tue;
  out := out || '2. rejeu du mardi : solde ' || v0 || ' -> ' || v1 || ', lignes de journal=' || n || case when v0 = v1 and n = 1 then ' OK' else ' *** KO' end || E'\n';

  -- 3. dimanche : rien
  r := public.charge_driver_floor(sun);
  out := out || '3. dimanche : ' || r::text || case when r ->> 'skipped' = 'sunday' then ' OK' else ' *** KO' end || E'\n';

  -- 4. avant la date de démarrage : rien
  update public._push_settings set value = '2027-01-01' where key = 'floor_debit_from';
  r := public.charge_driver_floor(wed);
  out := out || '4. avant le démarrage : ' || r::text || case when r ->> 'skipped' = 'not_started' then ' OK' else ' *** KO' end || E'\n';
  update public._push_settings set value = '2020-01-01' where key = 'floor_debit_from';

  -- 5. la part de TamCar continue de compter au-delà du versement : course de 20 000 F dont 8 000 F au chauffeur = 12 000 F pour TamCar
  select id into ride from public.rides where status = 'completed' limit 1;
  if ride is null then
    out := out || '5. (aucune course terminée en base : test sauté)' || E'\n';
  else
    update public.rides set driver_id = m_did, ended_at = (wed::timestamp + interval '12 hours') at time zone 'Africa/Porto-Novo',
           price_total_fcfa = 20000, driver_share_fcfa = 8000, platform_share_fcfa = 4000, dealer_share_fcfa = 6000, driver_rachat_fcfa = 2000 where id = ride;
    select t.volume, t.part into vol, part from public._floor_day_totals(m_did, wed) t;
    out := out || '5a. course de 20 000 F (chauffeur 8 000 F) : volume=' || vol || ', part de TamCar=' || part
           || case when vol = 20000 and part = 12000 then ' OK (12 000 F, au-delà du versement)' else ' *** KO' end || E'\n';
    select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
    r := public.charge_driver_floor(wed);
    select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
    select status into st from public.driver_floor_log where driver_id = m_did and day = wed;
    out := out || '5b. mercredi : statut=' || coalesce(st, '?') || ', solde ' || v0 || ' -> ' || v1
           || case when st = 'covered' and v0 = v1 then ' OK (rien à payer)' else ' *** KO' end || E'\n';

    -- partie 5c : part de 3 000 F seulement
    update public.rides set ended_at = (thu::timestamp + interval '12 hours') at time zone 'Africa/Porto-Novo',
           price_total_fcfa = 5000, driver_share_fcfa = 2000, platform_share_fcfa = 1000, dealer_share_fcfa = 1500, driver_rachat_fcfa = 500 where id = ride;
    due := public._vehicle_versement(m_cat);
    exp_short := greatest(0, due - 3000);
    select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
    r := public.charge_driver_floor(thu);
    select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
    out := out || '5c. jeudi, part de 3 000 F sur ' || due || ' F (' || m_cat || ') : solde ' || v0 || ' -> ' || v1
           || case when v0 - v1 = exp_short then ' OK (manque ' || exp_short || ' F)' else ' *** KO' end || E'\n';
  end if;

  -- 6. jours non travaillés (admin) : vendredi et samedi, rien n'est prélevé, ni versement ni TamAssur
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_excuse_driver_days(m_did, fri, sat, 'panne', 'test');
  reset role;
  out := out || '6a. déclaration vendredi-samedi : ' || r::text || case when (r ->> 'added')::int = 2 then ' OK' else ' *** KO' end || E'\n';
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  r := public.charge_driver_floor(fri);
  perform public.charge_driver_insurance(fri);
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select status into st from public.driver_floor_log where driver_id = m_did and day = fri;
  select count(*) into n from public.driver_insurance_charges where driver_id = m_did and period = fri;
  out := out || '6b. vendredi non travaillé : journal=' || coalesce(st, '?') || ', solde ' || v0 || ' -> ' || v1 || ', cotisation TamAssur prélevée=' || n
         || case when st = 'excused' and v0 = v1 and n = 0 then ' OK' else ' *** KO' end || E'\n';

  -- 7. un jour déjà prélevé est remboursé quand l'admin le déclare non travaillé
  select balance_fcfa into v0 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select shortfall_fcfa into exp_short from public.driver_floor_log where driver_id = m_did and day = tue;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_excuse_driver_days(m_did, tue, tue, 'maladie', null);
  reset role;
  select balance_fcfa into v1 from public.wallets where profile_id = m_pid and kind::text = 'tamcar_revenus';
  select status into st from public.driver_floor_log where driver_id = m_did and day = tue;
  select count(*) into n from public.wallet_transactions t join public.wallets w on w.id = t.wallet_id
   where w.profile_id = m_pid and t.type::text = 'floor_refund';
  out := out || '7. mardi déclaré non travaillé : ' || r::text || ', solde ' || v0 || ' -> ' || v1 || ', journal=' || st || ', transactions de remboursement=' || n
         || case when (r ->> 'refunded_fcfa')::int = exp_short and v1 = v0 + exp_short and st = 'refunded' then ' OK' else ' *** KO' end || E'\n';

  -- 8. retrait d'un jour : impossible s'il est clôturé, possible sinon
  select id into id_tue from public.driver_excused_days where driver_id = m_did and day = tue;
  select id into id_sat from public.driver_excused_days where driver_id = m_did and day = sat;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_remove_excused_day(id_tue); msg := 'retrait accepté *** KO';
  exception when others then msg := 'refusé : ' || sqlerrm || ' OK'; end;
  out := out || '8a. retrait du mardi (clôturé) : ' || msg || E'\n';
  begin perform public.admin_remove_excused_day(id_sat); msg := 'retrait accepté OK';
  exception when others then msg := 'refusé : ' || sqlerrm || ' *** KO'; end;
  out := out || '8b. retrait du samedi (pas clôturé) : ' || msg || E'\n';

  -- 9. prolongation du contrat : début + durée + jours non travaillés (mardi, vendredi = 2)
  perform public.admin_set_cession_start(m_did, date '2027-01-01');
  c := public.admin_driver_contract(m_did);
  reset role;
  out := out || '9. contrat : ' || c::text || E'\n';
  out := out || '   fin attendue = 2027-01-01 + ' || (c ->> 'months') || ' mois + 2 jours = '
         || ((date '2027-01-01' + make_interval(months => (c ->> 'months')::int) + make_interval(days => 2))::date)::text
         || case when (c ->> 'extension_days')::int = 2
                  and (c ->> 'end_on')::date = (date '2027-01-01' + make_interval(months => (c ->> 'months')::int) + make_interval(days => 2))::date
                 then ' OK' else ' *** KO' end || E'\n';

  -- 10. permissions (avec un chauffeur qui n'est PAS admin) : il ne peut ni déclarer un jour, ni lancer la clôture, ni voir la jauge d'un autre
  select d.id, d.profile_id into t_did, t_pid from public.drivers d join public.profiles p on p.id = d.profile_id
   where d.status = 'active' and p.role::text <> 'admin' and d.application_type::text = 'cession' limit 1;
  if t_did is null then
    out := out || '10. (aucun chauffeur non-admin : test de permissions sauté)' || E'
';
  else
    select d.id into m_did from public.drivers d where d.id <> t_did and d.status = 'active' limit 1;
    perform set_config('request.jwt.claims', json_build_object('sub', t_pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform public.admin_excuse_driver_days(t_did, fri, fri, 'panne', null); msg := 'accepté *** KO';
    exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
    out := out || '10a. chauffeur déclare un jour : ' || msg || E'
';
    begin perform public.charge_driver_floor(tue); msg := 'accepté *** KO';
    exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
    out := out || '10b. chauffeur lance la clôture : ' || msg || E'
';
    begin perform public.admin_driver_contract(t_did); msg := 'accepté *** KO';
    exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
    out := out || '10c. chauffeur lit la fiche contrat admin : ' || msg || E'
';
    select count(*) into n from public.driver_floor_today(t_did);
    out := out || '10d. chauffeur lit sa propre jauge : lignes=' || n || case when n = 1 then ' OK' else ' *** KO' end || E'
';
    begin perform * from public.driver_floor_today(m_did); msg := 'accepté *** KO';
    exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
    out := out || '10e. chauffeur lit la jauge d''un autre : ' || msg || E'
';
    select count(*) into n from public.driver_floor_log where driver_id <> t_did;
    out := out || '10f. chauffeur voit les journaux des autres : ' || n || case when n = 0 then ' OK' else ' *** KO' end || E'
';
    select count(*) into n from public.driver_excused_days where driver_id <> t_did;
    out := out || '10g. chauffeur voit les jours non travaillés des autres : ' || n || case when n = 0 then ' OK' else ' *** KO' end || E'
';
    reset role;
  end if;

  -- 11. un propriétaire n'est jamais prélevé
  select count(*) into n from public.driver_floor_log l join public.drivers d on d.id = l.driver_id where d.application_type::text <> 'cession';
  out := out || '11. lignes de journal pour des propriétaires : ' || n || case when n = 0 then ' OK' else ' *** KO' end || E'\n';

  -- 12. la tâche de minuit existe
  select count(*) into n from cron.job where command ilike '%charge_driver_floor%' and active;
  out := out || '12. tâche planifiée active : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  for rc in select jobname, schedule from cron.job where command ilike '%charge_driver_floor%' loop
    out := out || '    ' || rc.jobname || ' : ' || rc.schedule || E'\n';
  end loop;

  raise exception E'RESULTATS\n%', out;
end $$;
