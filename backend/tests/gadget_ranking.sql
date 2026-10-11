-- Gadgets des meilleurs chauffeurs et clients : classement automatique d'un tour de 6 mois, critères, validation, droits.
-- Rôles réels, rien n'est conservé (la transaction finit par une exception, résultat dans « RESULTATS »).
-- Usage : supabase db query --linked -f tests/gadget_ranking.sql  (depuis backend/)
do $$
declare
  out text := '';
  adm uuid; cli uuid;
  d1 uuid; p1 uuid; d2 uuid; p2 uuid;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; rc uuid;
  c1 uuid; c2 uuid;
  f date := date '2026-01-01'; t date := date '2026-06-30';
  row1 record; n int; v int; msg text;
begin
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select p.id into cli from public.profiles p where p.role::text = 'client' and not exists (select 1 from public.drivers d where d.profile_id = p.id) limit 1;
  select d.id, d.profile_id into d1, p1 from public.drivers d join public.profiles q on q.id = d.profile_id where d.status::text = 'active' and q.role::text <> 'admin' order by d.id limit 1;
  select d.id, d.profile_id into d2, p2 from public.drivers d join public.profiles q on q.id = d.profile_id where d.status::text = 'active' and q.role::text <> 'admin' and d.id <> d1 order by d.id limit 1;
  if d1 is null or d2 is null then raise exception 'Il faut 2 chauffeurs actifs pour tester'; end if;

  -- Données de test : 5 courses terminées du tour (3 pour d1, 2 pour d2), notes, une annulation imputable à d2
  with c as (select id, client_id, row_number() over (order by created_at) rn from public.rides where status::text = 'completed')
  select (array_agg(id) filter (where rn = 1))[1], (array_agg(id) filter (where rn = 2))[1], (array_agg(id) filter (where rn = 3))[1], (array_agg(id) filter (where rn = 4))[1], (array_agg(id) filter (where rn = 5))[1],
         (array_agg(client_id) filter (where rn = 1))[1], (array_agg(client_id) filter (where rn = 4))[1]
    into r1, r2, r3, r4, r5, c1, c2 from c;
  if r5 is null then raise exception 'Il faut 5 courses terminées pour tester'; end if;
  update public.rides set driver_id = d1, ended_at = timestamptz '2026-03-10 10:00+01' where id in (r1, r2, r3);
  update public.rides set driver_id = d2, ended_at = timestamptz '2026-03-11 10:00+01' where id in (r4, r5);
  delete from public.ratings where ride_id in (r1, r2, r3, r4, r5);
  insert into public.ratings (ride_id, rater_id, rated_id, stars, created_at) select r1, client_id, p1, 5, timestamptz '2026-03-10 11:00+01' from public.rides where id = r1;
  insert into public.ratings (ride_id, rater_id, rated_id, stars, created_at) select r2, client_id, p1, 5, timestamptz '2026-03-10 11:00+01' from public.rides where id = r2;
  insert into public.ratings (ride_id, rater_id, rated_id, stars, created_at) select r3, client_id, p1, 4, timestamptz '2026-03-10 11:00+01' from public.rides where id = r3;
  insert into public.ratings (ride_id, rater_id, rated_id, stars, created_at) select r4, client_id, p2, 5, timestamptz '2026-03-11 11:00+01' from public.rides where id = r4;
  insert into public.ratings (ride_id, rater_id, rated_id, stars, created_at) select r5, client_id, p2, 5, timestamptz '2026-03-11 11:00+01' from public.rides where id = r5;
  -- notes données AUX CLIENTS par leurs chauffeurs (client de r1 : 5 étoiles)
  insert into public.ratings (ride_id, rater_id, rated_id, stars, created_at) select r1, p1, client_id, 5, timestamptz '2026-03-10 11:05+01' from public.rides where id = r1;

  -- règles du test
  update public.program_rules set value = 2 where key = 'gadget_driver_min_rides';
  update public.program_rules set value = 47 where key = 'gadget_driver_min_rating';
  update public.program_rules set value = 0 where key = 'gadget_max_late_cancels';
  update public.program_rules set value = 1 where key = 'gadget_client_min_rides';
  update public.program_rules set value = 0 where key = 'gadget_client_min_rating';
  update public.program_rules set value = 5 where key = 'gadget_winners_drivers';
  update public.program_rules set value = 3 where key = 'gadget_winners_clients';

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.admin_gadget_ranking('driver', f, t);
  out := out || '0. lignes du classement chauffeurs : ' || n || E'
';
  -- 1. classement chauffeurs : d2 (2 courses, 5,0) éligible ; d1 (3 courses mais 4,67 < 4,7) écarté pour sa note
  select * into row1 from public.admin_gadget_ranking('driver', f, t) where profile_id = p1;
  out := out || '1. d1 : ' || coalesce(row1.rides::text, '∅') || ' courses, note ' || coalesce(row1.rating::text, '∅') || ', éligible=' || coalesce(row1.eligible::text, '∅') || ', motif=' || coalesce(row1.reason, '-')
         || case when row1.rides = 3 and row1.rating = 4.67 and not row1.eligible and row1.reason like 'note 4,67 sous 4,7%' and not row1.is_winner then ' OK' else ' *** KO' end || E'\n';
  select * into row1 from public.admin_gadget_ranking('driver', f, t) where profile_id = p2;
  out := out || '2. d2 : ' || coalesce(row1.rides::text, '∅') || ' courses, note ' || coalesce(row1.rating::text, '∅') || ', éligible=' || coalesce(row1.eligible::text, '∅') || ', rang=' || coalesce(row1.rank_pos::text, '∅') || ', gagnant=' || coalesce(row1.is_winner::text, '∅')
         || case when row1.rides = 2 and row1.rating = 5.00 and row1.eligible and row1.is_winner and row1.rank_pos = 1 then ' OK' else ' *** KO' end || E'\n';

  -- 3. période hors tour : aucune course
  select count(*) into n from public.admin_gadget_ranking('driver', date '2025-01-01', date '2025-06-30') where profile_id in (p1, p2);
  out := out || '3. tour sans activité : ' || n || ' ligne(s)' || case when n = 0 then ' OK' else ' *** KO' end || E'\n';

  -- 4. une annulation imputable à d2 sur le tour (tolérance 0) l'écarte ; à 1 il est de nouveau éligible
  reset role;
  select id into rc from public.rides where status::text = 'cancelled_by_driver' and cancel_attributed_to = 'driver' limit 1;
  if rc is null then
    out := out || E'4. (aucune course annulée par un chauffeur en base : test sauté)\n';
  else
    update public.rides set driver_id = d2, cancelled_at = timestamptz '2026-03-12 09:00+01' where id = rc;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into row1 from public.admin_gadget_ranking('driver', f, t) where profile_id = p2;
    out := out || '4. d2 avec 1 annulation imputable : ' || coalesce(row1.late_cancels::text, '∅') || ', éligible=' || coalesce(row1.eligible::text, '∅') || ', motif=' || coalesce(row1.reason, '-')
           || case when row1.late_cancels = 1 and not row1.eligible and row1.reason like '%1 annulation imputable%' then ' OK' else ' *** KO' end || E'\n';
    reset role;
    update public.program_rules set value = 1 where key = 'gadget_max_late_cancels';
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into row1 from public.admin_gadget_ranking('driver', f, t) where profile_id = p2;
    out := out || '   tolérance 1 : éligible=' || coalesce(row1.eligible::text, '∅') || case when row1.eligible then ' OK' else ' *** KO' end || E'\n';
  end if;

  -- 5. classement clients : le client de r1 a 1 course dans le tour, note 5
  select * into row1 from public.admin_gadget_ranking('client', f, t) where profile_id = c1;
  out := out || '5. client : ' || coalesce(row1.rides::text, 'absent') || ' course(s), note ' || coalesce(row1.rating::text, '-') || ', éligible=' || coalesce(row1.eligible::text, '-')
         || case when row1.rides >= 1 and row1.eligible then ' OK' else ' *** KO' end || E'\n';

  -- 6. validation : tour terminé -> les gagnants sont enregistrés une seule fois
  v := public.admin_gadget_validate('driver', f, t);
  out := out || '6. validation : ' || v || ' gagnant(s) enregistré(s)' || case when v = 1 then ' OK' else ' *** KO' end || E'\n';
  v := public.admin_gadget_validate('driver', f, t);
  out := out || '7. validation rejouée : ' || v || case when v = 0 then ' OK (aucun doublon)' else ' *** KO' end || E'\n';
  select count(*) into n from public.gadget_awards where round_from = f and kind = 'driver' and profile_id = p2 and status = 'awarded' and rank = 1;
  out := out || '8. cadeau enregistré pour d2 (rang 1, attribué) : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';

  -- 9. un tour pas fini ne se valide pas
  begin
    perform public.admin_gadget_validate('driver', date '2026-07-01', date '2099-12-31');
    out := out || E'9. tour non terminé : ECHEC (accepté)\n';
  exception when others then out := out || case when sqlerrm like '%pas terminé%' then E'9. tour non terminé refusé : OK\n' else '9. message inattendu → ' || sqlerrm || E'\n' end; end;

  -- 10. suivi de la remise
  begin
    perform public.admin_gadget_update((select id from public.gadget_awards where profile_id = p2 and round_from = f), 'delivered', 'Casquette TamCar', 'Remis en main propre');
  exception when others then out := out || '10. (mise à jour impossible : ' || sqlerrm || E')
'; end;
  select count(*) into n from public.gadget_awards where profile_id = p2 and round_from = f and status = 'delivered' and gadget = 'Casquette TamCar' and delivered_at is not null;
  out := out || '10. remise enregistrée : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';

  -- 11. un non-admin ne peut ni classer, ni valider, ni lire les cadeaux
  perform set_config('request.jwt.claims', json_build_object('sub', cli, 'role', 'authenticated')::text, true);
  begin
    perform * from public.admin_gadget_ranking('driver', f, t);
    out := out || E'11. non-admin classement : ECHEC (accepté)\n';
  exception when others then out := out || case when sqlerrm like '%Admin only%' then E'11. non-admin refusé (classement) : OK\n' else '11. message inattendu → ' || sqlerrm || E'\n' end; end;
  begin
    perform public.admin_gadget_validate('driver', f, t);
    out := out || E'12. non-admin validation : ECHEC (accepté)\n';
  exception when others then out := out || case when sqlerrm like '%Admin only%' then E'12. non-admin refusé (validation) : OK\n' else '12. message inattendu → ' || sqlerrm || E'\n' end; end;
  select count(*) into n from public.gadget_awards;
  out := out || '13. un non-admin voit ' || n || ' cadeau(x)' || case when n = 0 then ' OK' else ' *** KO' end || E'\n';

  raise exception E'RESULTATS\n%', out;
end $$;
