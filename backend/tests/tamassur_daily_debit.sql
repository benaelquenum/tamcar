-- Prélèvement quotidien TamAssur : 1 000 F par jour pour TOUS les véhicules, du lundi au samedi, jamais le dimanche, solde négatif accepté
-- (c'est ce qui pousse le chauffeur à recharger pour payer commissions ET cotisation), idempotent, suspension à -5 000 F.
-- L'activation réelle est différée (réglage tamassur_debit_from) : le test la ramène au passé le temps de la transaction, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/tamassur_daily_debit.sql --workdir backend
do $$
declare
  out text := ''; rc record; r jsonb; v0 int; v1 int; e0 int; e1 int; n int; st text; d_prof uuid;
  tue date := date '2026-10-06';  -- un mardi
  sun date := date '2026-10-04';  -- un dimanche
begin
  update public._push_settings set value = '2020-01-01' where key = 'tamassur_debit_from';

  -- 1. un chauffeur de chaque catégorie : débit de 1 000 F sur Revenus, crédit de 1 000 F sur Épargne
  for rc in
    select distinct on (v.category) v.category::text as cat, d.id as did, d.profile_id as pid
      from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.tamassur_fcfa is null order by v.category, d.id
  loop
    insert into public.wallets (profile_id, kind, balance_fcfa) values (rc.pid, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
    insert into public.wallets (profile_id, kind, balance_fcfa) values (rc.pid, 'tamcar_epargne', 0) on conflict (profile_id, kind) do nothing;
    delete from public.driver_insurance_charges where driver_id = rc.did and period in (tue, sun);
    update public.wallets set balance_fcfa = 3000 where profile_id = rc.pid and kind::text = 'tamcar_revenus';
    update public.wallets set balance_fcfa = 0 where profile_id = rc.pid and kind::text = 'tamcar_epargne';
  end loop;

  r := public.charge_driver_insurance(tue);
  out := out || '1. mardi : ' || r::text || E'\n';
  for rc in
    select distinct on (v.category) v.category::text as cat, d.id as did, d.profile_id as pid
      from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.tamassur_fcfa is null order by v.category, d.id
  loop
    select balance_fcfa into v1 from public.wallets where profile_id = rc.pid and kind::text = 'tamcar_revenus';
    select balance_fcfa into e1 from public.wallets where profile_id = rc.pid and kind::text = 'tamcar_epargne';
    out := out || '   ' || rc.cat || ' : Revenus 3000 -> ' || v1 || ', Épargne 0 -> ' || e1
           || case when v1 = 2000 and e1 = 1000 then ' OK (1 000 F)' else ' *** KO' end || E'\n';
  end loop;

  -- 2. rejouer le même jour : aucun second prélèvement
  r := public.charge_driver_insurance(tue);
  select count(*) into n from public.driver_insurance_charges where period = tue and status = 'paid';
  out := out || '2. rejeu du mardi : ' || r::text || ' ; lignes payées pour ce jour=' || n || E'\n';
  select balance_fcfa into v1 from public.wallets w join public.drivers d on d.profile_id = w.profile_id join public.vehicles v on v.id = d.current_vehicle_id
   where v.category::text = 'moto' and w.kind::text = 'tamcar_revenus' and d.tamassur_fcfa is null and d.status = 'active' limit 1;
  out := out || '   solde Revenus du chauffeur moto après le rejeu : ' || coalesce(v1::text, '?') || case when v1 = 2000 then ' OK (pas de double prélèvement)' else ' *** KO' end || E'\n';

  -- 3. dimanche : aucun prélèvement
  r := public.charge_driver_insurance(sun);
  out := out || '3. dimanche : ' || r::text || case when r ->> 'skipped' = 'sunday' then ' OK' else ' *** KO' end || E'\n';

  -- 4. solde insuffisant : le prélèvement est ferme, le solde devient négatif, l'épargne est créditée
  select d.profile_id into d_prof from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id where v.category::text = 'moto' and d.status = 'active' and d.tamassur_fcfa is null limit 1;
  update public.wallets set balance_fcfa = 200 where profile_id = d_prof and kind::text = 'tamcar_revenus';
  delete from public.driver_insurance_charges where driver_id = (select id from public.drivers where profile_id = d_prof) and period = date '2026-10-07';
  r := public.charge_driver_insurance(date '2026-10-07');
  select balance_fcfa into v1 from public.wallets where profile_id = d_prof and kind::text = 'tamcar_revenus';
  select balance_fcfa into e1 from public.wallets where profile_id = d_prof and kind::text = 'tamcar_epargne';
  out := out || '4. solde 200 F : Revenus -> ' || v1 || ', Épargne -> ' || e1 || case when v1 = -800 and e1 = 2000 then ' OK (négatif accepté, épargne créditée)' else ' *** KO' end || E'\n';

  -- 5. endettement : suspension automatique à -5 000 F, réactivation dès que le solde remonte
  update public.wallets set balance_fcfa = -4500 where profile_id = d_prof and kind::text = 'tamcar_revenus';
  select status::text into st from public.drivers where profile_id = d_prof;
  out := out || '5a. solde -4 500 F : statut=' || st || E'\n';
  update public.wallets set balance_fcfa = -5200 where profile_id = d_prof and kind::text = 'tamcar_revenus';
  select status::text into st from public.drivers where profile_id = d_prof;
  out := out || '5b. solde -5 200 F : statut=' || st || case when st = 'suspended' then ' OK (suspendu)' else ' *** KO' end || E'\n';
  update public.wallets set balance_fcfa = -1000 where profile_id = d_prof and kind::text = 'tamcar_revenus';
  select status::text into st from public.drivers where profile_id = d_prof;
  out := out || '5c. après recharge (-1 000 F) : statut=' || st || case when st = 'active' then ' OK (réactivé tout seul)' else ' *** KO' end || E'\n';

  -- 6. le travail planifié existe et tourne chaque soir
  select count(*) into n from cron.job where command ilike '%charge_driver_insurance%' and active;
  out := out || '6. tâche planifiée active : ' || n || case when n >= 1 then ' OK' else ' *** KO' end || E'\n';
  for rc in select jobname, schedule from cron.job where command ilike '%charge_driver_insurance%' loop
    out := out || '   ' || rc.jobname || ' : ' || rc.schedule || E'\n';
  end loop;

  raise exception E'RESULTATS\n%', out;
end $$;
