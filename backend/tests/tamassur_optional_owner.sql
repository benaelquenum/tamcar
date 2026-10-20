-- TamAssur facultatif pour les chauffeurs propriétaires ; tricycle à 2 ans (2026-10-21). Rôles réels, tout est annulé.
-- Usage : bash runtest.sh tamassur_optional_owner
do $$
declare
  out text := ''; own record; ces record; adm uuid; p date := (now() at time zone 'Africa/Porto-Novo')::date + 3;
  j jsonb; n int; err text; pl record; st record; ep int; rev int; alerts0 int; alerts1 int; trk record;
begin
  select d.id as did, d.profile_id as pid into own from public.drivers d where d.application_type::text = 'proprietaire' and d.status::text = 'active' order by d.id limit 1;
  select d.id as did, d.profile_id as pid into ces from public.drivers d where d.application_type::text = 'cession' and d.status::text in ('active', 'suspended') and d.current_vehicle_id is not null order by d.id limit 1;
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  if extract(dow from p) = 0 then p := p + 1; end if;
  delete from public.driver_insurance_charges where period = p;
  update public.drivers set tamassur_enrolled = false where id = own.did;

  -- 1. propriétaire non adhérent : aucune cotisation
  j := public.charge_driver_insurance(p);
  select count(*) into n from public.driver_insurance_charges where driver_id = own.did and period = p;
  out := out || '1. propriétaire non adhérent : ' || n || ' prélèvement le ' || p || case when n = 0 then ' OK' else ' *** KO' end || E'\n';

  -- 2. aperçu du plan côté chauffeur : facultatif, non adhérent
  perform set_config('request.jwt.claims', json_build_object('sub', own.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into pl from public.my_tamassur_plan();
  reset role;
  out := out || '2. plan : facultatif=' || pl.optional || ', adhérent=' || pl.enrolled || case when pl.optional and not pl.enrolled then ' OK' else ' *** KO' end || E'\n';

  -- 3. adhésion : cotisation dès le prochain passage
  perform set_config('request.jwt.claims', json_build_object('sub', own.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_my_tamassur_enrollment(true);
  select * into pl from public.my_tamassur_plan();
  reset role;
  j := public.charge_driver_insurance(p);
  select count(*) into n from public.driver_insurance_charges where driver_id = own.did and period = p and status = 'paid';
  out := out || '3. après adhésion : adhérent=' || pl.enrolled || ', ' || n || ' prélèvement' || case when pl.enrolled and n = 1 then ' OK' else ' *** KO' end || E'\n';

  -- 4. retrait : plus de prélèvement le jour suivant, alerte si de l'épargne est constituée
  select coalesce(max(balance_fcfa), 0) into ep from public.wallets where profile_id = own.pid and kind::text = 'tamcar_epargne';
  select count(*) into alerts0 from public.admin_alerts where kind = 'tamassur_exit';
  perform set_config('request.jwt.claims', json_build_object('sub', own.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_my_tamassur_enrollment(false);
  reset role;
  select count(*) into alerts1 from public.admin_alerts where kind = 'tamassur_exit';
  j := public.charge_driver_insurance(p + 1 + (case when extract(dow from p + 1) = 0 then 1 else 0 end));
  select count(*) into n from public.driver_insurance_charges where driver_id = own.did and period > p;
  out := out || '4. après retrait : ' || n || ' prélèvement ensuite, épargne ' || ep || ' F, alertes ' || alerts0 || ' -> ' || alerts1
         || case when n = 0 and ((ep > 0 and alerts1 = alerts0 + 1) or (ep = 0 and alerts1 = alerts0)) then ' OK' else ' *** KO' end || E'\n';

  -- 5. un chauffeur en Cession ne peut pas se retirer de TamAssur
  err := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', ces.pid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.set_my_tamassur_enrollment(false);
  exception when others then err := sqlerrm; end;
  reset role;
  out := out || '5. retrait en Cession : ' || coalesce(err, '*** aucune erreur') || case when err like '%obligatoire%' then ' OK' else ' *** KO' end || E'\n';

  -- 6. plan d'un chauffeur en Cession : obligatoire
  perform set_config('request.jwt.claims', json_build_object('sub', ces.pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into pl from public.my_tamassur_plan();
  reset role;
  out := out || '6. plan en Cession : facultatif=' || pl.optional || ', adhérent=' || pl.enrolled || case when not pl.optional and pl.enrolled then ' OK' else ' *** KO' end || E'\n';

  -- 7. prélèvement du 20 octobre annulé sur les propriétaires non adhérents
  select count(*) into n from public.driver_insurance_charges c join public.drivers d on d.id = c.driver_id
   where c.period = date '2026-10-20' and d.application_type::text = 'proprietaire' and c.status = 'paid' and not d.tamassur_enrolled;
  out := out || '7. cotisations du 20/10 encore dues par des non-adhérents : ' || n || case when n = 0 then ' OK' else ' *** KO' end || E'\n';

  -- 8. tricycle : contrat de 2 ans, premier palier = terme = 500 000 F
  update public.vehicles set category = 'tricycle', contract_months = null where id = (select current_vehicle_id from public.drivers where id = ces.did);
  select public._contract_months(ces.did) as cm, public._tamassur_months(ces.did) as first, public._tamassur_term_goal(ces.did) as term_goal into trk;
  out := out || '8. tricycle : contrat ' || trk.cm || ' mois, premier palier ' || trk.first || ' mois, garantie au terme ' || trk.term_goal || ' F'
         || case when trk.cm = 24 and trk.first = 24 and trk.term_goal = 500000 then ' OK' else ' *** KO' end || E'\n';

  raise exception 'RESULTATS%', E'\n' || out;
end $$;
