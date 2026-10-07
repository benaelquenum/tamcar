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
                                            array[dow, ((dow % 7) + 1)], time '07:30', null, 2);
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

  raise exception E'RESULTATS\n%', out;
end $$;
