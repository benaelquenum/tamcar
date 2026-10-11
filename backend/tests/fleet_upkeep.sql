-- Prélèvement mensuel « maintien en flotte » sur le fonds de rachat : X ‰ du volume du mois, plafonné au fonds, une seule fois par mois,
-- jamais pour un taux à 0. Rien n'est conservé (transaction annulée, résultat dans « RESULTATS »).
-- Usage : supabase db query --linked -f tests/fleet_upkeep.sql  (depuis backend/)
do $$
declare
  out text := '';
  did uuid; pid uuid; vid uuid;
  rids uuid[]; vol bigint; due int; bal int; n int; r jsonb; m date; msg text; lg record;
begin
  update public._push_settings set value = '2020-01-01' where key = 'performance_bonus_from';

  -- un chauffeur en formule Cession, avec un véhicule ; on le met sur une Essentiel pour le test
  select d.id, d.profile_id, d.current_vehicle_id into did, pid, vid
    from public.drivers d where d.status::text = 'active' and d.application_type::text = 'cession' and d.current_vehicle_id is not null
   order by d.id limit 1;
  if did is null then raise exception 'Aucun chauffeur Cession avec véhicule pour tester'; end if;
  update public.vehicles set category = 'essentiel' where id = vid;
  update public.program_rules set value = 30 where key = 'upkeep_permille_essentiel';
  insert into public.wallets (profile_id, kind, balance_fcfa) values (pid, 'tamcar_rachat', 0) on conflict (profile_id, kind) do nothing;
  update public.wallets set balance_fcfa = 100000 where profile_id = pid and kind::text = 'tamcar_rachat';
  delete from public.driver_upkeep_log where driver_id = did;

  -- 3 courses terminées en septembre 2026 pour ce chauffeur
  select array_agg(id) into rids from (select id from public.rides where status::text = 'completed' order by created_at limit 3) x;
  if coalesce(array_length(rids, 1), 0) < 3 then raise exception 'Il faut 3 courses terminées pour tester'; end if;
  update public.rides set driver_id = did, ended_at = timestamptz '2026-09-12 10:00+01' where id = any(rids);
  select coalesce(sum(price_total_fcfa), 0) into vol from public.rides where id = any(rids);
  due := floor(vol * 30 / 1000.0)::int;

  -- 1. un jour qui n'est pas le dernier du mois : rien
  r := public._charge_upkeep(date '2026-09-29');
  out := out || '1. 29 septembre : ' || coalesce(r ->> 'skipped', '∅') || case when r ->> 'skipped' = 'not_last_day' then ' OK' else ' *** KO' end || E'\n';

  -- 2. dernier jour : 3 % du volume du mois prélevé sur le fonds de rachat
  r := public._charge_upkeep(date '2026-09-30');
  select balance_fcfa into bal from public.wallets where profile_id = pid and kind::text = 'tamcar_rachat';
  select * into lg from public.driver_upkeep_log where driver_id = did and month = date '2026-09-01';
  select count(*) into n from public.wallet_transactions t join public.wallets w on w.id = t.wallet_id
   where w.profile_id = pid and w.kind::text = 'tamcar_rachat' and t.type::text = 'fleet_upkeep_fee' and t.amount_fcfa = -due;
  out := out || '2. volume ' || vol || ' F, 30 ‰ = ' || due || ' F : fonds ' || bal || ', journal ' || coalesce(lg.charged_fcfa::text, '∅') || ', mouvement ' || n
         || case when bal = 100000 - due and lg.charged_fcfa = due and lg.volume_fcfa = vol and n = 1 and due > 0 then ' OK' else ' *** KO' end || E'\n';

  -- 3. rejoué : aucun second prélèvement
  r := public._charge_upkeep(date '2026-09-30');
  select balance_fcfa into bal from public.wallets where profile_id = pid and kind::text = 'tamcar_rachat';
  select count(*) into n from public.driver_upkeep_log where driver_id = did and month = date '2026-09-01';
  out := out || '3. rejoué : fonds ' || bal || ', lignes de journal ' || n || case when bal = 100000 - due and n = 1 then ' OK' else ' *** KO' end || E'\n';

  -- 4. fonds insuffisant : on ne prélève jamais plus que le fonds
  update public.rides set ended_at = timestamptz '2026-07-12 10:00+01' where id = any(rids);
  update public.wallets set balance_fcfa = 10 where profile_id = pid and kind::text = 'tamcar_rachat';
  r := public._charge_upkeep(date '2026-07-31');
  select balance_fcfa into bal from public.wallets where profile_id = pid and kind::text = 'tamcar_rachat';
  select * into lg from public.driver_upkeep_log where driver_id = did and month = date '2026-07-01';
  out := out || '4. fonds de 10 F : prélevé ' || coalesce(lg.charged_fcfa::text, '∅') || ' sur ' || coalesce(lg.due_fcfa::text, '∅') || ' dû, fonds restant ' || bal
         || case when lg.charged_fcfa = 10 and lg.due_fcfa = due and bal = 0 then ' OK' else ' *** KO' end || E'\n';

  -- 5. taux à 0 : aucun prélèvement ni journal
  update public.program_rules set value = 0 where key = 'upkeep_permille_essentiel';
  update public.rides set ended_at = timestamptz '2026-08-12 10:00+01' where id = any(rids);
  update public.wallets set balance_fcfa = 50000 where profile_id = pid and kind::text = 'tamcar_rachat';
  r := public._charge_upkeep(date '2026-08-31');
  select balance_fcfa into bal from public.wallets where profile_id = pid and kind::text = 'tamcar_rachat';
  select count(*) into n from public.driver_upkeep_log where driver_id = did and month = date '2026-08-01';
  out := out || '5. taux à 0 : fonds ' || bal || ', journal ' || n || case when bal = 50000 and n = 0 then ' OK' else ' *** KO' end || E'\n';

  -- 6. avant la date de démarrage : rien
  update public._push_settings set value = '2027-01-01' where key = 'performance_bonus_from';
  r := public._charge_upkeep(date '2026-09-30');
  out := out || '6. avant le démarrage : ' || coalesce(r ->> 'skipped', '∅') || case when r ->> 'skipped' = 'not_started' then ' OK' else ' *** KO' end || E'\n';

  -- 7. droits : la fonction interne n'est pas appelable par un compte connecté
  perform set_config('request.jwt.claims', json_build_object('sub', pid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public._charge_upkeep(date '2026-09-30');
    out := out || E'7. fonction interne appelable par un chauffeur : *** KO\n';
  exception when others then out := out || '7. fonction interne refusée à un chauffeur' || case when sqlerrm like '%permission denied%' then ' OK' else ' *** KO → ' || sqlerrm end || E'\n'; end;
  -- le chauffeur lit son propre journal de prélèvements
  select count(*) into n from public.driver_upkeep_log where driver_id = did;
  out := out || '   le chauffeur lit son journal : ' || n || ' ligne(s)' || case when n >= 1 then ' OK' else ' *** KO' end || E'\n';
  reset role;

  raise exception E'RESULTATS\n%', out;
end $$;
