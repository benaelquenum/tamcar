-- ============================================================
-- TamCar — TamAssur : prélèvement QUOTIDIEN ferme (2026-10-03)
--
--   Décision de Terence : les 1 000 F de cotisation sont débités
--   chaque jour du wallet « Revenus » du chauffeur, QUITTE À RENDRE
--   LE COMPTE NÉGATIF. Aucun prélèvement le dimanche.
--
--   Avant : le prélèvement n'avait lieu que si le solde Revenus était
--           positif, les jours manqués étaient rattrapés plus tard.
--   Après : chaque jour ouvré (lundi-samedi, heure de Porto-Novo) :
--           Revenus -= cotisation (même sous zéro)
--           Épargne += cotisation
--           ligne du calendrier = « paid » immédiatement.
--           Plus de retard, plus de rattrapage.
--
--   Le solde négatif suit les règles existantes de la dette chauffeur :
--   mise en ligne refusée sous −5 000 F tant que non rechargé.
--   Un push prévient le chauffeur quand il franchit ce seuil.
--
--   Activation : réglage `tamassur_debit_from` (date) dans _push_settings.
--   Tant que la date n'est pas atteinte, la fonction ne fait rien (les
--   comptes de test et de pilote ne sont pas mis en dette avant le
--   lancement). Pour activer dès maintenant :
--     update public._push_settings set value = '2026-10-04' where key = 'tamassur_debit_from';
-- ============================================================

-- A. Nouveau statut « waived » : jour non réclamé (avant le prélèvement ferme)
alter table public.driver_insurance_charges
  drop constraint if exists driver_insurance_charges_status_check;
alter table public.driver_insurance_charges
  add constraint driver_insurance_charges_status_check
  check (status in ('pending', 'partial', 'paid', 'waived'));

-- Historique : les jours jamais prélevés (phase pilote) ne sont pas réclamés.
-- Les jours effectivement épargnés (paid, ou la part déjà prélevée d'un partial) restent tels quels.
update public.driver_insurance_charges
   set status = 'waived'
 where status in ('pending', 'partial');

-- B. Date d'activation (réglage modifiable sans redéploiement) ----------
insert into public._push_settings (key, value)
values ('tamassur_debit_from', '2027-01-01')
on conflict (key) do nothing;

-- C. Sweep quotidien ferme ----------------------------------------------
create or replace function public.charge_driver_insurance(p_period date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn_charge$
declare
  v_period date := coalesce(
    p_period,
    (now() at time zone 'Africa/Porto-Novo')::date
  );
  v_from date;
  v_drv record;
  v_rev_id uuid;
  v_rev_bal int;
  v_epargne_id uuid;
  v_amount int;
  v_charge_id uuid;
  v_new_bal int;
  v_drivers int := 0;
  v_debited int := 0;
  v_total int := 0;
  v_negative int := 0;
begin
  -- Pas de prélèvement le dimanche
  if extract(dow from v_period) = 0 then
    return jsonb_build_object('period', v_period, 'skipped', 'sunday');
  end if;

  -- Pas de prélèvement avant la date d'activation
  select nullif(value, '')::date into v_from
    from public._push_settings where key = 'tamassur_debit_from';
  v_from := coalesce(v_from, date '2027-01-01');
  if v_period < v_from then
    return jsonb_build_object('period', v_period, 'skipped', 'not_started', 'starts_on', v_from);
  end if;

  for v_drv in
    select id, profile_id, coalesce(tamassur_fcfa, 1000) as amount
      from public.drivers where status = 'active'
  loop
    v_drivers := v_drivers + 1;
    v_amount := greatest(v_drv.amount, 1000);

    -- Calendrier : la ligne du jour est créée directement « paid » ;
    -- si elle l'est déjà (relance de la tâche), on ne prélève pas deux fois.
    v_charge_id := null;
    insert into public.driver_insurance_charges
      (driver_id, period, amount_fcfa, collected_fcfa, status, collected_at)
    values (v_drv.id, v_period, v_amount, v_amount, 'paid', now())
    on conflict (driver_id, period) do update
      set amount_fcfa = excluded.amount_fcfa,
          collected_fcfa = excluded.collected_fcfa,
          status = 'paid',
          collected_at = now()
      where driver_insurance_charges.status <> 'paid'
    returning id into v_charge_id;
    if v_charge_id is null then continue; end if;

    -- Poches Revenus et Épargne (création paresseuse), verrou sur Revenus
    select id into v_rev_id from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_revenus';
    if v_rev_id is null then
      insert into public.wallets (profile_id, kind, balance_fcfa)
      values (v_drv.profile_id, 'tamcar_revenus', 0)
      returning id into v_rev_id;
    end if;
    select balance_fcfa into v_rev_bal from public.wallets where id = v_rev_id for update;

    select id into v_epargne_id from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_epargne';
    if v_epargne_id is null then
      insert into public.wallets (profile_id, kind, balance_fcfa)
      values (v_drv.profile_id, 'tamcar_epargne', 0)
      returning id into v_epargne_id;
    end if;

    -- Prélèvement ferme : le solde peut devenir négatif
    v_new_bal := v_rev_bal - v_amount;
    update public.wallets set balance_fcfa = v_new_bal, updated_at = now() where id = v_rev_id;
    update public.wallets set balance_fcfa = balance_fcfa + v_amount, updated_at = now()
     where id = v_epargne_id;

    insert into public.wallet_transactions
      (wallet_id, type, amount_fcfa, provider, status, meta)
    values
      (v_rev_id, 'insurance_premium', v_amount, 'internal', 'success',
       jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm')),
      (v_epargne_id, 'tamassur_saving', v_amount, 'internal', 'success',
       jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm'));

    v_debited := v_debited + 1;
    v_total := v_total + v_amount;
    if v_new_bal < 0 then v_negative := v_negative + 1; end if;

    -- Prévenir le chauffeur quand il franchit la tolérance de découvert (−5 000 F)
    if v_rev_bal >= -5000 and v_new_bal < -5000 then
      perform public._push_notify(
        v_drv.profile_id,
        'Solde Revenus à recharger',
        'Votre solde est de ' || v_new_bal || ' F. Rechargez au moins '
          || (-v_new_bal - 5000) || ' F pour pouvoir repasser en ligne.',
        '/wallet', 'tamassur_debt', false
      );
    end if;
  end loop;

  return jsonb_build_object(
    'period', v_period,
    'drivers_scanned', v_drivers,
    'debited', v_debited,
    'saved_fcfa', v_total,
    'balances_negative', v_negative
  );
end;
$fn_charge$;

revoke execute on function public.charge_driver_insurance(date) from public, anon, authenticated;
grant execute on function public.charge_driver_insurance(date) to service_role;

-- D. Alerte admin : plus de « jours impayés », seulement les lignes réellement en attente
create or replace function public.admin_unpaid_insurance()
returns table (
  driver_id uuid,
  full_name text,
  period date,
  amount_fcfa int,
  collected_fcfa int,
  status text,
  months_overdue int
)
language sql stable security definer set search_path = public as $fn_unpaid$
  select
    c.driver_id,
    p.full_name,
    c.period,
    c.amount_fcfa,
    c.collected_fcfa,
    c.status,
    greatest(
      0,
      (extract(year  from age(date_trunc('month', current_date), c.period)) * 12
     + extract(month from age(date_trunc('month', current_date), c.period)))::int
    ) as months_overdue
  from public.driver_insurance_charges c
  join public.drivers d on d.id = c.driver_id
  join public.profiles p on p.id = d.profile_id
  where c.status in ('pending', 'partial')
    and (select public.is_admin())
  order by c.period asc, p.full_name;
$fn_unpaid$;

-- E. Historique chauffeur : une ligne par jour (la date complete), sans les jours non reclames
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
               ('Cotisation TamAssur ' || to_char(ic.period, 'DD/MM/YYYY'))::text,
               ic.status::text, ic.collected_fcfa::int, ic.status::text, ic.id::uuid
          from public.driver_insurance_charges ic
         where ic.driver_id = $1 and ic.status <> 'waived' $q$,

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
