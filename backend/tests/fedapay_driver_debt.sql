-- Règlement de dette chauffeur par FedaPay : initiation (transaction en attente), validation par le webhook (apply_fedapay_success),
-- réactivation automatique du compte suspendu, refus (pas de dette, montant trop grand, autre rôle, anonyme). Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/fedapay_driver_debt.sql --workdir backend
do $$
declare
  d_id uuid; d_prof uuid; c uuid; w_rev uuid;
  out text := ''; r record; v int; n int; st text; ref text; tx_id uuid;
begin
  select dr.id, dr.profile_id into d_id, d_prof from public.drivers dr where dr.status = 'active' limit 1;
  select r0.client_id into c from public.rides r0 where r0.client_id not in (select profile_id from public.drivers) limit 1;
  insert into public.wallets (profile_id, kind, balance_fcfa) values (d_prof, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
  select id into w_rev from public.wallets where profile_id = d_prof and kind::text = 'tamcar_revenus';
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);

  -- 1. aucune dette : refus
  update public.wallets set balance_fcfa = 0 where id = w_rev;
  set local role authenticated;
  begin perform public.initiate_fedapay_debt(1000); out := out || E'1. sans dette : acceptée *** KO\n';
  exception when others then out := out || '1. sans dette refusée : ' || sqlerrm || E' OK\n'; end;
  reset role;

  -- 2. dette de 6 000 F (compte suspendu automatiquement à -5 000 F)
  update public.wallets set balance_fcfa = -6000 where id = w_rev;
  select status::text into st from public.drivers where id = d_id;
  out := out || '2. dette 6000 F : statut du chauffeur=' || st || case when st = 'suspended' then ' OK (suspendu)' else ' (non suspendu)' end || E'\n';

  -- 3. montants refusés : trop petit, supérieur à la dette
  set local role authenticated;
  begin perform public.initiate_fedapay_debt(50); out := out || E'3a. 50 F : acceptée *** KO\n';
  exception when others then out := out || '3a. 50 F refusée : ' || sqlerrm || E' OK\n'; end;
  begin perform public.initiate_fedapay_debt(7000); out := out || E'3b. 7000 F pour 6000 F de dette : acceptée *** KO\n';
  exception when others then out := out || '3b. 7000 F refusée : ' || sqlerrm || E' OK\n'; end;

  -- 4. paiement partiel de 3 000 F : transaction en attente, solde inchangé
  select * into r from public.initiate_fedapay_debt(3000);
  ref := r.reference; tx_id := r.transaction_id;
  reset role;
  select status::text into st from public.wallet_transactions where id = tx_id;
  select balance_fcfa into v from public.wallets where id = w_rev;
  out := out || '4. initiation : référence=' || left(ref, 8) || '…, statut=' || st || ', solde=' || v
         || case when st = 'pending' and v = -6000 and ref like 'FDP-%' then ' OK (rien n''est crédité avant le webhook)' else ' *** KO' end || E'\n';

  -- 5. l'utilisateur ne peut pas se créditer lui-même ; le webhook (service_role) le peut
  set local role authenticated;
  begin perform public.apply_fedapay_success(ref, 'feda-test-1', 3000); out := out || E'5a. crédit par l''utilisateur *** KO\n';
  exception when others then out := out || '5a. crédit par l''utilisateur refusé OK' || E'\n'; end;
  reset role;
  set local role service_role;
  begin
    perform public.apply_fedapay_success(ref, 'feda-test-1', 2000);
    out := out || E'5b. montant incohérent accepté *** KO\n';
  exception when others then out := out || '5b. montant incohérent refusé : ' || left(sqlerrm, 40) || E' OK\n'; end;
  perform public.apply_fedapay_success(ref, 'feda-test-1', 3000);
  perform public.apply_fedapay_success(ref, 'feda-test-1', 3000);  -- rejeu du webhook : sans effet
  reset role;
  select balance_fcfa into v from public.wallets where id = w_rev;
  select status::text into st from public.wallet_transactions where id = tx_id;
  out := out || '5c. après webhook (rejoué deux fois) : solde=' || v || ', statut=' || st || case when v = -3000 and st = 'success' then ' OK (crédité une seule fois)' else ' *** KO' end || E'\n';

  -- 6. dette soldée : le compte suspendu est réactivé tout seul
  set local role authenticated;
  select * into r from public.initiate_fedapay_debt(3000);
  reset role;
  set local role service_role;
  perform public.apply_fedapay_success(r.reference, 'feda-test-2', 3000);
  reset role;
  select status::text into st from public.drivers where id = d_id;
  select balance_fcfa into v from public.wallets where id = w_rev;
  out := out || '6. dette soldée : solde=' || v || ', statut du chauffeur=' || st || case when v = 0 and st = 'active' then ' OK (réactivé)' else ' *** KO' end || E'\n';

  -- 7. paiement refusé par l'opérateur : la transaction passe en échec, solde inchangé
  update public.wallets set balance_fcfa = -2000 where id = w_rev;
  set local role authenticated;
  select * into r from public.initiate_fedapay_debt(2000);
  reset role;
  set local role service_role;
  perform public.apply_fedapay_declined(r.reference, 'feda-test-3');
  reset role;
  select status::text into st from public.wallet_transactions where fedapay_reference = r.reference;
  select balance_fcfa into v from public.wallets where id = w_rev;
  out := out || '7. paiement refusé : statut=' || st || ', solde=' || v || case when st = 'failed' and v = -2000 then ' OK' else ' *** KO' end || E'\n';

  -- 7b. refusé PUIS approuvé (second essai dans la fenêtre FedaPay) : le crédit est bien appliqué, une seule fois
  set local role authenticated;
  select * into r from public.initiate_fedapay_debt(2000);
  reset role;
  set local role service_role;
  perform public.apply_fedapay_declined(r.reference, 'feda-test-4');
  perform public.apply_fedapay_success(r.reference, 'feda-test-4', 2000);
  perform public.apply_fedapay_success(r.reference, 'feda-test-4', 2000);
  reset role;
  select status::text into st from public.wallet_transactions where fedapay_reference = r.reference;
  select balance_fcfa into v from public.wallets where id = w_rev;
  out := out || '7b. refusé puis approuvé : statut=' || st || ', solde=' || v || case when st = 'success' and v = 0 then ' OK (crédité une fois)' else ' *** KO' end || E'
';

  -- 8. un client (non chauffeur) et un anonyme ne peuvent pas utiliser cette fonction
  if c is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform public.initiate_fedapay_debt(1000); out := out || E'8a. client non chauffeur : acceptée *** KO\n';
    exception when others then out := out || '8a. client non chauffeur refusé : ' || sqlerrm || E' OK\n'; end;
    reset role;
  end if;
  set local role anon;
  begin perform public.initiate_fedapay_debt(1000); out := out || E'8b. anonyme : acceptée *** KO\n';
  exception when others then out := out || '8b. anonyme refusé OK' || E'\n'; end;
  reset role;

  raise exception E'RESULTATS\n%', out;
end $$;
