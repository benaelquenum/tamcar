-- Réglages du programme chauffeur modifiables par l'admin : mode TEST des paiements, virements automatiques, durée TamAssur,
-- validations (0/1, durées, cotisation minimale) et refus pour un non-admin. Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/program_rules_admin.sql --workdir backend
do $$
declare
  out text := ''; adm uuid; drv uuid; msg text; v int;
begin
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select d.profile_id into drv from public.drivers d join public.profiles p on p.id = d.profile_id where p.role::text <> 'admin' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform public.admin_set_program_rule('payments_test_mode', 0);
  reset role;
  select value into v from public.program_rules where key = 'payments_test_mode';
  out := out || '1. payments_test_mode -> 0 : ' || v || case when v = 0 then ' OK' else ' *** KO' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_set_program_rule('payments_test_mode', 2); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '2. payments_test_mode = 2 : ' || msg || E'\n';

  perform public.admin_set_program_rule('tamassur_months_moto', 18);
  reset role;
  select value into v from public.program_rules where key = 'tamassur_months_moto';
  out := out || '3. tamassur_months_moto -> 18 : ' || v || case when v = 18 then ' OK' else ' *** KO' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_set_program_rule('tamassur_months_moto', 0); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '4. durée 0 mois : ' || msg || E'\n';
  begin perform public.admin_set_program_rule('tamassur_moto', 50); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '5. cotisation de 50 F : ' || msg || E'\n';
  perform public.admin_set_program_rule('tamassur_moto', 1000);
  perform public.admin_set_program_rule('versement_moto', 2500);
  out := out || '6. cotisation 1000 F et versement 2500 F : OK' || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_set_program_rule('payments_test_mode', 0); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '7. non-admin : ' || msg || E'\n';
  reset role;

  raise exception E'RESULTATS\n%', out;
end $$;
