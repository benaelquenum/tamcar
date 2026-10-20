-- TamAssur : épargne garantie par paliers annuels alignée sur la durée du contrat (2026-10-20). Rôles réels, tout est annulé.
-- Usage : bash runtest.sh tamassur_ladder
create or replace function pg_temp.st(p_profile uuid, p_ep int, p_rev int) returns text language plpgsql as $f$
declare r record;
begin
  update public.wallets set balance_fcfa = p_ep where profile_id = p_profile and kind::text = 'tamcar_epargne';
  update public.wallets set balance_fcfa = p_rev where profile_id = p_profile and kind::text = 'tamcar_revenus';
  perform set_config('request.jwt.claims', json_build_object('sub', p_profile, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.my_tamassur_withdrawal_status();
  reset role;
  return r.reason || '|' || r.months || '|' || r.goal_fcfa || '|' || coalesce(r.eligible_on::text, '-') || '|' || r.term_months || '|' || r.term_goal_fcfa || '|' || r.withdrawn_fcfa;
end $f$;

do $$
declare
  out text := ''; d record; today date := (now() at time zone 'Africa/Porto-Novo')::date; s text; adm uuid; err text; w public.tamassur_withdrawals; j record; okb boolean;
begin
  select dr.id as did, dr.profile_id as pid, dr.current_vehicle_id as vid into d
    from public.drivers dr join public.vehicles v on v.id = dr.current_vehicle_id
   where dr.status::text = 'active' and v.category::text = 'essentiel' and v.dealer_partner_id is not null
   order by dr.created_at limit 1;
  if d.did is null then raise exception 'Aucun chauffeur Essentiel de partenaire pour tester'; end if;
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  insert into public.wallets (profile_id, kind, balance_fcfa) values (d.pid, 'tamcar_epargne', 0), (d.pid, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
  delete from public.tamassur_withdrawals where driver_id = d.did;
  update public.vehicles set contract_months = null where id = d.vid;
  delete from public.driver_insurance_charges where driver_id = d.did;
  insert into public.driver_insurance_charges (driver_id, period, amount_fcfa, collected_fcfa, saved_fcfa, status, collected_at)
  values (d.did, (today - interval '10 months')::date, 1000, 1000, 834, 'paid', now());

  -- 1. Essentiel (contrat 36 mois), 10 mois écoulés : trop tôt, premier palier à 24 mois pour 500 000 F
  s := pg_temp.st(d.pid, 90000, 0);
  out := out || '1. Essentiel à 10 mois : ' || s || case when s = 'too_early|24|500000|' || ((today - interval '10 months')::date + interval '24 months')::date || '|36|750000|0' then ' OK' else ' *** KO' end || E'\n';

  -- 2. 25 mois : palier de 24 mois atteint (500 000 F), selon l'épargne et la dette
  update public.driver_insurance_charges set period = (today - interval '25 months')::date where driver_id = d.did;
  s := pg_temp.st(d.pid, 500400, 0);
  out := out || '2a. 25 mois, épargne 500 400 : ' || s || case when s like 'ok|24|500000|%|36|750000|0' then ' OK' else ' *** KO' end || E'\n';
  s := pg_temp.st(d.pid, 100000, 0);
  out := out || '2b. épargne 100 000 : ' || s || case when s like 'below_goal|24|500000|%' then ' OK' else ' *** KO' end || E'\n';
  s := pg_temp.st(d.pid, 500400, -500);
  out := out || '2c. dette de 500 F : ' || s || case when s like 'in_arrears|24|500000|%' then ' OK' else ' *** KO' end || E'\n';

  -- 3. Premier retrait de 500 400 F : le palier suivant (36 mois) s'ouvre 12 mois plus tard, pour 249 600 F
  insert into public.tamassur_withdrawals (driver_id, amount_fcfa, status, requested_at) values (d.did, 500400, 'paid', now());
  s := pg_temp.st(d.pid, 0, 0);
  out := out || '3. après retrait de 500 400 F, à 25 mois : ' || s
         || case when s = 'too_early|36|249600|' || ((today - interval '25 months')::date + interval '36 months')::date || '|36|750000|500400' then ' OK' else ' *** KO' end || E'\n';

  -- 4. 37 mois : palier de 36 mois, 249 600 F de plus
  update public.driver_insurance_charges set period = (today - interval '37 months')::date where driver_id = d.did;
  s := pg_temp.st(d.pid, 250200, 0);
  out := out || '4. 37 mois, épargne 250 200 : ' || s || case when s like 'ok|36|249600|%|36|750000|500400' then ' OK' else ' *** KO' end || E'\n';

  -- 5. Sans retrait au palier de 24 mois : attendre 36 mois et tout retirer (750 000 F)
  delete from public.tamassur_withdrawals where driver_id = d.did;
  s := pg_temp.st(d.pid, 750600, 0);
  out := out || '5. attente jusqu''à 37 mois, épargne 750 600 : ' || s || case when s like 'ok|36|750000|%|36|750000|0' then ' OK' else ' *** KO' end || E'\n';

  -- 6. Tout retiré au terme : fini
  insert into public.tamassur_withdrawals (driver_id, amount_fcfa, status) values (d.did, 750600, 'paid');
  s := pg_temp.st(d.pid, 0, 0);
  out := out || '6. tout retiré : ' || s || case when s like 'completed|36|%|36|750000|750600' then ' OK' else ' *** KO' end || E'\n';
  delete from public.tamassur_withdrawals where driver_id = d.did;

  -- 7. Véhicule hors cadre (contrat de 30 mois) : un seul retrait, au terme, proportionnel (625 000 F)
  update public.vehicles set contract_months = 30 where id = d.vid;
  update public.driver_insurance_charges set period = (today - interval '29 months')::date where driver_id = d.did;
  s := pg_temp.st(d.pid, 600000, 0);
  out := out || '7a. contrat de 30 mois, à 29 mois : ' || s || case when s like 'too_early|30|625000|%|30|625000|0' then ' OK' else ' *** KO' end || E'\n';
  update public.driver_insurance_charges set period = (today - interval '31 months')::date where driver_id = d.did;
  s := pg_temp.st(d.pid, 625400, 0);
  out := out || '7b. à 31 mois, épargne 625 400 : ' || s || case when s like 'ok|30|625000|%|30|625000|0' then ' OK' else ' *** KO' end || E'\n';

  -- 8. Confort (contrat de 48 mois) : paliers à 24, 36, 48 ; terme à 1 000 000 F
  update public.vehicles set contract_months = null, category = 'confort' where id = d.vid;
  update public.driver_insurance_charges set period = (today - interval '49 months')::date where driver_id = d.did;
  s := pg_temp.st(d.pid, 1000800, 0);
  out := out || '8. Confort à 49 mois, épargne 1 000 800 : ' || s || case when s like 'ok|48|1000000|%|48|1000000|0' then ' OK' else ' *** KO' end || E'\n';

  -- 9. Moto (contrat de 12 mois) : un seul palier de 250 000 F
  update public.vehicles set category = 'moto' where id = d.vid;
  update public.driver_insurance_charges set period = (today - interval '13 months')::date where driver_id = d.did;
  s := pg_temp.st(d.pid, 250200, 0);
  out := out || '9a. moto à 13 mois : ' || s || case when s like 'ok|12|250000|%|12|250000|0' then ' OK' else ' *** KO' end || E'\n';

  -- 10. Demande de retrait : montant versé, puis plus rien à demander
  perform set_config('request.jwt.claims', json_build_object('sub', d.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  w := public.request_tamassur_withdrawal(null);
  reset role;
  update public.tamassur_withdrawals set status = 'paid' where id = w.id;
  s := pg_temp.st(d.pid, 0, 0);
  out := out || '10a. demande de retrait : ' || w.amount_fcfa || ' F, ensuite ' || s || case when w.amount_fcfa = 250200 and s like 'completed|12|%' then ' OK' else ' *** KO' end || E'\n';
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', d.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.request_tamassur_withdrawal(null);
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '10b. nouvelle demande : ' || coalesce(err, '*** aucune erreur') || case when err like '%garantie%retiree%' then ' OK' else ' *** KO' end || E'\n';

  -- 11. calculateur décès / invalidité : garantie et durée au terme du contrat
  update public.vehicles set category = 'essentiel' where id = d.vid;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into j from public.admin_tamassur_death_calc(d.did, null);
  reset role;
  out := out || '11. décès / invalidité : garantie au terme ' || j.guarantee_at_term_fcfa || ' F sur ' || j.term_months || ' mois'
         || case when j.guarantee_at_term_fcfa = 750000 and j.term_months = 36 then ' OK' else ' *** KO' end || E'\n';

  -- 12. accès : les fonctions internes ne sont pas ouvertes aux comptes connectés
  select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) into okb
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('_tamassur_standard', '_tamassur_months', '_tamassur_term_goal', '_tamassur_withdrawn');
  out := out || '12. fonctions internes ouvertes aux comptes connectés : ' || okb || case when not okb then ' OK' else ' *** KO' end || E'\n';

  raise exception 'RESULTATS%', E'\n' || out;
end $$;
