-- Paiement Mobile Money FeexPay (côté base) : réglage payments_provider, payments_config(), « prise » d'une transaction (une seule
-- demande de paiement par référence), enregistrement de l'opérateur, crédit idempotent avec montant vérifié, droits.
-- Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/feexpay_payments.sql --workdir backend
do $$
declare
  out text := ''; adm uuid; usr uuid; msg text; n int; v0 int; v1 int; ok boolean; ref text; txid uuid; w uuid;
  cfg record; meta jsonb; prov text; st text;
begin
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select p.id into usr from public.profiles p where p.role::text <> 'admin' and exists (select 1 from public.drivers d where d.profile_id = p.id) limit 1;
  if usr is null then select id into usr from public.profiles where role::text <> 'admin' limit 1; end if;

  -- 1. le réglage se pilote par l'admin (0/1 seulement), pas par un non-admin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_program_rule('payments_provider', 1);
  begin perform public.admin_set_program_rule('payments_provider', 2); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '1a. payments_provider = 2 : ' || msg || E'\n';
  reset role;
  select value into v1 from public.program_rules where key = 'payments_provider';
  out := out || '1b. payments_provider -> 1 : ' || v1 || case when v1 = 1 then ' OK' else ' *** KO' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_set_program_rule('payments_provider', 0); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '1c. non-admin : ' || msg || E'\n';

  -- 2. payments_config() lisible par un utilisateur connecté
  select * into cfg from public.payments_config();
  out := out || '2. payments_config : feexpay=' || cfg.feexpay || ' test_mode=' || cfg.test_mode || case when cfg.feexpay then ' OK' else ' *** KO' end || E'\n';

  -- 3. une recharge « en attente » (montant figé en base)
  select reference, transaction_id into ref, txid from public.initiate_fedapay_topup(1500);
  reset role;
  select wallet_id into w from public.wallet_transactions where id = txid;
  select balance_fcfa into v0 from public.wallets where id = w;
  out := out || '3. recharge créée : ' || ref || ' (portefeuille ' || v0 || ' F)' || case when ref ~ '^FDP-[0-9a-f]{32}$' then ' OK' else ' *** KO' end || E'\n';

  -- 4. « prise » : le premier appel gagne, le second non (jamais deux demandes de paiement)
  select public.feexpay_claim_payin(ref) into ok;
  out := out || '4a. première prise : ' || ok || case when ok then ' OK' else ' *** KO' end || E'\n';
  select public.feexpay_claim_payin(ref) into ok;
  out := out || '4b. seconde prise : ' || ok || case when not ok then ' OK (refusée)' else ' *** KO' end || E'\n';

  -- 5. enregistrement de l'opérateur et de l'identifiant FeexPay (jamais le numéro entier)
  perform public.feexpay_record_payin(ref, 'feex-ref-123', 'mtn', '0000');
  select fedapay_transaction_id, wallet_transactions.meta into prov, meta from public.wallet_transactions where fedapay_reference = ref;
  out := out || '5. identifiant=' || prov || ' meta=' || meta::text
         || case when prov = 'feex-ref-123' and meta ->> 'network' = 'mtn' and meta ->> 'phone_last4' = '0000' and meta ->> 'provider' = 'feexpay' then ' OK' else ' *** KO' end || E'\n';

  -- 6. crédit : montant incohérent refusé, montant exact crédité une seule fois
  begin perform public.apply_fedapay_success(ref, 'feex-ref-123', 999); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '6a. montant 999 au lieu de 1500 : ' || msg || E'\n';
  perform public.apply_fedapay_success(ref, 'feex-ref-123', 1500);
  perform public.apply_fedapay_success(ref, 'feex-ref-123', 1500);
  select balance_fcfa into v1 from public.wallets where id = w;
  out := out || '6b. crédit (rejoué deux fois) : ' || v0 || ' -> ' || v1 || case when v1 = v0 + 1500 then ' OK (une seule fois)' else ' *** KO' end || E'\n';
  select status::text into st from public.wallet_transactions where fedapay_reference = ref;
  out := out || '6c. statut : ' || st || case when st = 'success' then ' OK' else ' *** KO' end || E'\n';

  -- 7. un paiement refusé ne crédite rien
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select reference into ref from public.initiate_fedapay_topup(2000);
  reset role;
  perform public.feexpay_claim_payin(ref);
  perform public.apply_fedapay_declined(ref, 'feex-ref-456');
  select balance_fcfa into v0 from public.wallets where id = w;
  select status::text into st from public.wallet_transactions where fedapay_reference = ref;
  out := out || '7. paiement refusé : statut=' || st || ', solde=' || v0 || case when st = 'failed' and v0 = v1 then ' OK (rien crédité)' else ' *** KO' end || E'\n';

  -- 8. les fonctions de « prise » et d'enregistrement ne sont pas appelables depuis l'application
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.feexpay_claim_payin(ref); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '8a. feexpay_claim_payin par un utilisateur : ' || msg || E'\n';
  begin perform public.feexpay_record_payin(ref, 'x', 'mtn', '0000'); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '8b. feexpay_record_payin par un utilisateur : ' || msg || E'\n';
  begin perform public.apply_fedapay_success(ref, 'x', 2000); msg := 'accepté *** KO';
  exception when others then msg := 'refusé (' || sqlerrm || ') OK'; end;
  out := out || '8c. apply_fedapay_success par un utilisateur : ' || msg || E'\n';
  reset role;

  -- 9. la source « pay » est acceptée dans les traces de paiement
  insert into public.payment_events (source, provider, reference, outcome, detail) values ('pay', 'feexpay', ref, 'pending', 'test');
  select count(*) into n from public.payment_events where source = 'pay' and reference = ref;
  out := out || '9. trace source pay : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';

  raise exception E'RESULTATS\n%', out;
end $$;
