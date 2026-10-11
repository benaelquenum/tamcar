-- Changement de catégorie / déclassement d'une course en recherche : le prix est recalculé, MAIS aucun argent n'est créé ni prélevé
-- (le TamCar Crédit n'est débité qu'à la fin de la course). Avant la correction, Confort -> Moto offrait la différence en crédit.
-- Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/category_switch_no_credit.sql --workdir backend
do $$
declare
  c uuid; r public.rides; r2 public.rides; out text := ''; b0 int; b1 int; n int; msg text;
  plat double precision := 6.4969; plng double precision := 2.6283;
begin
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  insert into public.wallets (profile_id, kind, balance_fcfa) values (c, 'tamcar_credit', 0) on conflict (profile_id, kind) do nothing;
  select balance_fcfa into b0 from public.wallets where profile_id = c and kind = 'tamcar_credit';

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.create_ride('confort', plat, plng, 'Départ test', 6.5100, 2.6000, 'Arrivée test', 8.0, 20);
  reset role;
  out := out || '1. course Confort en espèces : prix=' || r.price_total_fcfa || ' paiement=' || r.payment_method || E'\n';

  -- 2. déclassement Confort -> Essentiel : le prix baisse, le portefeuille ne bouge pas
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.client_accept_downgrade(r.id);
  reset role;
  select balance_fcfa into b1 from public.wallets where profile_id = c and kind = 'tamcar_credit';
  select count(*) into n from public.wallet_transactions where ride_id = r.id;
  out := out || '2. déclassement Confort -> Essentiel : prix ' || r.price_total_fcfa || ' -> ' || r2.price_total_fcfa || ', portefeuille ' || b0 || ' -> ' || b1
         || ', mouvements=' || n || case when r2.price_total_fcfa < r.price_total_fcfa and b1 = b0 and n = 0 then ' OK (aucun crédit offert)' else ' *** KO' end || E'\n';

  -- 3. changement vers Moto (moins cher) : même chose
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.client_switch_category(r.id, 'moto');
  reset role;
  select balance_fcfa into b1 from public.wallets where profile_id = c and kind = 'tamcar_credit';
  select count(*) into n from public.wallet_transactions where ride_id = r.id;
  out := out || '3. changement vers Moto : prix -> ' || r2.price_total_fcfa || ' catégorie=' || r2.requested_category || ', portefeuille ' || b0 || ' -> ' || b1
         || ', mouvements=' || n || case when b1 = b0 and n = 0 and r2.requested_category::text = 'moto' then ' OK (aucun crédit offert)' else ' *** KO' end || E'\n';

  -- 4. retour vers Confort (plus cher) en espèces : le portefeuille n'est pas débité non plus
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r2 := public.client_switch_category(r.id, 'confort');
  reset role;
  select balance_fcfa into b1 from public.wallets where profile_id = c and kind = 'tamcar_credit';
  select count(*) into n from public.wallet_transactions where ride_id = r.id;
  out := out || '4. retour vers Confort (espèces) : prix -> ' || r2.price_total_fcfa || ', portefeuille ' || b0 || ' -> ' || b1
         || ', mouvements=' || n || case when b1 = b0 and n = 0 then ' OK (rien prélevé)' else ' *** KO' end || E'\n';

  -- 5. le client d'un autre compte ne peut pas toucher cette course
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where id <> c and role::text = 'client' limit 1), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.client_switch_category(r.id, 'moto'); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  reset role;
  out := out || '5. course d''un autre client : ' || msg || E'\n';

  raise exception E'RESULTATS\n%', out;
end $$;
