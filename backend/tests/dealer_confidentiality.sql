-- Confidentialité partenaire : un partenaire véhicule ne voit QUE sa part (jamais le prix des courses ni la part du chauffeur),
-- ne voit pas les données d'un autre partenaire, et un utilisateur sans compte partenaire n'obtient rien.
-- Usage : supabase db query --linked -f backend/tests/dealer_confidentiality.sql --workdir backend  (résultat dans « RESULTATS »)
do $$
declare
  dealer_prof uuid; dealer_id uuid; other_dealer uuid; c uuid;
  out text := '';
  j jsonb; n int;
  keys text;
  bad text := '(price|prix|driver_share|part_chauffeur|total_fcfa|price_total|client|phone|passenger)';
begin
  select dp.profile_id, dp.id into dealer_prof, dealer_id
    from public.dealer_partners dp join public.rides r on r.dealer_partner_id = dp.id group by dp.profile_id, dp.id order by count(*) desc limit 1;
  select dp.id into other_dealer from public.dealer_partners dp where dp.id <> dealer_id limit 1;
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  if dealer_prof is null then raise exception E'RESULTATS\nAucun partenaire avec des courses : test non applicable'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', dealer_prof, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- colonnes retournées par chaque fonction « dealer_my_* »
  select string_agg(distinct k, ', ') into keys from (select jsonb_object_keys(to_jsonb(s)) k from public.dealer_my_summary(null) s) q;
  out := out || 'dealer_my_summary colonnes : ' || coalesce(keys, '(aucune ligne)') || E'\n';
  select string_agg(distinct k, ', ') into keys from (select jsonb_object_keys(to_jsonb(s)) k from public.dealer_my_recent(null, 5) s) q;
  out := out || 'dealer_my_recent colonnes : ' || coalesce(keys, '(aucune ligne)') || case when keys ~* bad then ' *** CHAMP SENSIBLE' else ' OK' end || E'\n';
  select string_agg(distinct k, ', ') into keys from (select jsonb_object_keys(to_jsonb(s)) k from public.dealer_my_daily(null) s) q;
  out := out || 'dealer_my_daily colonnes : ' || coalesce(keys, '(aucune ligne)') || case when keys ~* bad then ' *** CHAMP SENSIBLE' else ' OK' end || E'\n';
  select string_agg(distinct k, ', ') into keys from (select jsonb_object_keys(to_jsonb(s)) k from public.dealer_my_vehicles(null) s) q;
  out := out || 'dealer_my_vehicles colonnes : ' || coalesce(keys, '(aucune ligne)') || case when keys ~* bad then ' *** CHAMP SENSIBLE' else ' OK' end || E'\n';
  select string_agg(distinct k, ', ') into keys from (select jsonb_object_keys(to_jsonb(s)) k from public.dealer_my_payouts(null, 5) s) q;
  out := out || 'dealer_my_payouts colonnes : ' || coalesce(keys, '(aucune ligne)') || E'\n';

  -- un partenaire ne peut pas viser un autre partenaire en passant son identifiant
  select count(*) into n from public.dealer_my_recent(other_dealer, 50);
  select count(*) into j from (select 1 from public.dealer_my_recent(null, 50)) q;
  out := out || 'dealer_my_recent(autre partenaire) renvoie ' || n || ' ligne(s) ; les siennes : ' || (select count(*) from public.dealer_my_recent(null, 50))
         || case when n = (select count(*) from public.dealer_my_recent(null, 50)) then ' OK (identifiant ignoré)' else ' *** FUITE' end || E'\n';

  -- lecture directe des courses : un partenaire voit-il le détail des courses de ses véhicules ?
  select count(*) into n from public.rides;
  out := out || 'courses lisibles directement par le partenaire (table rides) : ' || n || case when n = 0 then ' OK' else ' (à vérifier : devrait être 0 pour préserver la confidentialité des prix)' end || E'\n';
  select count(*) into n from public.wallet_transactions;
  out := out || 'transactions lisibles par le partenaire : ' || n || E' (les siennes uniquement attendues)\n';
  reset role;

  -- un client sans compte partenaire
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.dealer_my_recent(null, 50);
  out := out || 'client simple appelle dealer_my_recent : ' || n || ' ligne(s) ' || case when n = 0 then 'OK' else '*** FUITE' end || E'\n';
  select count(*) into n from public.dealer_my_recent(dealer_id, 50);
  out := out || 'client simple appelle dealer_my_recent(identifiant partenaire) : ' || n || ' ligne(s) ' || case when n = 0 then 'OK' else '*** FUITE' end || E'\n';
  reset role;

  raise exception E'RESULTATS\n%', out;
end $$;
