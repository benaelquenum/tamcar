-- TamPass (abonnement de trajets réguliers) de bout en bout : demande, offre chauffeur, paiement par crédit, génération des courses.
-- Rôles réels, tout est annulé. Usage : supabase db query --linked -f backend/tests/tampass_flow.sql --workdir backend
do $$
declare
  c uuid; d_prof uuid; d_id uuid; w_cr uuid; cat text;
  sub public.subscriptions;
  out text := '';
  step text; n int; v int; st text;
  plat double precision := 6.4969; plng double precision := 2.6283;
  v_date date := current_date + 1;
  dow int := extract(isodow from (current_date + 1))::int;
  res jsonb; rec record;
  rid1 uuid; rid2 uuid; dv uuid; v0 int; v1 int; adm uuid; li int; sub_after text; cr0 int; cr1 int;
begin
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  select dr.id, dr.profile_id, v.category::text into d_id, d_prof, cat
    from public.drivers dr join public.vehicles v on v.id = dr.current_vehicle_id
   where dr.status = 'active' and v.category = 'moto' limit 1;
  update public.drivers set is_online = true, current_location = st_setsrid(st_makepoint(plng + 0.0005, plat), 4326)::geography, updated_at = now() where id = d_id;
  select id into w_cr from public.wallets where profile_id = c and kind = 'tamcar_credit';
  update public.wallets set balance_fcfa = 200000 where id = w_cr;

  -- 1. le client demande un TamPass (jours : demain et le suivant, 2 semaines)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'request_subscription_flex';
    sub := public.request_subscription_flex(cat::vehicle_category, plat, plng, 'Domicile TamPass', 6.5100, 2.6000, 'Bureau TamPass', 3.2, 12,
                                            array[dow, ((dow % 7) + 1)], time '07:30', time '17:30', 2);
    out := out || '1. demande TamPass : statut=' || sub.status || ' prix total=' || coalesce(sub.total_price_fcfa::text, '?') || ' trajets=' || coalesce(sub.rides_total::text, '?') || E'\n';
  exception when others then out := out || '1. demande ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;
  if sub.id is null then raise exception E'RESULTATS\n%', out; end if;

  -- 2. le chauffeur voit l'offre et l'accepte
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'tampass_open_offers';
    select count(*) into n from public.tampass_open_offers() o where (to_jsonb(o) ->> 'subscription_id') = sub.id::text or (to_jsonb(o) ->> 'id') = sub.id::text;
    out := out || '2a. offre visible du chauffeur : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
    step := 'tampass_accept_offer';
    perform public.tampass_accept_offer(sub.id);
    reset role;
    select status::text into st from public.subscriptions where id = sub.id;
    out := out || '2b. offre acceptée : statut abonnement=' || st || E'\n';
  exception when others then reset role; out := out || '2. offre ECHEC à ' || coalesce(step, '?') || ' : ' || sqlerrm || E'\n'; end;

  -- 3. le client confirme et paie avec son crédit
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'confirm_subscription_payment';
    perform public.confirm_subscription_payment(sub.id);
    reset role;
    select status::text into st from public.subscriptions where id = sub.id;
    select balance_fcfa into v from public.wallets where id = w_cr;
    out := out || '3. paiement confirmé : statut=' || st || ', crédit 200000 -> ' || v || ' (débit ' || (200000 - v) || ' F)' || case when st = 'active' then ' OK' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || '3. paiement ECHEC : ' || sqlerrm || E'\n'; end;

  -- 4. génération des courses pour demain (tâche planifiée du soir)
  begin
    step := 'tampass_nightly';
    res := public.tampass_nightly();
    select count(*) into n from public.subscription_rides where subscription_id = sub.id;
    out := out || '4. tampass_nightly : ' || res::text || ' ; trajets générés pour cet abonnement=' || n || E'\n';
    select count(*) into n from public.subscription_rides sr join public.rides r on r.id = sr.ride_id where sr.subscription_id = sub.id;
    out := out || '   courses créées liées : ' || n || E'\n';
  exception when others then out := out || '4. génération ECHEC : ' || sqlerrm || E'\n'; end;

  -- 5. le client voit son TamPass et le détail ; le chauffeur voit son planning
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select count(*) into n from public.tampass_pass_detail(sub.id);
    out := out || '5a. détail du pass côté client : ' || n || ' ligne(s)' || E'\n';
  exception when others then out := out || '5a. détail ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select count(*) into n from public.tampass_driver_planning(v_date);
    out := out || '5b. planning du chauffeur pour demain : ' || n || ' trajet(s)' || E'\n';
    select count(*) into n from public.tampass_driver_subscriptions();
    out := out || '5c. abonnements du chauffeur : ' || n || E'\n';
  exception when others then out := out || '5b/c. ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;

  -- 6. TITULAIRE ENGAGÉ SUR TOUTES LES COURSES : les courses de demain (aller + retour) naissent déjà affectées au chauffeur qui a accepté
  select min(r.id::text)::uuid, max(r.id::text)::uuid into rid1, rid2
    from public.subscription_rides sr join public.rides r on r.id = sr.ride_id where sr.subscription_id = sub.id and sr.travel_date = v_date;
  select count(*) into n from public.subscription_rides sr join public.rides r on r.id = sr.ride_id
   where sr.subscription_id = sub.id and sr.travel_date = v_date and r.driver_id = d_id and r.status = 'scheduled' and sr.final_driver_id = d_id;
  out := out || '6. courses du lendemain affectées d''avance au titulaire : ' || n || ' / 2' || case when n = 2 then ' OK' else ' *** KO' end || E'\n';

  -- 7. DÉSISTEMENT d'UNE course : elle repart en recherche (exclusion du titulaire pour cette course), l'autre reste au titulaire
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    step := 'cancel_scheduled_by_driver';
    perform public.cancel_scheduled_by_driver(rid1);
    reset role;
    select driver_id, status::text into dv, st from public.rides where id = rid1;
    out := out || '7a. après désistement : course sans chauffeur=' || (dv is null)::text || ', statut=' || st || case when dv is null and st = 'scheduled' then ' OK' else ' *** KO' end || E'\n';
    select count(*) into n from public.ride_driver_exclusions where ride_id = rid1 and driver_id = d_id;
    out := out || '7b. titulaire exclu de CETTE course : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
    select count(*) into n from public.rides where id = rid2 and driver_id = d_id;
    out := out || '7c. l''autre course reste au titulaire : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
    select preferred_driver_id::text into st from public.subscriptions where id = sub.id;
    out := out || '7d. titulaire de l''abonnement inchangé : ' || (st = d_id::text)::text || case when st = d_id::text then ' OK' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || '7. désistement ECHEC à ' || coalesce(step, '?') || ' : ' || sqlerrm || E'\n'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.accept_scheduled_ride(rid1);
    reset role;
    out := out || '7e. le titulaire a pu reprendre la course dont il s''est désisté *** KO' || E'\n';
  exception when others then reset role; out := out || '7e. reprise de la course désistée refusée : ' || left(sqlerrm, 60) || ' OK' || E'\n'; end;

  -- 8. OBJECTIF JOURNALIER : une course TamPass terminée aujourd'hui compte dans le volume du jour (jour de la fin de course)
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select volume_today into v0 from public.driver_today_volume(d_id);
  reset role;
  update public.rides set status = 'completed', started_at = now() - interval '10 minutes', ended_at = now() where id = rid2;
  perform set_config('request.jwt.claims', json_build_object('sub', d_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select volume_today into v1 from public.driver_today_volume(d_id);
  reset role;
  select price_total_fcfa into v from public.rides where id = rid2;
  out := out || '8a. volume du jour du chauffeur : ' || v0 || ' -> ' || v1 || ' (course TamPass de ' || v || ' F)' || case when v1 - v0 = v then ' OK' else ' *** KO' end || E'\n';
  select t.volume into v1 from public._floor_day_totals(d_id, (now() at time zone 'Africa/Porto-Novo')::date) t;
  out := out || '8b. total du jour pour le versement/objectif (_floor_day_totals) : ' || v1 || case when v1 >= v then ' OK' else ' *** KO' end || E'\n';

  -- 9. ADMIN : liste de tous les TamPass puis arrêt (avec remboursement des trajets non effectués)
  select id into adm from public.profiles where role = 'admin' limit 1;
  begin
    step := 'admin_tampass_list';
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into li from public.admin_tampass_list() x where x.subscription_id = sub.id;
    reset role;
    out := out || '9a. liste admin : l''abonnement y figure : ' || li || case when li = 1 then ' OK' else ' *** KO' end || E'\n';
    step := 'admin_cancel_subscription';
    select balance_fcfa into cr0 from public.wallets where id = w_cr;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    res := public.admin_cancel_subscription(sub.id, 'test', true);
    reset role;
    select status into sub_after from public.subscriptions where id = sub.id;
    select balance_fcfa into cr1 from public.wallets where id = w_cr;
    select count(*) into n from public.rides r join public.subscription_rides sr on sr.ride_id = r.id
     where sr.subscription_id = sub.id and r.status in ('scheduled', 'requested', 'matched');
    out := out || '9b. arrêt admin : ' || res::text || ' ; statut=' || sub_after || ' ; courses encore actives=' || n || ' ; crédit ' || cr0 || ' -> ' || cr1
           || case when sub_after = 'cancelled' and n = 0 and cr1 - cr0 = (res ->> 'refund_fcfa')::int and (res ->> 'refund_fcfa')::int > 0 then ' OK' else ' *** KO' end || E'\n';
  exception when others then reset role; out := out || '9. admin ECHEC à ' || coalesce(step, '?') || ' : ' || sqlerrm || E'\n'; end;
  -- 9c. un compte non admin ne voit rien et ne peut pas arrêter
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select count(*) into li from public.admin_tampass_list();
    out := out || '9c. client non admin : liste=' || li || case when li = 0 then ' OK' else ' *** KO' end;
    begin
      perform public.admin_cancel_subscription(sub.id);
      out := out || ' ; arrêt autorisé *** KO' || E'\n';
    exception when others then out := out || ' ; arrêt refusé OK' || E'\n'; end;
  exception when others then out := out || '9c. ECHEC : ' || sqlerrm || E'\n'; end;
  reset role;

  raise exception E'RESULTATS\n%', out;
end $$;
