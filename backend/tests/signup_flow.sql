-- Inscription d'un nouveau compte : le profil (rôle client) et les portefeuilles sont créés automatiquement ; le nouveau client peut
-- lire son profil, ses portefeuilles, accepter les CGU, et ne voit rien d'autre. Tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/signup_flow.sql --workdir backend  (résultat dans « RESULTATS »)
do $$
declare
  uid uuid := gen_random_uuid();
  out text := '';
  n int; r text; k text;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test.inscription@example.invalid',
          '{"full_name": "Test Inscription"}'::jsonb, now(), now(), now());

  select role::text into r from public.profiles where id = uid;
  out := out || '1. profil créé automatiquement : rôle=' || coalesce(r, 'ABSENT') || case when r = 'client' then ' OK' else ' *** KO' end || E'\n';
  select string_agg(kind::text, ',' order by kind::text) into k from public.wallets where profile_id = uid;
  out := out || '2. portefeuilles : ' || coalesce(k, 'aucun') || case when k = 'tamcar_credit' then ' OK (crédit seulement pour un client)' else ' *** à vérifier' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles;
  out := out || '3. le nouveau client voit ' || n || ' profil(s) (attendu 1, le sien) ' || case when n = 1 then 'OK' else '*** KO' end || E'\n';
  select count(*) into n from public.rides;
  out := out || '4. courses visibles : ' || n || case when n = 0 then ' OK' else ' *** FUITE' end || E'\n';
  begin
    update public.profiles set role = 'admin' where id = uid;
    out := out || E'5. auto-promotion admin : ACCEPTÉE *** KO\n';
  exception when others then out := out || '5. auto-promotion admin refusée OK' || E'\n'; end;
  begin
    perform public.get_or_create_my_referral_code();
    out := out || E'6. code de parrainage : OK\n';
  exception when others then out := out || '6. code de parrainage ECHEC : ' || sqlerrm || E'\n'; end;
  begin
    perform public.my_wallets();
    perform public.wallet_transactions_for_user(10);
    perform public.my_active_ride();
    perform public.my_bookings();
    out := out || E'7. lectures de base (portefeuilles, historique, course active, réservations) : OK\n';
  exception when others then out := out || '7. lectures de base ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;

  raise exception E'RESULTATS\n%', out;
end $$;
