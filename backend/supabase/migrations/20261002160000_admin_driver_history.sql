-- ============================================================
-- Admin : historique complet d'un chauffeur DEPUIS SON ENRÔLEMENT (2026-10-02)
--
-- Une chronologie unique qui rassemble, pour un chauffeur :
--   enrôlement (rendez-vous, candidature, création du compte), courses (toutes
--   issues), locations VIP, mouvements de portefeuille, retraits, notes reçues,
--   avertissements, primes d'assurance, retraits TamAssur, demandes directes,
--   alertes SOS, archivage.
--
-- Trois fonctions réservées à l'équipe TamCar :
--   admin_driver_summary(id)           — fiche + chiffres depuis l'enrôlement (jsonb)
--   admin_driver_history(id, …)        — la chronologie, filtrable et paginée
--   admin_driver_history_counts(id)    — nombre d'événements par type
-- La fonction interne _driver_events n'est pas appelable depuis l'application.
-- ============================================================

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
language sql stable set search_path = public as $fn_de$
  with d as (
    select id, profile_id, created_at, application_type, status, archived_at, archive_reason
      from public.drivers where id = p_driver_id
  )

  -- Enrôlement : rendez-vous
  select a.created_at, 'enrolment'::text, 'Rendez-vous d''enrôlement'::text,
         ('Visiteur ' || a.visitor_number || ' · créneau du '
            || to_char(a.slot_at at time zone 'Africa/Porto-Novo', 'DD/MM/YYYY HH24"h"MI'))::text,
         null::int, a.status::text, a.id
    from public.driver_appointments a, d
   where a.profile_id = d.profile_id

  union all
  -- Enrôlement : candidature déposée
  select ap.submitted_at, 'enrolment', 'Candidature déposée',
         ap.vehicle_brand || ' ' || ap.vehicle_model || ' (' || ap.vehicle_plate || ')',
         null, 'submitted', ap.id
    from public.driver_applications ap, d
   where ap.profile_id = d.profile_id

  union all
  -- Enrôlement : décision sur la candidature
  select ap.reviewed_at, 'enrolment',
         case ap.status::text
           when 'approved' then 'Candidature approuvée'
           when 'rejected' then 'Candidature refusée'
           else 'Candidature examinée'
         end,
         coalesce(ap.rejection_reason, ''), null, ap.status::text, ap.id
    from public.driver_applications ap, d
   where ap.profile_id = d.profile_id and ap.reviewed_at is not null

  union all
  -- Enrôlement : compte chauffeur créé
  select d.created_at, 'enrolment', 'Enrôlement : compte chauffeur créé',
         'Formule ' || d.application_type::text, null, d.status::text, d.id
    from d

  union all
  -- Courses, quelle que soit leur issue
  select coalesce(r.ended_at, r.cancelled_at, r.started_at, r.matched_at, r.requested_at),
         'ride', 'Course ' || r.status::text,
         left(r.pickup_address, 60) || ' → ' || left(r.dropoff_address, 60)
           || ' · ' || r.price_total_fcfa || ' F'
           || coalesce(' · ' || r.requested_category::text, ''),
         case when r.status = 'completed' then r.driver_share_fcfa end,
         r.status::text, r.id
    from public.rides r, d
   where r.driver_id = d.id

  union all
  -- Locations VIP
  select coalesce(vr.completed_at, vr.started_at, vr.confirmed_at, vr.created_at),
         'rental', 'Location VIP ' || vr.status,
         to_char(vr.starts_at at time zone 'Africa/Porto-Novo', 'DD/MM/YYYY HH24"h"MI')
           || ' · ' || vr.hours || ' h · ' || vr.price_fcfa || ' F',
         null, vr.status, vr.id
    from public.vehicle_rentals vr
   where vr.driver_id = p_driver_id

  union all
  -- Mouvements de portefeuille (type brut : l'écran le traduit)
  select wt.created_at, 'wallet', wt.type::text,
         w.kind::text || ' · ' || wt.status::text,
         wt.amount_fcfa, wt.status::text, wt.ride_id
    from public.wallet_transactions wt
    join public.wallets w on w.id = wt.wallet_id, d
   where w.profile_id = d.profile_id

  union all
  -- Retraits Mobile Money
  select po.created_at, 'payout', 'Retrait Mobile Money',
         po.provider::text || ' · ' || po.msisdn || ' · ' || po.status,
         po.amount_fcfa, po.status, po.id
    from public.driver_payouts po
   where po.driver_id = p_driver_id

  union all
  -- Notes reçues
  select rt.created_at, 'rating', 'Note reçue : ' || rt.stars || '/5',
         coalesce(rt.comment, ''), null, rt.stars::text, rt.ride_id
    from public.ratings rt, d
   where rt.rated_id = d.profile_id

  union all
  -- Avertissements
  select w.issued_at, 'warning', 'Avertissement (' || w.level::text || ')',
         w.reason || coalesce(' · ' || w.notes, ''), null,
         case when w.resolved_at is null then 'open' else 'resolved' end, w.id
    from public.driver_warnings w
   where w.driver_id = p_driver_id

  union all
  -- Primes d'assurance
  select coalesce(ic.collected_at, ic.created_at), 'insurance',
         'Prime d''assurance ' || to_char(ic.period, 'MM/YYYY'),
         ic.status, ic.collected_fcfa, ic.status, ic.id
    from public.driver_insurance_charges ic
   where ic.driver_id = p_driver_id

  union all
  -- Retraits TamAssur
  select tw.requested_at, 'tamassur', 'Retrait TamAssur (' || tw.status || ')',
         coalesce(tw.method, ''), tw.amount_fcfa, tw.status, tw.id
    from public.tamassur_withdrawals tw
   where tw.driver_id = p_driver_id

  union all
  -- Demandes directes de clients
  select dr.created_at, 'request', 'Demande directe (' || dr.status || ')',
         left(dr.pickup_address, 60) || ' → ' || left(dr.dropoff_address, 60),
         dr.price_total_fcfa, dr.status, dr.id
    from public.driver_requests dr
   where dr.driver_id = p_driver_id

  union all
  -- Alertes SOS déclenchées par le chauffeur
  select s.created_at, 'sos', 'Alerte SOS', coalesce(s.reason, ''), null, s.status, s.id
    from public.sos_alerts s, d
   where s.triggered_by = d.profile_id and s.role = 'driver'

  union all
  -- Archivage
  select d.archived_at, 'status', 'Chauffeur archivé', coalesce(d.archive_reason, ''), null, 'archived', d.id
    from d
   where d.archived_at is not null;
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
    'warnings', (select count(*) from public.driver_warnings w where w.driver_id = d.id),
    'sos', (select count(*) from public.sos_alerts s where s.triggered_by = d.profile_id and s.role = 'driver'),
    'rentals', (select count(*) from public.vehicle_rentals vr where vr.driver_id = d.id)
  );
end;
$fn_ads$;

revoke all on function public.admin_driver_summary(uuid) from public, anon;
grant execute on function public.admin_driver_summary(uuid) to authenticated;
