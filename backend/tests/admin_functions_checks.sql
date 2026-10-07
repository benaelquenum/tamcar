-- Contrôles des fonctions d'administration (approbation d'un candidat chauffeur, avances partenaires) en rôle admin réel.
-- Usage : supabase db query --linked -f backend/tests/admin_functions_checks.sql --workdir backend  (résultat dans « RESULTATS », tout est annulé)
do $$
declare
  adm uuid;
  cand uuid; app uuid; dl uuid; adv uuid; atype text;
  out text := '';
begin
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  -- candidat : un client existant qui n'est pas chauffeur
  select p.id into cand from public.profiles p
   where p.role::text = 'client' and not exists (select 1 from public.drivers d where d.profile_id = p.id) limit 1;
  select (enum_range(null::driver_application_type))[1]::text into atype;
  insert into public.driver_appointments (profile_id, application_type, first_name, last_name, phone, slot_at, status)
  values (cand, atype::driver_application_type, 'Test', 'Candidat', '+22900000000', now() + interval '1 day', 'scheduled')
  returning id into app;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. approbation du candidat par l'admin
  begin
    perform public.admin_approve_appointment(app, 'Société Test', null, 'ZZ0001TT', 'Toyota', 'Corolla', 2015, 'Gris', 4, 'essentiel', 'test');
    out := out || E'1. admin_approve_appointment : OK\n';
  exception when others then out := out || '1. admin_approve_appointment : ECHEC → ' || sqlerrm || E'\n'; end;

  -- 2. avance partenaire : création puis remboursement
  select id into dl from public.dealer_partners limit 1;
  begin
    perform public.create_dealer_advance(dl, 100000);
    out := out || E'2. create_dealer_advance : OK\n';
  exception when others then out := out || '2. create_dealer_advance : ECHEC → ' || sqlerrm || E'\n'; end;

  reset role;
  select id into adv from public.dealer_advances order by created_at desc limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if adv is not null then
    begin
      perform public.admin_refund_dealer_advance(adv);
      out := out || E'3. admin_refund_dealer_advance : OK\n';
    exception when others then out := out || '3. admin_refund_dealer_advance : ECHEC → ' || sqlerrm || E'\n'; end;
  else
    out := out || E'3. admin_refund_dealer_advance : non testé (aucune avance créée)\n';
  end if;

  reset role;
  raise exception E'RESULTATS\n%', out;
end $$;
