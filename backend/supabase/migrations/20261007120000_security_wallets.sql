-- ============================================================
-- Revue de sécurité et portefeuilles (2026-10-07)
--
-- Constats (voir REVUE) :
--  1. apply_fedapay_success / apply_fedapay_declined (crédit d'un portefeuille) étaient exécutables par tout le monde, et
--     la politique wallet_tx_insert_own laissait un utilisateur créer lui-même une transaction « pending » avec la
--     référence de son choix : combinées, elles permettaient de se créditer sans payer. Désormais : service_role seul
--     (webhook FedaPay) et plus aucune écriture directe dans wallet_transactions.
--  2. Mode TEST des paiements : topup_tamcar_credit (invoker : ne créditait rien, écrivait seulement une fausse ligne
--     « réussie ») et settle_driver_debt (règlement gratuit) sont maintenant soumis à l'interrupteur de réglage
--     « payments_test_mode » (1 = test, comportement actuel ; 0 = désactivé : à passer à 0 au lancement).
--  3. 123 fonctions « security definer » étaient appelables sans connexion avec la clé publique : retrait pour toutes
--     sauf public_ride_track (lien de suivi) et les fonctions citées par des politiques RLS de lecture publique.
--     Privilèges par défaut des futures fonctions et tables resserrés.
--  4. Fonctions d'administration qui écrivaient avec les droits de l'appelant et échouaient sur la RLS (approbation
--     d'un chauffeur candidat, avances partenaires) : passage en security definer, garde is_admin conservée.
--  5. Retraits des chauffeurs : la fonction request_driver_payout n'existait pas en base (migration 20260724011000
--     jamais passée) et withdraw_tamcar_revenus simulait un succès sans débiter. Circuit complet : demande (débit
--     immédiat) -> traitement manuel par l'équipe (/admin/retraits) ou automatique plus tard (fedapay-payout).
--     L'enregistrement d'un règlement de dette par l'équipe (admin_record_debt_payment) complète le circuit.
--  6. Données : promo_codes lisible par tous (liste des codes) -> administrateurs seulement ;
--     nearby_drivers_for_map / drivers_availability_by_category bornés (rayon, nombre).
--  7. 53 fonctions sans search_path fixé : fixé.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Webhooks FedaPay : service_role seul
-- ------------------------------------------------------------
revoke execute on function public.apply_fedapay_success(text, text, integer) from public, anon, authenticated;
grant  execute on function public.apply_fedapay_success(text, text, integer) to service_role;
revoke execute on function public.apply_fedapay_declined(text, text) from public, anon, authenticated;
grant  execute on function public.apply_fedapay_declined(text, text) to service_role;

-- Plus d'écriture directe de l'historique des portefeuilles par les utilisateurs (tout passe par les fonctions).
drop policy if exists wallet_tx_insert_own on public.wallet_transactions;

-- La liste des codes promo n'est pas publique (les clients passent par preview_promo_code / create_ride).
drop policy if exists promo_codes_read on public.promo_codes;

-- ------------------------------------------------------------
-- 2. Mode test des paiements
-- ------------------------------------------------------------
insert into public.program_rules (key, value, label) values
  ('payments_test_mode', 1,
   'Paiements en mode TEST (1 = recharges et règlements de dette gratuits, simulation ; 0 = désactivés). À passer à 0 avant le lancement, quand le paiement Mobile Money est branché.')
on conflict (key) do nothing;

create or replace function public._payments_test_mode()
returns boolean
language sql stable security definer set search_path = public as $fn$
  select public._program_rule('payments_test_mode') = 1;
$fn$;
revoke execute on function public._payments_test_mode() from public, anon, authenticated;

drop function if exists public.topup_tamcar_credit(integer, mobile_money_provider);
create or replace function public.topup_tamcar_credit(amount_fcfa integer, provider mobile_money_provider)
returns public.wallet_transactions
language plpgsql security definer set search_path = public as $fn$
declare
  w_id uuid;
  tx public.wallet_transactions;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if not public._payments_test_mode() then
    raise exception 'La recharge directe est désactivée : utilisez le paiement Mobile Money de votre portefeuille.';
  end if;
  if amount_fcfa < 100 or amount_fcfa > 500000 then
    raise exception 'Montant invalide (100 - 500 000 FCFA)';
  end if;
  select id into w_id from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_credit' for update;
  if w_id is null then raise exception 'Wallet TamCar Crédit introuvable'; end if;
  update public.wallets set balance_fcfa = balance_fcfa + amount_fcfa, updated_at = now() where id = w_id;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
  values (w_id, 'topup', amount_fcfa, provider, 'success', jsonb_build_object('test_mode', true))
  returning * into tx;
  return tx;
end;
$fn$;
revoke all on function public.topup_tamcar_credit(integer, mobile_money_provider) from public, anon;
grant execute on function public.topup_tamcar_credit(integer, mobile_money_provider) to authenticated;

-- Retrait « simulé » du client : supprimé (remplacé par request_driver_payout).
drop function if exists public.withdraw_tamcar_revenus(integer, mobile_money_provider);

-- settle_driver_debt : même définition qu'en production + interrupteur du mode test
CREATE OR REPLACE FUNCTION public.settle_driver_debt(p_amount integer, p_provider mobile_money_provider DEFAULT 'internal'::mobile_money_provider)
 RETURNS wallet_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_driver_id uuid;
  w_id uuid;
  v_bal int;
  v_debt int;
  v_amount int;
  tx public.wallet_transactions;
begin
  if not public._payments_test_mode() then
    raise exception 'Le règlement en ligne arrive avec le paiement Mobile Money : contactez TamCar, l''équipe enregistre votre paiement.';
  end if;
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select id into v_driver_id from public.drivers where profile_id = auth.uid();
  if v_driver_id is null then raise exception 'not_a_driver'; end if;

  select id, balance_fcfa into w_id, v_bal from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus'
   for update;
  if w_id is null then raise exception 'Wallet Revenus introuvable'; end if;

  v_debt := greatest(0, -v_bal);
  if v_debt <= 0 then raise exception 'Aucune dette a regler'; end if;

  v_amount := least(greatest(coalesce(p_amount, v_debt), 1), v_debt);

  update public.wallets
   set balance_fcfa = balance_fcfa + v_amount, updated_at = now()
   where id = w_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status)
   values (w_id, 'debt_settlement', v_amount, p_provider, 'success')
   returning * into tx;

  return tx;
end;
$function$;
revoke all on function public.settle_driver_debt(integer, mobile_money_provider) from public, anon;
grant execute on function public.settle_driver_debt(integer, mobile_money_provider) to authenticated;

-- Fonctions d'administration : exécution privilégiée (garde is_admin conservée dans chaque corps)
CREATE OR REPLACE FUNCTION public.admin_approve_appointment(app_id uuid, p_dealer_company_name text, p_dealer_rccm text, p_vehicle_plate text, p_vehicle_brand text, p_vehicle_model text, p_vehicle_year integer, p_vehicle_color text, p_vehicle_seats integer, p_vehicle_category vehicle_category, p_notes text DEFAULT NULL::text)
 RETURNS driver_appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  app public.driver_appointments;
  dealer_id uuid;
  vehicle_id_v uuid;
  result public.driver_appointments;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  select * into app from public.driver_appointments where id = app_id;
  if app is null then raise exception 'Appointment not found'; end if;
  if app.profile_id is null then raise exception 'Cannot approve unauthenticated appointment'; end if;
  if app.status = 'completed_approved' then raise exception 'Already approved'; end if;

  -- Dealer partner (le chauffeur est son propre dealer pour formule B ; concessionnaire distinct pour A à venir)
  insert into public.dealer_partners (profile_id, company_name, rccm)
  values (app.profile_id, p_dealer_company_name, nullif(trim(coalesce(p_dealer_rccm, '')), ''))
  on conflict (profile_id) do update
    set company_name = excluded.company_name,
        rccm = coalesce(excluded.rccm, public.dealer_partners.rccm)
  returning id into dealer_id;

  -- Véhicule
  insert into public.vehicles (
    dealer_partner_id, plate_number, brand, model, year, color, seats, category, status
  ) values (
    dealer_id, upper(trim(p_vehicle_plate)), trim(p_vehicle_brand), trim(p_vehicle_model),
    p_vehicle_year, nullif(trim(coalesce(p_vehicle_color, '')), ''),
    p_vehicle_seats, p_vehicle_category, 'active'
  )
  on conflict (plate_number) do update
    set brand = excluded.brand,
        model = excluded.model,
        status = 'active'
  returning id into vehicle_id_v;

  -- Driver row (avec application_type)
  insert into public.drivers (
    profile_id, status, is_online, current_vehicle_id, kyc_status, application_type
  ) values (
    app.profile_id, 'active', false, vehicle_id_v, 'approved', app.application_type
  )
  on conflict (profile_id) do update
    set status = 'active',
        current_vehicle_id = vehicle_id_v,
        kyc_status = 'approved',
        application_type = excluded.application_type;

  -- Wallets manquants
  insert into public.wallets (profile_id, kind, balance_fcfa)
  values (app.profile_id, 'tamcar_revenus', 0), (app.profile_id, 'tamcar_rachat', 0)
  on conflict (profile_id, kind) do nothing;

  -- Promote profile
  update public.profiles
    set role = 'driver', full_name = trim(app.first_name || ' ' || app.last_name)
    where id = app.profile_id;

  update public.driver_appointments
    set status = 'completed_approved',
        approved_at = now(),
        approved_by = auth.uid(),
        notes = p_notes,
        updated_at = now()
    where id = app_id
  returning * into result;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_dealer_advance(p_dealer_partner_id uuid, p_amount_fcfa integer DEFAULT 100000)
 RETURNS dealer_advances
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result public.dealer_advances;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  insert into public.dealer_advances (dealer_partner_id, amount_fcfa)
  values (p_dealer_partner_id, p_amount_fcfa)
  returning * into result;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_refund_dealer_advance(p_advance_id uuid)
 RETURNS dealer_advances
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a public.dealer_advances;
  w_id uuid;
  dealer_profile_id uuid;
  result public.dealer_advances;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  select * into a from public.dealer_advances where id = p_advance_id;
  if a is null then raise exception 'Advance introuvable'; end if;
  if a.status <> 'active' then raise exception 'Advance non active (status=%)', a.status; end if;

  select profile_id into dealer_profile_id
   from public.dealer_partners where id = a.dealer_partner_id;

  select id into w_id from public.wallets
   where profile_id = dealer_profile_id and kind = 'tamcar_revenus';
  if w_id is null then raise exception 'Wallet concess introuvable'; end if;

  update public.wallets
   set balance_fcfa = balance_fcfa + a.amount_fcfa,
       updated_at = now()
   where id = w_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, status)
  values (w_id, 'adjustment', a.amount_fcfa, 'success');

  update public.dealer_advances
   set status = 'refunded',
       refunded_in_full_at = now(),
       updated_at = now()
   where id = p_advance_id
  returning * into result;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_forfeit_dealer_advance(p_advance_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS dealer_advances
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a public.dealer_advances;
  months_active int;
  prorata_amount int;
  w_id uuid;
  dealer_profile_id uuid;
  result public.dealer_advances;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  select * into a from public.dealer_advances where id = p_advance_id;
  if a is null then raise exception 'Advance introuvable'; end if;
  if a.status <> 'active' then raise exception 'Advance non active'; end if;

  if a.first_driver_activated_at is null then
    -- Jamais activée → 0 remboursé au concess
    prorata_amount := 0;
  else
    months_active := extract(month from age(now(), a.first_driver_activated_at))::int
                    + extract(year from age(now(), a.first_driver_activated_at))::int * 12;
    months_active := least(months_active, 12);
    prorata_amount := floor(a.amount_fcfa * months_active / 12.0)::int;
  end if;

  if prorata_amount > 0 then
    select profile_id into dealer_profile_id
     from public.dealer_partners where id = a.dealer_partner_id;
    select id into w_id from public.wallets
     where profile_id = dealer_profile_id and kind = 'tamcar_revenus';
    if w_id is not null then
      update public.wallets
       set balance_fcfa = balance_fcfa + prorata_amount,
           updated_at = now()
       where id = w_id;
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, status)
      values (w_id, 'adjustment', prorata_amount, 'success');
    end if;
  end if;

  update public.dealer_advances
   set status = 'forfeited',
       refunded_in_full_at = case when prorata_amount > 0 then now() else null end,
       notes = coalesce(notes || E'\n', '') || 'Forfeited: ' || coalesce(p_reason, 'no reason'),
       updated_at = now()
   where id = p_advance_id
  returning * into result;

  return result;
end;
$function$;

-- Carte : rayon et nombre de résultats bornés
CREATE OR REPLACE FUNCTION public.nearby_drivers_for_map(pickup_lat double precision, pickup_lng double precision, radius_km double precision DEFAULT 5.0, limit_count integer DEFAULT 20)
 RETURNS TABLE(driver_id uuid, lat double precision, lng double precision, category vehicle_category, distance_m double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    d.id,
    st_y(d.current_location::geometry) as lat,
    st_x(d.current_location::geometry) as lng,
    coalesce(v.category, 'essentiel'::vehicle_category) as category,
    st_distance(
      d.current_location,
      st_setsrid(st_makepoint(pickup_lng, pickup_lat), 4326)::geography
    ) as distance_m
  from public.drivers d
  left join public.vehicles v on v.id = d.current_vehicle_id
  where d.is_online = true
    and d.status = 'active'
    and d.current_location is not null
    and st_dwithin(
      d.current_location,
      st_setsrid(st_makepoint(pickup_lng, pickup_lat), 4326)::geography,
      least(greatest(radius_km, 0.5), 15) * 1000
    )
  order by distance_m asc
  limit least(greatest(limit_count, 1), 30);
$function$
;

CREATE OR REPLACE FUNCTION public.drivers_availability_by_category(p_lat double precision, p_lng double precision, p_radius_km double precision DEFAULT 10.0)
 RETURNS TABLE(category vehicle_category, online_count integer, nearest_driver_distance_m integer, eta_min integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with pickup as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as geo
  ),
  eligible as (
    select
      v.category,
      st_distance(d.current_location, (select geo from pickup)) as dist_m
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.is_online = true
      and d.status = 'active'
      and d.current_location is not null
      and st_dwithin(d.current_location, (select geo from pickup), least(greatest(p_radius_km, 0.5), 20) * 1000)
  ),
  agg as (
    select category, count(*)::int as online_count, min(dist_m)::int as nearest_driver_distance_m
    from eligible group by category
  ),
  cats(category) as (
    values ('moto'::vehicle_category), ('tricycle'::vehicle_category),
           ('essentiel'::vehicle_category), ('confort'::vehicle_category),
           ('premium'::vehicle_category)
  )
  select
    c.category,
    coalesce(a.online_count, 0) as online_count,
    a.nearest_driver_distance_m,
    case
      when a.nearest_driver_distance_m is null then null
      when c.category in ('moto', 'tricycle')
        then ceil(a.nearest_driver_distance_m::numeric / 417.0)::int + 1
      else ceil(a.nearest_driver_distance_m::numeric / 367.0)::int + 1
    end as eta_min
  from cats c
  left join agg a on a.category = c.category;
$function$
;

-- ------------------------------------------------------------
-- 3. Retraits chauffeurs : colonnes de traitement manuel, demande avec alerte équipe, RPC admin
--    (la table driver_payouts et les RPC mark/confirm/fail viennent de 20260724011000_driver_payouts.sql)
-- ------------------------------------------------------------
alter table public.driver_payouts
  add column if not exists processed_by uuid references public.profiles(id) on delete set null,
  add column if not exists processed_at timestamptz,
  add column if not exists reference text;

create or replace function public.request_driver_payout(
  p_amount_fcfa int,
  p_provider mobile_money_provider,
  p_msisdn text default null
)
returns public.driver_payouts
language plpgsql security definer set search_path = public as $fn_req$
declare
  v_driver record;
  v_wallet record;
  v_msisdn text;
  v_tx public.wallet_transactions;
  v_payout public.driver_payouts;
  adm record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_provider not in ('mtn', 'moov') then raise exception 'Opérateur invalide (mtn / moov)'; end if;
  if p_amount_fcfa < 500 or p_amount_fcfa > 500000 then
    raise exception 'Montant invalide (500 - 500 000 FCFA)';
  end if;

  select d.id, d.profile_id, p.phone into v_driver
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where d.profile_id = auth.uid() and d.status = 'active';
  if v_driver.id is null then raise exception 'Compte chauffeur introuvable ou inactif'; end if;

  v_msisdn := coalesce(nullif(trim(p_msisdn), ''), v_driver.phone);
  if v_msisdn is null or length(regexp_replace(v_msisdn, '\D', '', 'g')) < 8 then
    raise exception 'Numéro Mobile Money invalide';
  end if;

  if exists (select 1 from public.driver_payouts
             where driver_id = v_driver.id and status in ('pending', 'processing')) then
    raise exception 'Un retrait est déjà en cours de traitement';
  end if;

  select id, balance_fcfa into v_wallet from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus'
   for update;
  if v_wallet.id is null then raise exception 'Wallet TamCar Revenus introuvable'; end if;
  if v_wallet.balance_fcfa < p_amount_fcfa then
    raise exception 'Solde insuffisant (% F disponibles)', v_wallet.balance_fcfa;
  end if;

  update public.wallets
     set balance_fcfa = balance_fcfa - p_amount_fcfa, updated_at = now()
   where id = v_wallet.id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
  values (v_wallet.id, 'withdrawal', -p_amount_fcfa, p_provider, 'pending',
          jsonb_build_object('kind', 'payout'))
  returning * into v_tx;

  insert into public.driver_payouts (driver_id, profile_id, amount_fcfa, provider, msisdn, wallet_tx_id)
  values (v_driver.id, v_driver.profile_id, p_amount_fcfa, p_provider, v_msisdn, v_tx.id)
  returning * into v_payout;

  -- L'équipe est prévenue : un retrait attend son traitement.
  for adm in select id from public.profiles where role::text = 'admin' loop
    perform public._push_notify(
      adm.id, 'Demande de retrait',
      p_amount_fcfa || ' F · ' || upper(p_provider::text) || ' ' || v_msisdn,
      '/admin/retraits', 'payout-req:' || v_payout.id::text, true
    );
  end loop;

  return v_payout;
end;
$fn_req$;
revoke all on function public.request_driver_payout(int, mobile_money_provider, text) from public, anon;
grant execute on function public.request_driver_payout(int, mobile_money_provider, text) to authenticated;

create or replace function public.admin_driver_payouts(p_scope text default 'open')
returns table (
  id uuid, created_at timestamptz, profile_id uuid, full_name text, phone text, msisdn text,
  provider mobile_money_provider, amount_fcfa int, status text, failure_reason text, reference text,
  processed_at timestamptz, balance_fcfa int
)
language plpgsql stable security definer set search_path = public as $fn_l$
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;
  return query
  select dp.id, dp.created_at, dp.profile_id, p.full_name, p.phone, dp.msisdn, dp.provider, dp.amount_fcfa, dp.status,
         dp.failure_reason, dp.reference, dp.processed_at,
         (select w.balance_fcfa from public.wallets w where w.profile_id = dp.profile_id and w.kind = 'tamcar_revenus')
    from public.driver_payouts dp
    join public.profiles p on p.id = dp.profile_id
   where case when p_scope = 'open' then dp.status in ('pending', 'processing') else dp.status in ('paid', 'failed') end
   order by dp.created_at desc
   limit 200;
end;
$fn_l$;
revoke all on function public.admin_driver_payouts(text) from public, anon;
grant execute on function public.admin_driver_payouts(text) to authenticated;

create or replace function public.admin_mark_payout_paid(p_payout_id uuid, p_reference text default null)
returns void
language plpgsql security definer set search_path = public as $fn_p$
declare v public.driver_payouts;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;
  select * into v from public.driver_payouts where id = p_payout_id for update;
  if v.id is null then raise exception 'Retrait introuvable.'; end if;
  if v.status not in ('pending', 'processing') then raise exception 'Ce retrait est déjà clos.'; end if;
  perform public.confirm_driver_payout(p_payout_id, null);
  update public.driver_payouts
     set reference = nullif(trim(coalesce(p_reference, '')), ''), processed_by = auth.uid(), processed_at = now()
   where id = p_payout_id;
  perform public._push_notify(
    v.profile_id, 'Retrait envoyé',
    'Ton retrait de ' || v.amount_fcfa || ' F a été envoyé sur ton Mobile Money.',
    '/wallet', 'payout-paid:' || p_payout_id::text, true
  );
end;
$fn_p$;
revoke all on function public.admin_mark_payout_paid(uuid, text) from public, anon;
grant execute on function public.admin_mark_payout_paid(uuid, text) to authenticated;

create or replace function public.admin_reject_payout(p_payout_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $fn_r$
declare v public.driver_payouts;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;
  select * into v from public.driver_payouts where id = p_payout_id for update;
  if v.id is null then raise exception 'Retrait introuvable.'; end if;
  if v.status not in ('pending', 'processing') then raise exception 'Ce retrait est déjà clos.'; end if;
  perform public.fail_driver_payout(p_payout_id, coalesce(nullif(trim(p_reason), ''), 'Refusé par TamCar'));
  update public.driver_payouts set processed_by = auth.uid(), processed_at = now() where id = p_payout_id;
end;
$fn_r$;
revoke all on function public.admin_reject_payout(uuid, text) from public, anon;
grant execute on function public.admin_reject_payout(uuid, text) to authenticated;

-- L'équipe enregistre le paiement d'une dette reçu hors application (espèces, Mobile Money vers TamCar).
create or replace function public.admin_record_debt_payment(
  p_driver_id uuid,
  p_amount_fcfa int,
  p_provider mobile_money_provider default 'internal',
  p_reference text default null
)
returns public.wallet_transactions
language plpgsql security definer set search_path = public as $fn_d$
declare
  v_profile uuid;
  w_id uuid;
  v_bal int;
  v_debt int;
  v_amount int;
  tx public.wallet_transactions;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;
  select profile_id into v_profile from public.drivers where id = p_driver_id;
  if v_profile is null then raise exception 'Chauffeur introuvable.'; end if;
  select id, balance_fcfa into w_id, v_bal from public.wallets
   where profile_id = v_profile and kind = 'tamcar_revenus' for update;
  if w_id is null then raise exception 'Wallet Revenus introuvable.'; end if;
  v_debt := greatest(0, -v_bal);
  if v_debt <= 0 then raise exception 'Ce chauffeur n''a aucune dette.'; end if;
  if p_amount_fcfa is null or p_amount_fcfa < 1 then raise exception 'Montant invalide.'; end if;
  v_amount := least(p_amount_fcfa, v_debt);
  update public.wallets set balance_fcfa = balance_fcfa + v_amount, updated_at = now() where id = w_id;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
  values (w_id, 'debt_settlement', v_amount, p_provider, 'success',
          jsonb_build_object('by_admin', auth.uid(), 'reference', nullif(trim(coalesce(p_reference, '')), '')))
  returning * into tx;
  perform public._push_notify(
    v_profile, 'Paiement reçu',
    'TamCar a enregistré ton paiement de ' || v_amount || ' F : ta dette est mise à jour.',
    '/wallet', 'debt-paid:' || tx.id::text, true
  );
  return tx;
end;
$fn_d$;
revoke all on function public.admin_record_debt_payment(uuid, int, mobile_money_provider, text) from public, anon;
grant execute on function public.admin_record_debt_payment(uuid, int, mobile_money_provider, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Réduction de la surface d'appel anonyme et des privilèges
-- ------------------------------------------------------------
do $do$
declare
  r record;
  allow text[] := array['public_ride_track'];
  auth_ok boolean;
  svc_ok boolean;
begin
  -- Fonctions citées par des politiques RLS applicables à anon / public : à conserver (sinon erreur de permission).
  for r in
    select distinct p2.proname
      from pg_policies pol
      join pg_proc p2 on p2.pronamespace = 'public'::regnamespace and p2.prosecdef
       and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~ ('(^|[^a-z_])' || p2.proname || '\(')
     where pol.schemaname = 'public'
       and (pol.roles::text like '%public%' or pol.roles::text like '%anon%')
  loop
    allow := allow || r.proname;
  end loop;

  for r in
    select p.oid, p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef
       and has_function_privilege('anon', p.oid, 'execute')
       and not (p.proname = any(allow))
  loop
    auth_ok := has_function_privilege('authenticated', r.oid, 'execute');
    svc_ok := has_function_privilege('service_role', r.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', r.sig);
    if auth_ok then execute format('grant execute on function %s to authenticated', r.sig); end if;
    if svc_ok then execute format('grant execute on function %s to service_role', r.sig); end if;
  end loop;
end
$do$;

-- Futures fonctions : jamais appelables sans connexion par défaut.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- Tables : un visiteur anonyme n'écrit jamais ; personne ne peut TRUNCATE / REFERENCES / TRIGGER via l'API.
do $do$
declare r record;
begin
  for r in select c.oid::regclass as t from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and pg_get_userbyid(c.relowner) = current_user
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger on %s from anon', r.t);
    execute format('revoke truncate, references, trigger on %s from authenticated', r.t);
  end loop;
end
$do$;
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;

-- search_path fixé sur les fonctions signalées (aucun effet sur le comportement : tout y est qualifié ou dans public).
do $do$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and p.proname = any(array['_assert_ride_driver','_booking_is_late','_booking_is_live','_driver_eta_secs',
         '_drivers_clear_suspension_reason','_is_within_service_zone','_owner_platform_pct','available_slots',
         'bo_leaves_fill_days','bo_touch_updated_at','bo_working_days','book_appointment','cancel_appointment',
         'ceil_to_50','compute_price','compute_revenue_share','delete_favorite_place','driver_active_ride_of',
         'driver_go_offline','driver_today_progress','driver_today_rides_count','driver_update_location','f_unaccent',
         'find_nearby_drivers','has_rated_ride','is_driver_senior','my_active_ride','my_appointment',
         'my_favorite_places','my_recent_destinations','my_scheduled_rides','my_wallets','ops_city_for_point',
         'pending_scheduled_rides_for_driver','recent_addresses_for_user','reject_place','ride_stops_of',
         'round_to_50','save_favorite_place','search_places','set_updated_at','suggest_place',
         'tampass_touch_updated_at','verify_place','wallet_transactions_for_user','admin_mark_no_show',
         'admin_reject_appointment'])
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end
$do$;
