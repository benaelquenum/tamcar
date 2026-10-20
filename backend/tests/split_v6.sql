-- Clé de répartition du plan v6 : chauffeur 40 %, propriétaire 30 %, fonds de rachat 5 %, TamCar le reste (25 %) ; chauffeur propriétaire 80 / 20 ;
-- fonds de rachat crédité EN ENTIER au chauffeur (aucun prélèvement ni avance de démarrage) ; prélèvement « maintien en flotte » arrêté.
-- Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/split_v6.sql --workdir backend   (après la migration 20261019100000)
do $$
declare
  out text := ''; c text; q record; drv record; ride uuid; w_rachat int; w_rachat2 int; w_dealer int; w_dealer2 int; n int; adv0 int; adv1 int; cr int;
  pkey text;
begin
  -- 1. répartition renvoyée par compute_price, pour chaque catégorie
  for c in select unnest(array['moto', 'tricycle', 'essentiel', 'confort', 'premium']) loop
    select * into q from public.compute_price(6.37, 2.39, 6.40, 2.43, 6.1, 17, c::vehicle_category, false, false);
    out := out || '1. ' || c || ' : prix ' || q.price_total_fcfa || ' = chauffeur ' || q.driver_cash_fcfa || ' + fonds ' || q.driver_rachat_fcfa || ' + propriétaire '
           || q.dealer_share_fcfa || ' + TamCar ' || q.platform_share_fcfa
           || case when q.driver_cash_fcfa = floor(q.price_total_fcfa * 0.40) and q.driver_rachat_fcfa = floor(q.price_total_fcfa * 0.05)
                    and q.dealer_share_fcfa = floor(q.price_total_fcfa * 0.30)
                    and q.platform_share_fcfa = q.price_total_fcfa - q.driver_cash_fcfa - q.driver_rachat_fcfa - q.dealer_share_fcfa
                    and q.platform_share_fcfa >= floor(q.price_total_fcfa * 0.25) then ' OK' else ' *** KO' end || E'\n';
  end loop;

  -- 2. répartition pour un chauffeur propriétaire de son véhicule (_ride_shares) : 80 / 20, aucun fonds
  select * into q from public._ride_shares(2000, (select id from public.drivers where application_type::text = 'proprietaire' and status = 'active' limit 1));
  out := out || '2. propriétaire : ' || row_to_json(q)::text || E'\n';

  -- 3. crédit des portefeuilles à la fin d'une course : le fonds de rachat arrive EN ENTIER chez le chauffeur
  select d.id as did, d.profile_id as pid, v.id as vid, v.dealer_partner_id as dpid, dp.profile_id as dprofile into drv
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    join public.dealer_partners dp on dp.id = v.dealer_partner_id
   where d.status = 'active' and d.application_type::text = 'cession' and dp.profile_id <> d.profile_id
   order by d.id limit 1;
  if drv.did is null then raise exception 'Aucun chauffeur Cession avec un véhicule de partenaire pour tester'; end if;
  insert into public.wallets (profile_id, kind, balance_fcfa) values (drv.pid, 'tamcar_rachat', 0) on conflict (profile_id, kind) do nothing;
  insert into public.wallets (profile_id, kind, balance_fcfa) values (drv.dprofile, 'tamcar_revenus', 0) on conflict (profile_id, kind) do nothing;
  select id into ride from public.rides where status = 'completed' limit 1;
  if ride is null then raise exception 'Aucune course terminée en base pour servir de modèle'; end if;
  update public.rides set status = 'in_progress' where id = ride;
  select balance_fcfa into w_rachat from public.wallets where profile_id = drv.pid and kind::text = 'tamcar_rachat';
  select balance_fcfa into w_dealer from public.wallets where profile_id = drv.dprofile and kind::text = 'tamcar_revenus';
  select coalesce(sum(refunded_fcfa), 0) into adv0 from public.dealer_advances;
  update public.rides set driver_id = drv.did, vehicle_id = drv.vid, dealer_partner_id = drv.dpid, payment_method = 'tamcar_credit',
         price_total_fcfa = 2000, driver_share_fcfa = 800, driver_rachat_fcfa = 100, dealer_share_fcfa = 600, platform_share_fcfa = 500,
         ended_at = now(), status = 'completed' where id = ride;
  select balance_fcfa into w_rachat2 from public.wallets where profile_id = drv.pid and kind::text = 'tamcar_rachat';
  select balance_fcfa into w_dealer2 from public.wallets where profile_id = drv.dprofile and kind::text = 'tamcar_revenus';
  select coalesce(sum(refunded_fcfa), 0) into adv1 from public.dealer_advances;
  out := out || '3. fonds de rachat du chauffeur ' || w_rachat || ' -> ' || w_rachat2 || ' (course de 2 000 F, fonds de 100 F) ; part du propriétaire ' || w_dealer || ' -> ' || w_dealer2
         || ' ; avances de démarrage cumulées ' || adv0 || ' -> ' || adv1
         || case when w_rachat2 - w_rachat = 100 and w_dealer2 - w_dealer = 600 and adv1 = adv0 then ' OK' else ' *** KO' end || E'\n';

  -- 4. prélèvement « maintien en flotte » arrêté : réglages à 0, tâche planifiée retirée, aucune ponction
  select count(*) into n from public.program_rules where key like 'upkeep\_permille\_%' and value <> 0;
  select count(*) into cr from cron.job where jobname = 'upkeep-monthly';
  out := out || '4. réglages upkeep non nuls : ' || n || ' ; tâche planifiée : ' || cr || case when n = 0 and cr = 0 then ' OK' else ' *** KO' end || E'\n';
  for pkey in select unnest(array['share_essentiel', 'share_confort']) loop
    out := out || '5. ' || pkey || ' = ' || public._program_rule(pkey) || case when public._program_rule(pkey) = 25 then ' OK' else ' *** KO' end || E'\n';
  end loop;

  raise exception 'RESULTATS%', E'\n' || out;
end $$;
