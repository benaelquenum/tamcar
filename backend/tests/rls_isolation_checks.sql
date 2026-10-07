-- Isolation des données (RLS) en rôles réels : chacun ne voit que ses propres données ; un visiteur anonyme ne voit rien.
-- Usage : supabase db query --linked -f backend/tests/rls_isolation_checks.sql --workdir backend  (résultat dans « RESULTATS »)
do $$
declare
  c1 uuid; c2 uuid; d_prof uuid; adm uuid;
  n_total int; n_c1 int; n_seen int; n_other int;
  out text := '';
  t text;
begin
  select r.client_id into c1 from public.rides r group by r.client_id order by count(*) desc limit 1;
  select p.id into c2 from public.profiles p where p.role::text = 'client' and p.id <> c1 limit 1;
  select dr.profile_id into d_prof from public.drivers dr limit 1;
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select count(*) into n_total from public.rides;
  select count(*) into n_c1 from public.rides where client_id = c1;
  out := out || 'courses en base=' || n_total || ', du client 1=' || n_c1 || E'\n';

  foreach t in array array['rides', 'wallets', 'wallet_transactions', 'profiles', 'ride_messages', 'push_subscriptions',
                            'native_push_tokens', 'sos_alerts', 'driver_payouts', 'vehicle_rentals', 'subscriptions',
                            'trusted_contacts', 'terms_acceptances', 'client_favorite_places', 'program_rules', '_push_settings'] loop
    -- anonyme
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    begin
      execute format('select count(*) from public.%I', t) into n_seen;
      out := out || 'anon      ' || rpad(t, 24) || ' voit ' || n_seen || case when n_seen = 0 then ' OK' else ' *** FUITE' end || E'\n';
    exception when others then out := out || 'anon      ' || rpad(t, 24) || ' refusé (' || left(sqlerrm, 40) || E') OK\n'; end;
    reset role;
  end loop;

  -- client 1 : seulement ses courses ; client 2 : aucune de celles du client 1
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n_seen from public.rides;
  out := out || 'client 1 voit ' || n_seen || ' courses (attendu ' || n_c1 || ') ' || case when n_seen = n_c1 then 'OK' else '*** KO' end || E'\n';
  select count(*) into n_seen from public.wallets;
  select count(*) into n_other from public.wallets where profile_id <> c1;
  out := out || 'client 1 voit ' || n_seen || ' portefeuilles dont ' || n_other || ' à autrui ' || case when n_other = 0 then 'OK' else '*** FUITE' end || E'\n';
  select count(*) into n_other from public.profiles where id <> c1;
  out := out || 'client 1 voit ' || n_other || ' autres profils (les chauffeurs liés à ses courses peuvent apparaître)' || E'\n';
  select count(*) into n_other from public.program_rules;
  out := out || 'client 1 lit program_rules : ' || n_other || ' lignes ' || case when n_other = 0 then 'OK' else '*** FUITE' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n_seen from public.rides where client_id = c1;
  out := out || 'client 2 voit ' || n_seen || ' course(s) du client 1 ' || case when n_seen = 0 then 'OK' else '*** FUITE' end || E'\n';
  reset role;

  -- chauffeur : pas les portefeuilles des autres
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n_other from public.wallets where profile_id <> d_prof;
  out := out || 'chauffeur voit ' || n_other || ' portefeuille(s) à autrui ' || case when n_other = 0 then 'OK' else '*** FUITE' end || E'\n';
  reset role;

  -- admin : voit tout
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n_seen from public.rides;
  out := out || 'admin voit ' || n_seen || ' courses (attendu ' || n_total || ') ' || case when n_seen = n_total then 'OK' else '*** KO' end || E'\n';
  reset role;

  raise exception E'RESULTATS\n%', out;
end $$;
