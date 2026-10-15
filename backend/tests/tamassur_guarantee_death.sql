-- TamAssur : épargne GARANTIE de 250 000 F par année de cotisation (part épargnée de 834 F sur 1 000 F par jour, objectif de retrait 250 000 F à 12 mois,
-- 500 000 F à 24 mois) et CALCULATEUR décès / invalidité (cotisations réellement prélevées jusqu'à la date de l'événement x taux selon la durée de cotisation).
-- Rôles réels, tout est annulé. Usage : supabase db query --linked -f backend/tests/tamassur_guarantee_death.sql --workdir backend
do $$
declare
  out text := ''; d_id uuid; d_prof uuid; adm uuid; rc record; r record; n int; v int;
  start_d date := date '2027-01-04';   -- un lundi
begin
  select dr.id, dr.profile_id into d_id, d_prof
    from public.drivers dr join public.vehicles v on v.id = dr.current_vehicle_id
   where dr.status = 'active' and v.category::text = 'moto' and dr.tamassur_fcfa is null limit 1;
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  insert into public.wallets (profile_id, kind, balance_fcfa) values (d_prof, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
  insert into public.wallets (profile_id, kind, balance_fcfa) values (d_prof, 'tamcar_epargne', 0) on conflict (profile_id, kind) do nothing;
  update public.wallets set balance_fcfa = 0 where profile_id = d_prof and kind::text = 'tamcar_epargne';
  update public.wallets set balance_fcfa = 50000 where profile_id = d_prof and kind::text = 'tamcar_revenus';
  delete from public.driver_insurance_charges where driver_id = d_id;

  -- 1. objectifs de retrait par véhicule : 250 000 F x durée / 12
  for rc in
    select distinct on (v.category) v.category::text as cat, d.id as did
      from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.tamassur_fcfa is null order by v.category, d.id
  loop
    out := out || '1. ' || rc.cat || ' : ' || public._tamassur_months(rc.did) || ' mois, objectif ' || public._tamassur_goal(rc.did)
           || ' F, part épargnée par jour ' || public._tamassur_savings_day(rc.did) || ' F'
           || case when public._tamassur_goal(rc.did) = 250000 * public._tamassur_months(rc.did) / 12 and public._tamassur_savings_day(rc.did) = 834 then ' OK' else ' *** KO' end || E'\n';
  end loop;

  -- 2. 25 jours de cotisation par mois pendant 12 mois atteignent l'objectif de la moto (834 x 300 = 250 200 >= 250 000)
  out := out || '2. 300 jours x 834 F = ' || (300 * public._tamassur_savings_day(d_id)) || ' F >= objectif ' || public._tamassur_goal(d_id)
         || case when 300 * public._tamassur_savings_day(d_id) >= public._tamassur_goal(d_id) then ' OK' else ' *** KO' end || E'\n';

  -- 3. le prélèvement quotidien : Revenus -1 000 F, Épargne +834 F, trace de la part épargnée
  update public._push_settings set value = '2020-01-01' where key = 'tamassur_debit_from';
  update public._push_settings set value = '2099-01-01' where key = 'floor_debit_from';  -- prélèvement séparé de 22 h (avant l'objectif tout compris)
  perform public.charge_driver_insurance(date '2027-01-04');
  select balance_fcfa into v from public.wallets where profile_id = d_prof and kind::text = 'tamcar_epargne';
  select balance_fcfa into n from public.wallets where profile_id = d_prof and kind::text = 'tamcar_revenus';
  out := out || '3. un jour : Revenus 50000 -> ' || n || ', Épargne 0 -> ' || v
         || case when n = 49000 and v = 834 then ' OK' else ' *** KO' end || E'\n';
  select saved_fcfa into n from public.driver_insurance_charges where driver_id = d_id and period = date '2027-01-04';
  out := out || '   part épargnée tracée : ' || coalesce(n::text, '?') || case when n = 834 then ' OK' else ' *** KO' end || E'\n';

  -- 4. historique simulé : 150 jours payés (lun-sam) à partir du 04/01/2027 -> 5 mois et demi ; puis 312 jours
  delete from public.driver_insurance_charges where driver_id = d_id;
  insert into public.driver_insurance_charges (driver_id, period, amount_fcfa, collected_fcfa, saved_fcfa, status, collected_at)
  select d_id, g::date, 1000, 1000, 834, 'paid', now()
    from generate_series(start_d::timestamp, (start_d + 365)::timestamp, interval '1 day') g
   where extract(dow from g) <> 0;

  -- 4a. décès à 6 mois (30/06/2027) : moins de 12 mois -> moitié des cotisations prélevées
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select * into r from public.admin_tamassur_death_calc(d_id, date '2027-06-30');
    reset role;
    out := out || '4a. événement le 30/06/2027 : début ' || r.start_date || ', ' || r.months_elapsed || ' mois, ' || r.days_paid || ' jours payés, cotisations '
           || r.cotisations_fcfa || ' F, taux ' || r.pct || ' %, à restituer ' || r.benefit_fcfa || ' F'
           || case when r.months_elapsed = 5 and r.pct = 50 and r.benefit_fcfa = r.cotisations_fcfa / 2 and r.cotisations_fcfa = 1000 * r.days_paid then ' OK' else ' *** KO' end || E'\n';
    out := out || '    épargne constituée ' || r.epargne_constituee_fcfa || ' F (= ' || r.days_paid || ' x 834)' || case when r.epargne_constituee_fcfa = 834 * r.days_paid then ' OK' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || '4a. ECHEC : ' || sqlerrm || E'\n'; end;

  -- 4b. décès à exactement 12 mois (04/01/2028) : totalité des cotisations prélevées jusqu'à cette date
  set local role authenticated;
  begin
    select * into r from public.admin_tamassur_death_calc(d_id, date '2028-01-04');
    reset role;
    out := out || '4b. événement le 04/01/2028 : ' || r.months_elapsed || ' mois, ' || r.days_paid || ' jours payés, cotisations ' || r.cotisations_fcfa || ' F, taux ' || r.pct
           || ' %, à restituer ' || r.benefit_fcfa || ' F'
           || case when r.months_elapsed = 12 and r.pct = 100 and r.benefit_fcfa = r.cotisations_fcfa then ' OK' else ' *** KO' end || E'\n';
    out := out || '    objectif de retrait à l''échéance ' || r.guarantee_at_term_fcfa || ' F sur ' || r.term_months || ' mois' || case when r.guarantee_at_term_fcfa = 250000 then ' OK' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || '4b. ECHEC : ' || sqlerrm || E'\n'; end;

  -- 4c. événement AVANT le premier prélèvement : rien à restituer
  set local role authenticated;
  begin
    select * into r from public.admin_tamassur_death_calc(d_id, date '2026-12-31');
    reset role;
    out := out || '4c. avant le premier prélèvement : cotisations ' || r.cotisations_fcfa || ' F, à restituer ' || r.benefit_fcfa || ' F'
           || case when r.cotisations_fcfa = 0 and r.benefit_fcfa = 0 then ' OK' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || '4c. ECHEC : ' || sqlerrm || E'\n'; end;

  -- 4d. les jours non payés ne comptent pas : un jour non payé (status <> paid) est exclu
  update public.driver_insurance_charges set status = 'pending' where driver_id = d_id and period = date '2027-01-05';
  set local role authenticated;
  begin
    select * into r from public.admin_tamassur_death_calc(d_id, date '2027-01-10');
    reset role;
    out := out || '4d. 1 jour impayé sur 6 : jours payés ' || r.days_paid || ', cotisations ' || r.cotisations_fcfa || ' F'
           || case when r.days_paid = 5 and r.cotisations_fcfa = 5000 then ' OK' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || '4d. ECHEC (statut pending) : ' || sqlerrm || E'\n'; end;

  -- 5. réglages : taux modifiables par l'admin, bornés ; la garantie annuelle aussi
  set local role authenticated;
  begin
    perform public.admin_set_program_rule('death_early_pct', 40);
    select * into r from public.admin_tamassur_death_calc(d_id, date '2027-06-30');
    out := out || '5a. taux avant 12 mois réglé à 40 % : à restituer ' || r.benefit_fcfa || ' F' || case when r.pct = 40 and r.benefit_fcfa = floor(r.cotisations_fcfa * 0.4) then ' OK' else ' *** KO' end || E'\n';
    begin perform public.admin_set_program_rule('death_late_pct', 120); out := out || '5b. 120 % accepté *** KO' || E'\n';
    exception when others then out := out || '5b. 120 % refusé OK' || E'\n'; end;
    begin perform public.admin_set_program_rule('tamassur_guarantee_year', 400000); out := out || '5c. garantie 400 000 F acceptée *** KO' || E'\n';
    exception when others then out := out || '5c. garantie 400 000 F refusée OK' || E'\n'; end;
    reset role;
  exception when others then reset role; out := out || '5. ECHEC : ' || sqlerrm || E'\n'; end;

  -- 6. permissions : un chauffeur ne peut ni calculer ni lister
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform * from public.admin_tamassur_death_calc(d_id); reset role; out := out || '6a. calcul par un chauffeur *** KO' || E'\n';
  exception when others then reset role; out := out || '6a. calcul refusé au chauffeur OK' || E'\n'; end;
  set local role authenticated;
  select count(*) into n from public.admin_tamassur_drivers();
  reset role;
  out := out || '6b. liste des chauffeurs vue par un chauffeur : ' || n || case when n = 0 then ' OK' else ' *** KO' end || E'\n';

  raise exception E'RESULTATS\n%', out;
end $$;
