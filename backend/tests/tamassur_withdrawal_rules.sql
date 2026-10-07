-- Retrait de l'épargne TamAssur : durée propre au véhicule (moto 12 mois, tricycle et voitures 24 mois) + compte à jour, décompte du retard (dimanches exclus),
-- seuil d'épargne (600 x cotisation : moto 300 000 F), demande -> alerte admin (aucun virement), 60 jours, paiement par l'admin,
-- permissions. Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/tamassur_withdrawal_rules.sql --workdir backend
do $$
declare
  d_id uuid; d_prof uuid; adm uuid; w_ep uuid; w_rev uuid;
  out text := ''; st record; rec public.tamassur_withdrawals; n int; v int; exp_late int; msg text; badge jsonb; v_goal int; v_months int; rc record;
begin
  select dr.id, dr.profile_id into d_id, d_prof from public.drivers dr where dr.status = 'active' limit 1;
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  v_months := public._tamassur_months(d_id);

  insert into public.wallets (profile_id, kind, balance_fcfa) values (d_prof, 'tamcar_epargne', 0) on conflict (profile_id, kind) do nothing;
  insert into public.wallets (profile_id, kind, balance_fcfa) values (d_prof, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
  select id into w_ep from public.wallets where profile_id = d_prof and kind::text = 'tamcar_epargne';
  select id into w_rev from public.wallets where profile_id = d_prof and kind::text = 'tamcar_revenus';
  delete from public.tamassur_withdrawals where driver_id = d_id;
  delete from public.driver_insurance_charges where driver_id = d_id;
  update public.wallets set balance_fcfa = 50000 where id = w_ep;
  update public.wallets set balance_fcfa = 0 where id = w_rev;

  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);

  -- 1. aucun prélèvement encore : le décompte de 2 ans n'a pas démarré
  set local role authenticated;
  select * into st from public.my_tamassur_withdrawal_status();
  out := out || '1a. sans prélèvement : reason=' || st.reason || ' can_withdraw=' || st.can_withdraw || case when st.reason = 'not_started' then ' OK' else ' *** KO' end || E'\n';
  begin perform public.request_tamassur_withdrawal(null); out := out || '1b. demande acceptée *** KO' || E'\n';
  exception when others then out := out || '1b. demande refusée : ' || sqlerrm || E'\n'; end;
  reset role;

  -- 2. premier prélèvement il y a 400 jours : trop tôt
  insert into public.driver_insurance_charges (driver_id, period, amount_fcfa, collected_fcfa, status, collected_at)
  values (d_id, (current_date - make_interval(months => v_months) + interval '30 days')::date, 1000, 1000, 'paid', now());
  set local role authenticated;
  select * into st from public.my_tamassur_withdrawal_status();
  out := out || '2a. échéance dans 30 jours (' || v_months || ' mois) : reason=' || st.reason || ' éligible le ' || st.eligible_on || case when st.reason = 'too_early' and st.eligible_on = (current_date + interval '30 days')::date then ' OK' else ' *** KO' end || E'\n';
  begin perform public.request_tamassur_withdrawal(null); out := out || '2b. demande acceptée *** KO' || E'\n';
  exception when others then out := out || '2b. demande refusée : ' || sqlerrm || E'\n'; end;
  reset role;

  -- 3. démarrage il y a plus de 2 ans, mais dette de 1 500 F depuis 10 jours : à rattraper d'abord
  delete from public.driver_insurance_charges where driver_id = d_id;
  insert into public.driver_insurance_charges (driver_id, period, amount_fcfa, collected_fcfa, status, collected_at)
  values (d_id, (current_date - make_interval(months => v_months) - interval '5 days')::date, 1000, 1000, 'paid', now());
  -- 3-. 2 ans écoulés mais épargne (50 000 F) sous le seuil : refus
  v_goal := public._tamassur_goal(d_id);
  set local role authenticated;
  select * into st from public.my_tamassur_withdrawal_status();
  out := out || '3-a. épargne ' || st.epargne_fcfa || ' F < seuil ' || st.goal_fcfa || ' F : reason=' || st.reason
        || case when st.reason = 'below_goal' and st.goal_fcfa = v_goal then ' OK' else ' *** KO' end || E'\n';
  begin perform public.request_tamassur_withdrawal(null); out := out || E'3-b. demande sous le seuil acceptée *** KO\n';
  exception when others then out := out || '3-b. demande sous le seuil refusée : ' || sqlerrm || E'\n'; end;
  reset role;
  update public.wallets set balance_fcfa = v_goal + 1000 where id = w_ep;
  update public.wallets set balance_fcfa = -1500 where id = w_rev;
  select count(*) into n from public.driver_arrears where driver_id = d_id;
  out := out || '3a. dette créée : ligne de retard=' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  update public.driver_arrears set since = now() - interval '10 days' where driver_id = d_id;
  select 10 - count(*) filter (where extract(dow from g) = 0) into exp_late
    from generate_series(((now() - interval '10 days') at time zone 'Africa/Porto-Novo')::date + 1, (now() at time zone 'Africa/Porto-Novo')::date, interval '1 day') g;
  set local role authenticated;
  select * into st from public.my_tamassur_withdrawal_status();
  out := out || '3b. en retard : reason=' || st.reason || ' dette=' || st.debt_fcfa || ' jours de retard=' || st.late_days || ' (attendu ' || exp_late || ', dimanches exclus)'
        || case when st.reason = 'in_arrears' and st.debt_fcfa = 1500 and st.late_days = exp_late then ' OK' else ' *** KO' end || E'\n';
  begin perform public.request_tamassur_withdrawal(null); out := out || '3c. demande acceptée *** KO' || E'\n';
  exception when others then out := out || '3c. demande refusée : ' || sqlerrm || E'\n'; end;
  reset role;

  -- 4. le chauffeur rattrape son retard : solde Revenus positif -> retard effacé, retrait possible
  update public.wallets set balance_fcfa = 100 where id = w_rev;
  select count(*) into n from public.driver_arrears where driver_id = d_id;
  out := out || '4a. retard rattrapé : ligne de retard=' || n || case when n = 0 then ' OK' else ' *** KO' end || E'\n';
  set local role authenticated;
  select * into st from public.my_tamassur_withdrawal_status();
  out := out || '4b. à jour : reason=' || st.reason || ' can_withdraw=' || st.can_withdraw || ' épargne=' || st.epargne_fcfa || case when st.can_withdraw then ' OK' else ' *** KO' end || E'\n';

  -- 5. demande : ligne en attente, 60 jours, épargne réservée, alerte admin, aucun virement
  begin
    rec := public.request_tamassur_withdrawal(null);
    out := out || '5a. demande enregistrée : ' || rec.amount_fcfa || ' F, statut=' || rec.status || ', délai=' || round(extract(epoch from rec.due_at - rec.requested_at) / 86400) || ' jours'
          || case when rec.status = 'pending' and round(extract(epoch from rec.due_at - rec.requested_at) / 86400) = 60 and rec.amount_fcfa = v_goal + 1000 then ' OK' else ' *** KO' end || E'\n';
  exception when others then out := out || '5a. demande ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;
  select balance_fcfa into v from public.wallets where id = w_ep;
  out := out || '5b. épargne après demande : ' || v || ' F' || case when v = 0 then ' OK (réservée)' else ' *** KO' end || E'\n';
  select count(*) into n from public.admin_alerts where kind = 'tamassur_withdrawal' and ref_id = rec.id;
  out := out || '5c. alerte admin créée : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  select count(*) into n from public.tamassur_withdrawals where driver_id = d_id and status = 'paid';
  out := out || '5d. virement déjà effectué automatiquement : ' || n || case when n = 0 then ' OK (aucun)' else ' *** KO' end || E'\n';

  -- 6. badge admin et deuxième demande refusée
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  badge := public.admin_badge_counts();
  reset role;
  out := out || '6a. badge admin tamassur=' || coalesce(badge ->> 'tamassur', '?') || case when (badge ->> 'tamassur')::int >= 1 then ' OK' else ' *** KO' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into st from public.my_tamassur_withdrawal_status();
  out := out || '6b. état avec demande en cours : reason=' || st.reason || case when st.reason = 'pending' then ' OK' else ' *** KO' end || E'\n';
  begin perform public.request_tamassur_withdrawal(null); out := out || '6c. deuxième demande acceptée *** KO' || E'\n';
  exception when others then out := out || '6c. deuxième demande refusée : ' || sqlerrm || E'\n'; end;

  -- 7. paiement : refusé au chauffeur, accepté à l'admin
  begin perform public.admin_mark_tamassur_paid(rec.id, 'cash'); out := out || '7a. le chauffeur a marqué payé *** KO' || E'\n';
  exception when others then out := out || '7a. paiement par le chauffeur refusé : ' || sqlerrm || ' OK' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    rec := public.admin_mark_tamassur_paid(rec.id, 'mobile_money');
    out := out || '7b. paiement par l''admin : statut=' || rec.status || ' méthode=' || rec.method || case when rec.status = 'paid' then ' OK' else ' *** KO' end || E'\n';
  exception when others then out := out || '7b. paiement admin ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;

  -- 8. permissions : la table de retard et les outils internes ne sont pas écrivables / appelables par l'API
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.driver_arrears (driver_id) values (d_id) on conflict do nothing; out := out || '8a. écriture dans driver_arrears *** KO' || E'\n';
  exception when others then out := out || '8a. écriture driver_arrears refusée OK' || E'\n'; end;
  begin delete from public.driver_arrears where driver_id = d_id; get diagnostics n = row_count; out := out || '8b. suppression driver_arrears : ' || n || ' ligne(s)' || case when n = 0 then ' OK' else ' *** KO' end || E'\n';
  exception when others then out := out || '8b. suppression driver_arrears refusée OK' || E'\n'; end;
  begin perform public._days_late(now()); out := out || '8c. _days_late appelable *** KO' || E'\n';
  exception when others then out := out || '8c. _days_late refusé OK' || E'\n'; end;
  begin perform public._tamassur_start(d_id); out := out || '8d. _tamassur_start appelable *** KO' || E'\n';
  exception when others then out := out || '8d. _tamassur_start refusé OK' || E'\n'; end;
  reset role;
  set local role anon;
  begin perform public.my_tamassur_withdrawal_status(); out := out || '8e. anonyme appelle le statut *** KO' || E'\n';
  exception when others then out := out || '8e. anonyme refusé OK' || E'\n'; end;
  begin perform public.request_tamassur_withdrawal(null); out := out || '8f. anonyme demande un retrait *** KO' || E'\n';
  exception when others then out := out || '8f. anonyme refusé OK' || E'\n'; end;
  reset role;

  -- 9. durée et seuil par véhicule (cotisation par défaut) : moto 12 mois / 150 000, tricycle 24 / 450 000, voitures 24 / 600 000
  for rc in
    select distinct on (v.category) v.category::text as cat, d.id as did
      from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.tamassur_fcfa is null order by v.category, d.id
  loop
    out := out || '9. ' || rc.cat || ' : ' || public._tamassur_months(rc.did) || ' mois, seuil ' || public._tamassur_goal(rc.did) || ' F'
           || case
                when rc.cat = 'moto' then case when public._tamassur_months(rc.did) = 12 and public._tamassur_goal(rc.did) = 150000 then ' OK' else ' *** KO' end
                when rc.cat = 'tricycle' then case when public._tamassur_months(rc.did) = 24 and public._tamassur_goal(rc.did) = 450000 then ' OK' else ' *** KO' end
                else case when public._tamassur_months(rc.did) = 24 and public._tamassur_goal(rc.did) = 600000 then ' OK' else ' *** KO' end
              end || E'\n';
  end loop;

  raise exception E'RESULTATS\n%', out;
end $$;
