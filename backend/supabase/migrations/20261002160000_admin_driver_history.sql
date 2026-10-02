-- ============================================================
-- Admin : historique complet d'un chauffeur DEPUIS SON ENRÔLEMENT (2026-10-02)
--
-- Une chronologie unique qui rassemble, pour un chauffeur :
--   enrôlement (rendez-vous, décision, création du compte), courses (toutes
--   issues), locations VIP, mouvements de portefeuille, retraits, notes reçues,
--   avertissements, primes d'assurance, retraits TamAssur, demandes directes,
--   alertes SOS, archivage.
--
-- Chaque source est lue séparément : une table absente de cette base (migration
-- pas encore passée, ou table retirée depuis) est simplement ignorée.
--
-- Trois fonctions réservées à l'équipe TamCar :
--   admin_driver_summary(id)           — fiche + chiffres depuis l'enrôlement (jsonb)
--   admin_driver_history(id, …)        — la chronologie, filtrable et paginée
--   admin_driver_history_counts(id)    — nombre d'événements par type
-- Les fonctions internes (_driver_events, _safe_count) ne sont pas appelables
-- depuis l'application.
-- ============================================================

-- Compte tolérant : 0 si la table ou la colonne n'existe pas dans cette base.
create or replace function public._safe_count(p_sql text, p_arg uuid)
returns bigint
language plpgsql stable set search_path = public as $fn_sc$
declare
  v bigint;
begin
  execute p_sql into v using p_arg;
  return coalesce(v, 0);
exception when undefined_table or undefined_column or undefined_object then
  return 0;
end;
$fn_sc$;

revoke all on function public._safe_count(text, uuid) from public, anon, authenticated;

create or replace function public._driver_events(p_driver_id uuid)
returns table (
  event_at timestamptz,
  kind text,
  title text,
  detail text,
  amount_fcfa int,
  status text,
  ref_id uuid
)
language plpgsql stable set search_path = public as $fn_de$
declare
  v_leg text;
  v_legs text[] := array[

    -- Enrôlement : rendez-vous
    $q$ select a.created_at::timestamptz, 'enrolment'::text, 'Rendez-vous d''enrôlement'::text,
               ('Visiteur ' || a.visitor_number || ' · créneau du '
                  || to_char(a.slot_at at time zone 'Africa/Porto-Novo', 'DD/MM/YYYY HH24"h"MI'))::text,
               null::int, a.status::text, a.id::uuid
          from public.driver_appointments a
          join public.drivers d on d.profile_id = a.profile_id
         where d.id = $1 $q$,

    -- Enrôlement : décision sur le rendez-vous
    $q$ select a.approved_at::timestamptz, 'enrolment'::text,
               (case when a.rejection_reason is not null then 'Enrôlement refusé' else 'Enrôlement approuvé' end)::text,
               coalesce(a.rejection_reason, a.notes, '')::text,
               null::int, a.status::text, a.id::uuid
          from public.driver_appointments a
          join public.drivers d on d.profile_id = a.profile_id
         where d.id = $1 and a.approved_at is not null $q$,

    -- Enrôlement : compte chauffeur créé
    $q$ select d.created_at::timestamptz, 'enrolment'::text, 'Enrôlement : compte chauffeur créé'::text,
               ('Formule ' || d.application_type::text)::text,
               null::int, d.status::text, d.id::uuid
          from public.drivers d
         where d.id = $1 $q$,

    -- Courses, quelle que soit leur issue
    $q$ select coalesce(r.ended_at, r.cancelled_at, r.started_at, r.matched_at, r.requested_at)::timestamptz,
               'ride'::text, ('Course ' || r.status::text)::text,
               (left(r.pickup_address, 60) || ' → ' || left(r.dropoff_address, 60)
                  || ' · ' || r.price_total_fcfa || ' F'
                  || coalesce(' · ' || r.requested_category::text, ''))::text,
               (case when r.status = 'completed' then r.driver_share_fcfa end)::int,
               r.status::text, r.id::uuid
          from public.rides r
         where r.driver_id = $1 $q$,

    -- Locations VIP
    $q$ select coalesce(vr.completed_at, vr.started_at, vr.confirmed_at, vr.created_at)::timestamptz,
               'rental'::text, ('Location VIP ' || vr.status)::text,
               (to_char(vr.starts_at at time zone 'Africa/Porto-Novo', 'DD/MM/YYYY HH24"h"MI')
                  || ' · ' || vr.hours || ' h · ' || vr.price_fcfa || ' F')::text,
               null::int, vr.status::text, vr.id::uuid
          from public.vehicle_rentals vr
         where vr.driver_id = $1 $q$,

    -- Mouvements de portefeuille (type brut : l'écran le traduit)
    $q$ select wt.created_at::timestamptz, 'wallet'::text, wt.type::text,
               (w.kind::text || ' · ' || wt.status::text)::text,
               wt.amount_fcfa::int, wt.status::text, wt.ride_id::uuid
          from public.wallet_transactions wt
          join public.wallets w on w.id = wt.wallet_id
          join public.drivers d on d.profile_id = w.profile_id
         where d.id = $1 $q$,

    -- Retraits Mobile Money
    $q$ select po.created_at::timestamptz, 'payout'::text, 'Retrait Mobile Money'::text,
               (po.provider::text || ' · ' || po.msisdn || ' · ' || po.status)::text,
               po.amount_fcfa::int, po.status::text, po.id::uuid
          from public.driver_payouts po
         where po.driver_id = $1 $q$,

    -- Notes reçues
    $q$ select rt.created_at::timestamptz, 'rating'::text, ('Note reçue : ' || rt.stars || '/5')::text,
               coalesce(rt.comment, '')::text, null::int, rt.stars::text, rt.ride_id::uuid
          from public.ratings rt
          join public.drivers d on d.profile_id = rt.rated_id
         where d.id = $1 $q$,

    -- Avertissements
    $q$ select w.issued_at::timestamptz, 'warning'::text, ('Avertissement (' || w.level::text || ')')::text,
               (w.reason || coalesce(' · ' || w.notes, ''))::text, null::int,
               (case when w.resolved_at is null then 'open' else 'resolved' end)::text, w.id::uuid
          from public.driver_warnings w
         where w.driver_id = $1 $q$,

    -- Primes d'assurance
    $q$ select coalesce(ic.collected_at, ic.created_at)::timestamptz, 'insurance'::text,
               ('Prime d''assurance ' || to_char(ic.period, 'MM/YYYY'))::text,
               ic.status::text, ic.collected_fcfa::int, ic.status::text, ic.id::uuid
          from public.driver_insurance_charges ic
         where ic.driver_id = $1 $q$,

    -- Retraits TamAssur
    $q$ select tw.requested_at::timestamptz, 'tamassur'::text, ('Retrait TamAssur (' || tw.status || ')')::text,
               coalesce(tw.method, '')::text, tw.amount_fcfa::int, tw.status::text, tw.id::uuid
          from public.tamassur_withdrawals tw
         where tw.driver_id = $1 $q$,

    -- Demandes directes de clients
    $q$ select dr.created_at::timestamptz, 'request'::text, ('Demande directe (' || dr.status || ')')::text,
               (left(dr.pickup_address, 60) || ' → ' || left(dr.dropoff_address, 60))::text,
               dr.price_total_fcfa::int, dr.status::text, dr.id::uuid
          from public.driver_requests dr
         where dr.driver_id = $1 $q$,

    -- Alertes SOS déclenchées par le chauffeur
    $q$ select s.created_at::timestamptz, 'sos'::text, 'Alerte SOS'::text,
               coalesce(s.reason, '')::text, null::int, s.status::text, s.id::uuid
          from public.sos_alerts s
          join public.drivers d on d.profile_id = s.triggered_by
         where d.id = $1 and s.role = 'driver' $q$,

    -- Archivage
    $q$ select d.archived_at::timestamptz, 'status'::text, 'Chauffeur archivé'::text,
               coalesce(d.archive_reason, '')::text, null::int, 'archived'::text, d.id::uuid
          from public.drivers d
         where d.id = $1 and d.archived_at is not null $q$
  ];
begin
  foreach v_leg in array v_legs loop
    begin
      return query execute v_leg using p_driver_id;
    exception when undefined_table or undefined_column or undefined_object then
      null; -- source absente de cette base : on passe à la suivante
    end;
  end loop;
end;
$fn_de$;

revoke all on function public._driver_events(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- La chronologie (filtrable par type, paginée)
-- ------------------------------------------------------------
create or replace function public.admin_driver_history(
  p_driver_id uuid,
  p_kinds text[] default null,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  event_at timestamptz,
  kind text,
  title text,
  detail text,
  amount_fcfa int,
  status text,
  ref_id uuid,
  total_count bigint
)
language plpgsql stable security definer set search_path = public as $fn_adh$
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;

  return query
  select e.event_at, e.kind, e.title, e.detail, e.amount_fcfa, e.status, e.ref_id,
         count(*) over () as total_count
    from public._driver_events(p_driver_id) e
   where p_kinds is null or e.kind = any (p_kinds)
   order by e.event_at desc nulls last, e.kind
   limit greatest(1, least(coalesce(p_limit, 100), 500))
   offset greatest(0, coalesce(p_offset, 0));
end;
$fn_adh$;

revoke all on function public.admin_driver_history(uuid, text[], int, int) from public, anon;
grant execute on function public.admin_driver_history(uuid, text[], int, int) to authenticated;

create or replace function public.admin_driver_history_counts(p_driver_id uuid)
returns table (kind text, n bigint)
language plpgsql stable security definer set search_path = public as $fn_adhc$
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;

  return query
  select e.kind, count(*)::bigint
    from public._driver_events(p_driver_id) e
   group by e.kind;
end;
$fn_adhc$;

revoke all on function public.admin_driver_history_counts(uuid) from public, anon;
grant execute on function public.admin_driver_history_counts(uuid) to authenticated;

-- ------------------------------------------------------------
-- La fiche : identité, véhicule, chiffres depuis l'enrôlement
-- ------------------------------------------------------------
create or replace function public.admin_driver_summary(p_driver_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn_ads$
declare
  d public.drivers;
  pr public.profiles;
  v record;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;

  select * into d from public.drivers where id = p_driver_id;
  if d.id is null then raise exception 'Chauffeur introuvable.'; end if;
  select * into pr from public.profiles where id = d.profile_id;

  select vh.brand, vh.model, vh.plate_number, vh.color, vh.year,
         vh.category::text as category, dp.company_name
    into v
    from public.vehicles vh
    left join public.dealer_partners dp on dp.id = vh.dealer_partner_id
   where vh.id = d.current_vehicle_id;

  return jsonb_build_object(
    'driver_id', d.id,
    'profile_id', d.profile_id,
    'full_name', pr.full_name,
    'phone', pr.phone,
    'avatar_url', pr.avatar_url,
    'status', d.status::text,
    'kyc_status', d.kyc_status::text,
    'application_type', d.application_type::text,
    'license_number', d.license_number,
    'id_card_number', d.id_card_number,
    'is_online', d.is_online,
    'last_seen_at', d.last_seen_at,
    'enrolled_at', d.created_at,
    'archived_at', d.archived_at,
    'archive_reason', d.archive_reason,
    'rating_avg', d.rating_avg,
    'rating_count', d.rating_count,
    'strikes', d.cancellations_driver_fault_count,
    'vehicle', case when v.plate_number is null then null else jsonb_build_object(
        'brand', v.brand, 'model', v.model, 'plate', v.plate_number, 'color', v.color,
        'year', v.year, 'category', v.category, 'dealer', v.company_name) end,
    'rides', (
      select jsonb_build_object(
        'total', count(*),
        'completed', count(*) filter (where r.status = 'completed'),
        'cancelled_by_driver', count(*) filter (where r.status = 'cancelled_by_driver'),
        'cancelled_by_client', count(*) filter (where r.status = 'cancelled_by_client'),
        'volume_fcfa', coalesce(sum(r.price_total_fcfa) filter (where r.status = 'completed'), 0),
        'cash_fcfa', coalesce(sum(r.driver_share_fcfa) filter (where r.status = 'completed'), 0),
        'rachat_fcfa', coalesce(sum(r.driver_rachat_fcfa) filter (where r.status = 'completed'), 0),
        'first_at', min(coalesce(r.ended_at, r.matched_at, r.requested_at)),
        'last_at', max(coalesce(r.ended_at, r.matched_at, r.requested_at))
      )
      from public.rides r where r.driver_id = d.id
    ),
    'wallets', (
      select coalesce(jsonb_object_agg(w.kind::text, w.balance_fcfa), '{}'::jsonb)
        from public.wallets w where w.profile_id = d.profile_id
    ),
    'wallet_totals', (
      select coalesce(jsonb_object_agg(q.type, jsonb_build_object('n', q.n, 'sum', q.s)), '{}'::jsonb)
        from (
          select wt.type::text as type, count(*) as n, sum(wt.amount_fcfa) as s
            from public.wallet_transactions wt
            join public.wallets w on w.id = wt.wallet_id
           where w.profile_id = d.profile_id and wt.status::text = 'success'
           group by wt.type
        ) q
    ),
    -- Sources optionnelles : 0 si la table n'existe pas dans cette base.
    'warnings', public._safe_count('select count(*) from public.driver_warnings where driver_id = $1', d.id),
    'sos', public._safe_count(
      'select count(*) from public.sos_alerts s join public.drivers x on x.profile_id = s.triggered_by where x.id = $1 and s.role = ''driver''',
      d.id),
    'rentals', public._safe_count('select count(*) from public.vehicle_rentals where driver_id = $1', d.id)
  );
end;
$fn_ads$;

revoke all on function public.admin_driver_summary(uuid) from public, anon;
grant execute on function public.admin_driver_summary(uuid) to authenticated;
