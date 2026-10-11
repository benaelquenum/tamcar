-- Créneaux de rendez-vous des candidats chauffeurs : horaires 9h00-11h30 / 14h00-18h00 (heure de Porto-Novo), au plus 3 candidats par
-- créneau (réglage rdv_capacity_per_slot), créneau complet invisible, horaires non proposés refusés, annulation qui libère une place.
-- Tout est annulé en fin de test (résultat dans « RESULTATS »).
-- Usage : supabase db query --linked -f tests/appointment_slots.sql  (depuis backend/)
do $$
declare
  c uuid[]; adm uuid;
  out text := '';
  v_hours text; v_days text;
  v_first timestamptz;
  v_n int;
  v_app uuid;
  t record;
  typ driver_application_type := (enum_range(null::driver_application_type))[1];
begin
  select array_agg(id) into c from (
    select p.id from public.profiles p
     where p.role::text = 'client' and not exists (select 1 from public.drivers d where d.profile_id = p.id)
       and not exists (select 1 from public.driver_appointments x where x.profile_id = p.id and x.status in ('scheduled','confirmed'))
     order by p.created_at limit 4) q;
  if coalesce(array_length(c, 1), 0) < 4 then raise exception 'Il faut 4 comptes clients sans rendez-vous pour tester'; end if;
  select id into adm from public.profiles where role::text = 'admin' limit 1;

  update public.program_rules set value = 3 where key = 'rdv_capacity_per_slot';

  perform set_config('request.jwt.claims', json_build_object('sub', c[1], 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1-3. horaires proposés, à l'heure de Porto-Novo
  select string_agg(distinct to_char(s.slot_at at time zone 'Africa/Porto-Novo', 'HH24:MI'), ' ' order by to_char(s.slot_at at time zone 'Africa/Porto-Novo', 'HH24:MI')),
         string_agg(distinct extract(dow from s.slot_at at time zone 'Africa/Porto-Novo')::int::text, '' order by extract(dow from s.slot_at at time zone 'Africa/Porto-Novo')::int::text)
    into v_hours, v_days
    from public.available_slots(30) s;
  out := out || case when v_hours = '09:00 09:30 10:00 10:30 11:00 11:30 14:00 14:30 15:00 15:30 16:00 16:30 17:00 17:30 18:00'
                     then E'1. horaires 9h00-11h30 + 14h00-18h00 : OK\n' else '1. horaires : ECHEC → ' || coalesce(v_hours, 'null') || E'\n' end;
  out := out || case when v_days = '12345' then E'2. lundi à vendredi uniquement : OK\n' else '2. jours : ECHEC → ' || coalesce(v_days, 'null') || E'\n' end;
  select count(*) into v_n from public.available_slots(30);
  out := out || case when v_n > 200 then E'3. plus de 200 créneaux sur 30 jours (' || v_n || E') : OK\n' else '3. nombre de créneaux : ECHEC → ' || v_n || E'\n' end;

  -- 4. le 1er candidat réserve ; le créneau reste ouvert pour les autres (plafond 3)
  select min(s.slot_at) into v_first from public.available_slots(30) s where s.slot_at > now() + interval '3 days';
  begin
    select id into v_app from public.book_appointment(typ, 'Test', 'Alpha', '+22900000001', null, v_first);
    out := out || E'4. candidat 1 réserve : OK\n';
  exception when others then out := out || '4. candidat 1 réserve : ECHEC → ' || sqlerrm || E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', c[2], 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.available_slots(30) s where s.slot_at = v_first;
  out := out || case when v_n = 1 then E'5. le créneau reste proposé au candidat 2 (1 place prise sur 3) : OK\n' else E'5. créneau disparu trop tôt : ECHEC\n' end;

  -- 6. candidats 2 et 3 réservent le même créneau
  begin
    perform public.book_appointment(typ, 'Test', 'Beta', '+22900000002', null, v_first);
    perform set_config('request.jwt.claims', json_build_object('sub', c[3], 'role', 'authenticated')::text, true);
    perform public.book_appointment(typ, 'Test', 'Gamma', '+22900000003', null, v_first);
    out := out || E'6. candidats 2 et 3 réservent le même créneau : OK\n';
  exception when others then out := out || '6. candidats 2 et 3 : ECHEC → ' || sqlerrm || E'\n'; end;

  -- 7. le 4e candidat est refusé et ne voit plus le créneau
  perform set_config('request.jwt.claims', json_build_object('sub', c[4], 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.available_slots(30) s where s.slot_at = v_first;
  out := out || case when v_n = 0 then E'7. créneau complet (3 candidats) : n''est plus proposé : OK\n' else E'7. créneau complet encore proposé : ECHEC\n' end;
  begin
    perform public.book_appointment(typ, 'Test', 'Delta', '+22900000004', null, v_first);
    out := out || E'8. 4e candidat : ECHEC (accepté)\n';
  exception when others then out := out || case when sqlerrm like '%plus disponible%' then E'8. 4e candidat refusé : OK\n' else '8. message inattendu → ' || sqlerrm || E'\n' end; end;

  -- 9. le candidat 1 annule : une place se libère pour le 4e
  perform set_config('request.jwt.claims', json_build_object('sub', c[1], 'role', 'authenticated')::text, true);
  perform public.cancel_appointment(v_app);
  perform set_config('request.jwt.claims', json_build_object('sub', c[4], 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.available_slots(30) s where s.slot_at = v_first;
  out := out || case when v_n = 1 then E'9. après une annulation, le créneau est de nouveau proposé : OK\n' else E'9. place non libérée : ECHEC\n' end;
  begin
    perform public.book_appointment(typ, 'Test', 'Delta', '+22900000004', null, v_first);
    out := out || E'10. le 4e candidat prend la place libérée : OK\n';
  exception when others then out := out || '10. 4e candidat : ECHEC → ' || sqlerrm || E'\n'; end;

  -- 11. horaire non proposé (03h00 un jour de semaine) refusé
  perform set_config('request.jwt.claims', json_build_object('sub', c[1], 'role', 'authenticated')::text, true);
  begin
    perform public.book_appointment(typ, 'Test', 'Alpha', '+22900000001', null,
      (((now() at time zone 'Africa/Porto-Novo')::date + 10 - extract(dow from (now() at time zone 'Africa/Porto-Novo')::date + 10)::int + 3) + time '03:00') at time zone 'Africa/Porto-Novo');
    out := out || E'11. horaire non proposé : ECHEC (accepté)\n';
  exception when others then out := out || case when sqlerrm like '%plus disponible%' then E'11. horaire non proposé refusé : OK\n' else '11. message inattendu → ' || sqlerrm || E'\n' end; end;

  -- 12. le plafond est un réglage : à 4, le créneau (3 candidats) est de nouveau ouvert ; hors 1-20, l'admin est refusé
  reset role;
  update public.program_rules set value = 4 where key = 'rdv_capacity_per_slot';
  perform set_config('request.jwt.claims', json_build_object('sub', c[1], 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.available_slots(30) s where s.slot_at = v_first;
  out := out || case when v_n = 1 then E'12. plafond relevé à 4 : le créneau se rouvre : OK\n' else E'12. plafond non pris en compte : ECHEC\n' end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_set_program_rule('rdv_capacity_per_slot', 21);
    out := out || E'13. plafond à 21 : ECHEC (accepté)\n';
  exception when others then out := out || case when sqlerrm like '%Entre 1 et 20%' then E'13. plafond hors limites refusé : OK\n' else '13. message inattendu → ' || sqlerrm || E'\n' end; end;
  begin
    perform public.admin_set_program_rule('rdv_capacity_per_slot', 0);
    out := out || E'14. plafond à 0 : ECHEC (accepté)\n';
  exception when others then out := out || case when sqlerrm like '%Entre 1 et 20%' then E'14. plafond à 0 refusé : OK\n' else '14. message inattendu → ' || sqlerrm || E'\n' end; end;

  raise exception E'RESULTATS\n%', out;
end $$;
