-- Contrôles de sécurité (non-régression) : un client ne peut ni se créditer, ni falsifier son historique, ni modifier une course.
-- Usage : supabase db query --linked -f backend/tests/security_wallet_checks.sql --workdir backend  (résultat dans « RESULTATS », tout est annulé)
-- Attendu : 3. REFUSÉ ; 5/5b. REFUSÉ ; solde final = solde initial + 100000 SEULEMENT si payments_test_mode = 1.
do $$
declare
  c uuid; w uuid; rid uuid; prov text; v numeric; n int; v0 numeric;
  out text := '';
begin
  select (enum_range(null::mobile_money_provider))[1]::text into prov;
  select r.client_id, r.id into c, rid from public.rides r
   where exists (select 1 from public.wallets w where w.profile_id = r.client_id and w.kind = 'tamcar_credit')
   order by r.requested_at desc limit 1;
  select id, balance_fcfa into w, v0 from public.wallets where profile_id = c and kind = 'tamcar_credit';
  out := out || 'fournisseur testé=' || prov || ' ; solde initial=' || v0 || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status)
    values (w, 'topup', 500000, prov::mobile_money_provider, 'success');
    out := out || E'3. insert wallet_transactions topup 500000 success : ACCEPTÉ (historique falsifiable)\n';
  exception when others then out := out || '3. insert wallet_transactions : REFUSÉ (' || sqlerrm || E')\n'; end;

  begin
    perform public.topup_tamcar_credit(100000, prov::mobile_money_provider);
    out := out || E'4. topup_tamcar_credit(100000) : appel accepté\n';
  exception when others then out := out || '4. topup_tamcar_credit : REFUSÉ (' || sqlerrm || E')\n'; end;

  begin
    update public.rides set price_total_fcfa = 1, driver_share_fcfa = 1 where id = rid;
    get diagnostics n = row_count;
    out := out || '5. rides.price_total_fcfa=1 : lignes modifiées=' || n || E'\n';
  exception when others then out := out || '5. rides.price : REFUSÉ (' || sqlerrm || E')\n'; end;

  begin
    update public.rides set status = 'completed', ended_at = now() where id = rid;
    get diagnostics n = row_count;
    out := out || '5b. rides.status=completed par le client : lignes modifiées=' || n || E'\n';
  exception when others then out := out || '5b. rides.status : REFUSÉ (' || sqlerrm || E')\n'; end;

  reset role;
  select balance_fcfa into v from public.wallets where id = w;
  out := out || 'solde final (lu en postgres)=' || v || ' (écart ' || (v - v0) || E')\n';
  raise exception E'RESULTATS\n%', out;
end $$;
