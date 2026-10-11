-- Forfaits internet des meilleurs chauffeurs : éligibilité (jours d'objectif, annulations), X % des éligibles avec un minimum, validation
-- unique, marquage « envoyé », droits. Rien n'est conservé (transaction annulée, résultat dans « RESULTATS »).
-- Usage : supabase db query --linked -f tests/data_bundles.sql  (depuis backend/)
do $$
declare
  out text := '';
  adm uuid; cli uuid;
  d1 uuid; p1 uuid; d2 uuid; p2 uuid; d3 uuid; p3 uuid;
  rr uuid[]; rc uuid;
  wk date := date '2026-09-28';       -- lundi ; la semaine va jusqu'au samedi 3 octobre
  row1 record; n int; v int; st text; msg text;
begin
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select p.id into cli from public.profiles p where p.role::text = 'client' and not exists (select 1 from public.drivers d where d.profile_id = p.id) limit 1;
  select x.did, x.pid into d1, p1 from (select d.id did, d.profile_id pid from public.drivers d join public.profiles q on q.id = d.profile_id
     where d.status::text = 'active' and d.application_type::text <> 'proprietaire' and d.current_vehicle_id is not null and q.role::text <> 'admin' order by d.id limit 1) x;
  select x.did, x.pid into d2, p2 from (select d.id did, d.profile_id pid from public.drivers d join public.profiles q on q.id = d.profile_id
     where d.status::text = 'active' and d.application_type::text <> 'proprietaire' and d.current_vehicle_id is not null and q.role::text <> 'admin' and d.id <> d1 order by d.id limit 1) x;
  select x.did, x.pid into d3, p3 from (select d.id did, d.profile_id pid from public.drivers d join public.profiles q on q.id = d.profile_id
     where d.status::text = 'active' and d.application_type::text <> 'proprietaire' and d.current_vehicle_id is not null and q.role::text <> 'admin' and d.id not in (d1, d2) order by d.id limit 1) x;
  if d3 is null then raise exception 'Il faut 3 chauffeurs actifs avec véhicule pour tester'; end if;

  -- objectifs quotidiens très bas : une course par jour suffit ; réglages de départ du test
  update public.program_rules set value = 100 where key like 'floor\_%';
  update public.program_rules set value = 20 where key = 'data_bundle_top_pct';
  update public.program_rules set value = 3 where key = 'data_bundle_min_winners';
  update public.program_rules set value = 10 where key = 'data_bundle_max_winners';
  update public.program_rules set value = 4 where key = 'data_bundle_min_days';
  update public.program_rules set value = 45 where key = 'data_bundle_min_rating';
  update public._push_settings set value = '2020-01-01' where key = 'data_bundle_from';
  delete from public.data_bundle_awards where week_start = wk;

  -- courses : d1 = 5 jours (lundi-vendredi), d2 = 3 jours, d3 = 1 jour
  select array_agg(id order by created_at) into rr from (select id, created_at from public.rides where status::text = 'completed' order by created_at limit 9) x;
  if coalesce(array_length(rr, 1), 0) < 9 then raise exception 'Il faut 9 courses terminées pour tester'; end if;
  update public.rides set driver_id = d1, ended_at = (wk + 0)::timestamp at time zone 'Africa/Porto-Novo' + interval '10 hours' where id = rr[1];
  update public.rides set driver_id = d1, ended_at = (wk + 1)::timestamp at time zone 'Africa/Porto-Novo' + interval '10 hours' where id = rr[2];
  update public.rides set driver_id = d1, ended_at = (wk + 2)::timestamp at time zone 'Africa/Porto-Novo' + interval '10 hours' where id = rr[3];
  update public.rides set driver_id = d1, ended_at = (wk + 3)::timestamp at time zone 'Africa/Porto-Novo' + interval '10 hours' where id = rr[4];
  update public.rides set driver_id = d1, ended_at = (wk + 4)::timestamp at time zone 'Africa/Porto-Novo' + interval '10 hours' where id = rr[5];
  update public.rides set driver_id = d2, ended_at = (wk + 0)::timestamp at time zone 'Africa/Porto-Novo' + interval '10 hours' where id = rr[6];
  update public.rides set driver_id = d2, ended_at = (wk + 1)::timestamp at time zone 'Africa/Porto-Novo' + interval '10 hours' where id = rr[7];
  update public.rides set driver_id = d2, ended_at = (wk + 2)::timestamp at time zone 'Africa/Porto-Novo' + interval '10 hours' where id = rr[8];
  update public.rides set driver_id = d3, ended_at = (wk + 0)::timestamp at time zone 'Africa/Porto-Novo' + interval '10 hours' where id = rr[9];
  delete from public.ratings where ride_id = any(rr);

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. 4 jours requis : seul d1 (5 jours) est éligible ; d2 (3 jours) et d3 (1 jour) écartés avec leur motif
  select * into row1 from public.admin_data_bundle_ranking(wk) where profile_id = p1;
  out := out || '1. d1 : ' || row1.days_met || ' jours, éligible=' || row1.eligible || ', gagnant=' || row1.is_winner || ', rang ' || row1.rank_pos
         || case when row1.days_met = 5 and row1.eligible and row1.is_winner and row1.rank_pos = 1 then ' OK' else ' *** KO' end || E'\n';
  select * into row1 from public.admin_data_bundle_ranking(wk) where profile_id = p2;
  out := out || '   d2 : ' || row1.days_met || ' jours, éligible=' || row1.eligible || ', motif=' || coalesce(row1.reason, '∅')
         || case when row1.days_met = 3 and not row1.eligible and row1.reason like '3 jours d''objectif sur 4 requis%' then ' OK' else ' *** KO' end || E'\n';
  select count(*) into n from public.admin_data_bundle_ranking(wk) where is_winner;
  out := out || '   bénéficiaires : ' || n || ' (1 seul éligible, minimum 3 mais jamais plus que les éligibles)' || case when n = 1 then ' OK' else ' *** KO' end || E'\n';

  -- 2. la semaine peut être donnée par n'importe quel jour : même résultat
  select count(*) into n from public.admin_data_bundle_ranking(wk + 3) where is_winner and profile_id = p1;
  out := out || '2. semaine désignée par un jeudi : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';

  -- 3. 3 jours requis : d1 et d2 éligibles ; 20 % de 2 = 1, mais minimum 3 → les 2 éligibles reçoivent
  reset role;
  update public.program_rules set value = 3 where key = 'data_bundle_min_days';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.admin_data_bundle_ranking(wk) where is_winner;
  out := out || '3. 3 jours requis : bénéficiaires ' || n || ' (2 éligibles, minimum 3)' || case when n = 2 then ' OK' else ' *** KO' end || E'\n';

  -- 4. minimum ramené à 1 et 50 % : 50 % de 2 = 1 bénéficiaire, le mieux classé (d1)
  reset role;
  update public.program_rules set value = 1 where key = 'data_bundle_min_winners';
  update public.program_rules set value = 50 where key = 'data_bundle_top_pct';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.admin_data_bundle_ranking(wk) where is_winner;
  select count(*) into v from public.admin_data_bundle_ranking(wk) where is_winner and profile_id = p1;
  out := out || '4. 50 % de 2 éligibles : ' || n || ' bénéficiaire, c''est d1 : ' || v || case when n = 1 and v = 1 then ' OK' else ' *** KO' end || E'\n';

  -- 5. une annulation imputable au chauffeur dans la semaine l'écarte
  reset role;
  select id into rc from public.rides where status::text = 'cancelled_by_driver' and cancel_attributed_to = 'driver' limit 1;
  if rc is null then
    out := out || E'5. (aucune course annulée par un chauffeur en base : test sauté)\n';
  else
    update public.rides set driver_id = d1, cancelled_at = (wk + 2)::timestamp at time zone 'Africa/Porto-Novo' + interval '12 hours' where id = rc;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into row1 from public.admin_data_bundle_ranking(wk) where profile_id = p1;
    out := out || '5. d1 avec 1 annulation imputable : éligible=' || row1.eligible || ', motif=' || coalesce(row1.reason, '∅')
           || case when row1.cancels = 1 and not row1.eligible and row1.reason like '%1 annulation imputable%' then ' OK' else ' *** KO' end || E'\n';
    reset role;
    update public.rides set cancelled_at = null, driver_id = null where id = rc;
  end if;

  -- 6. validation : bénéficiaires enregistrés une seule fois ; marquage « envoyé »
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.admin_data_bundle_validate(wk);
  out := out || '6. validation : ' || v || ' bénéficiaire(s)';
  v := public.admin_data_bundle_validate(wk);
  select count(*) into n from public.data_bundle_awards where week_start = wk and profile_id = p1 and status = 'selected' and rank = 1;
  out := out || ' | rejouée : ' || v || ', ligne de d1 : ' || n || case when v = 0 and n = 1 then ' OK (aucun doublon)' else ' *** KO' end || E'\n';
  v := public.admin_data_bundle_mark_sent(wk);
  select status into st from public.data_bundle_awards where week_start = wk and profile_id = p1;
  out := out || '   marqué envoyé : ' || v || ', statut ' || st || case when v = 1 and st = 'sent' then ' OK' else ' *** KO' end || E'\n';

  -- 7. une semaine pas terminée, ou avant le démarrage, ne se valide pas
  begin
    perform public.admin_data_bundle_validate(date_trunc('week', (now() at time zone 'Africa/Porto-Novo') + interval '7 days')::date);
    out := out || E'7a. semaine à venir : *** KO (acceptée)\n';
  exception when others then out := out || '7a. semaine à venir refusée' || case when sqlerrm like '%pas terminée%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  reset role;
  update public._push_settings set value = '2027-07-01' where key = 'data_bundle_from';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_data_bundle_validate(wk);
    out := out || E'7b. avant le démarrage : *** KO (acceptée)\n';
  exception when others then out := out || '7b. avant le démarrage refusé' || case when sqlerrm like '%démarrent le 01/07/2027%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  reset role;

  -- 8. droits : un non-admin ne peut ni classer, ni valider, ni marquer ; un chauffeur ne voit que SA ligne
  perform set_config('request.jwt.claims', json_build_object('sub', cli, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform * from public.admin_data_bundle_ranking(wk); out := out || E'8a. classement ouvert à un client : *** KO\n';
  exception when others then out := out || '8a. classement refusé à un client' || case when sqlerrm like '%Admin only%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  begin perform public.admin_data_bundle_validate(wk); out := out || E'8b. validation ouverte à un client : *** KO\n';
  exception when others then out := out || '8b. validation refusée à un client' || case when sqlerrm like '%Admin only%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  select count(*) into n from public.data_bundle_awards;
  out := out || '8c. un client voit ' || n || ' attribution(s)' || case when n = 0 then ' OK' else ' *** KO' end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.data_bundle_awards;
  out := out || '8d. le chauffeur gagnant voit ' || n || ' attribution(s) (la sienne)' || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  reset role;

  raise exception E'RESULTATS\n%', out;
end $$;
