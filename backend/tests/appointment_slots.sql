-- Créneaux de rendez-vous des candidats chauffeurs : horaires 9h00-11h30 / 14h00-18h00 (heure de Porto-Novo), créneaux déjà pris
-- invisibles pour les autres, horaires non proposés refusés. Tout est annulé en fin de test (résultat dans « RESULTATS »).
-- Usage : supabase db query --linked -f tests/appointment_slots.sql  (depuis backend/)
do $$
declare
  a uuid; b uuid;
  out text := '';
  v_hours text;
  v_days text;
  v_first timestamptz;
  v_n int;
  v_msg text;
begin
  select p.id into a from public.profiles p
   where p.role::text = 'client' and not exists (select 1 from public.driver_appointments x where x.profile_id = p.id and x.status in ('scheduled','confirmed'))
   order by p.created_at limit 1;
  select p.id into b from public.profiles p
   where p.role::text = 'client' and p.id <> a and not exists (select 1 from public.driver_appointments x where x.profile_id = p.id and x.status in ('scheduled','confirmed'))
   order by p.created_at limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. horaires proposés, à l'heure de Porto-Novo
  select string_agg(distinct to_char(s.slot_at at time zone 'Africa/Porto-Novo', 'HH24:MI'), ' ' order by to_char(s.slot_at at time zone 'Africa/Porto-Novo', 'HH24:MI')),
         string_agg(distinct extract(dow from s.slot_at at time zone 'Africa/Porto-Novo')::int::text, '' order by extract(dow from s.slot_at at time zone 'Africa/Porto-Novo')::int::text)
    into v_hours, v_days
    from public.available_slots(30) s;
  out := out || case when v_hours = '09:00 09:30 10:00 10:30 11:00 11:30 14:00 14:30 15:00 15:30 16:00 16:30 17:00 17:30 18:00'
                     then E'1. horaires 9h00-11h30 + 14h00-18h00 : OK\n' else '1. horaires : ECHEC → ' || coalesce(v_hours, 'null') || E'\n' end;
  out := out || case when v_days = '12345' then E'2. lundi à vendredi uniquement : OK\n' else '2. jours : ECHEC → ' || coalesce(v_days, 'null') || E'\n' end;

  -- 2. toute la période : plus de 200 créneaux (la limite précédente coupait la liste)
  select count(*) into v_n from public.available_slots(30);
  out := out || case when v_n > 200 then E'3. plus de 200 créneaux sur 30 jours (' || v_n || E') : OK\n' else '3. nombre de créneaux : ECHEC → ' || v_n || E'\n' end;

  -- 3. réservation par A, puis B ne voit plus ce créneau et ne peut pas le prendre
  select min(s.slot_at) into v_first from public.available_slots(30) s where s.slot_at > now() + interval '3 days';
  begin
    perform public.book_appointment((enum_range(null::driver_application_type))[1], 'Test', 'Alpha', '+22900000001', null, v_first);
    out := out || E'4. A réserve un créneau : OK\n';
  exception when others then out := out || '4. A réserve : ECHEC → ' || sqlerrm || E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.available_slots(30) s where s.slot_at = v_first;
  out := out || case when v_n = 0 then E'5. B ne voit plus le créneau pris par A : OK\n' else E'5. créneau pris encore visible : ECHEC\n' end;

  begin
    perform public.book_appointment((enum_range(null::driver_application_type))[1], 'Test', 'Beta', '+22900000002', null, v_first);
    out := out || E'6. B réserve le même créneau : ECHEC (accepté)\n';
  exception when others then out := out || case when sqlerrm like '%plus disponible%' or sqlerrm like '%vient d''être réservé%' then E'6. B ne peut pas réserver le créneau pris : OK\n' else '6. message inattendu → ' || sqlerrm || E'\n' end; end;

  -- 4. horaire non proposé (03h00 un jour de semaine, ou un dimanche) refusé
  begin
    perform public.book_appointment((enum_range(null::driver_application_type))[1], 'Test', 'Beta', '+22900000002', null,
      (((now() at time zone 'Africa/Porto-Novo')::date + 10 - extract(dow from (now() at time zone 'Africa/Porto-Novo')::date + 10)::int + 3) + time '03:00') at time zone 'Africa/Porto-Novo');
    out := out || E'7. horaire non proposé : ECHEC (accepté)\n';
  exception when others then out := out || case when sqlerrm like '%plus disponible%' then E'7. horaire non proposé refusé : OK\n' else '7. message inattendu → ' || sqlerrm || E'\n' end; end;

  -- 5. bonne réservation de B sur un autre créneau
  select min(s.slot_at) into v_first from public.available_slots(30) s where s.slot_at > now() + interval '4 days';
  begin
    perform public.book_appointment((enum_range(null::driver_application_type))[1], 'Test', 'Beta', '+22900000002', null, v_first);
    out := out || E'8. B réserve un autre créneau : OK\n';
  exception when others then out := out || '8. B réserve : ECHEC → ' || sqlerrm || E'\n'; end;

  raise exception E'RESULTATS\n%', out;
end $$;
