-- ============================================================
-- TamCar — Litiges automatiques (2026-10-04)
--
--   Objectif : limiter au maximum l'intervention humaine en premier
--   ressort. Un litige d'annulation est tranché AUTOMATIQUEMENT, à
--   l'instant où il naît, par des règles appliquées aux données de la
--   course (GPS du chauffeur, délais, historique). L'humain ne voit que
--   les EXCEPTIONS : montant au-dessus du seuil, contestations dont la
--   décision n'était pas prouvée par les données, erreurs.
--
--   Ordre des règles (première qui s'applique) :
--     1. no_fee            aucun frais facturé : rien à contester
--     2. claim_abuse       client : trop de réclamations sans preuve (30 j)
--     3. driver_pattern    chauffeur : plusieurs clients signalent la même chose (30 j)
--     4. telemetry_refutes le GPS (frais) ne confirme pas le motif du client
--     5. goodwill          geste commercial : TamCar rembourse les petits frais,
--                          dans une enveloppe (par litige, par client, par mois)
--     6. exception         sinon : file d'examen humain (+ alerte admin)
--
--   Contestation (client ou chauffeur, une fois, 48 h / 7 j) : refusée
--   automatiquement si la décision reposait sur une preuve des données ;
--   envoyée à l'humain sinon.
--
--   Points de fiabilité À EXPIRATION remplacent les strikes (qui étaient
--   désactivés) : aucune suspension automatique, seulement un avertissement
--   puis une alerte admin.
--
--   Tous les seuils sont modifiables sans redéploiement (dispute_rules).
-- ============================================================

-- A. Seuils ajustables ---------------------------------------------------
create table if not exists public.dispute_rules (
  key text primary key,
  value int not null,
  label text not null,
  updated_at timestamptz not null default now()
);
alter table public.dispute_rules enable row level security;
drop policy if exists dispute_rules_select on public.dispute_rules;
create policy dispute_rules_select on public.dispute_rules for select using (public.is_admin());

insert into public.dispute_rules (key, value, label) values
  ('goodwill_cap_fcfa',          1500,   'Frais maximum remboursés automatiquement par TamCar (geste commercial), par litige (F)'),
  ('goodwill_client_max_30d',    2,      'Gestes commerciaux maximum par client sur 30 jours'),
  ('goodwill_budget_month_fcfa', 100000, 'Budget mensuel total des gestes commerciaux (F)'),
  ('abuse_client_threshold',     3,      'Réclamations sans preuve en 30 jours avant refus automatique'),
  ('driver_pattern_threshold',   3,      'Clients différents signalant le même chauffeur (30 j) avant décision contre lui'),
  ('appeal_window_hours',        48,     'Délai de contestation pour le client (heures)'),
  ('appeal_max_30d',             2,      'Contestations maximum par client sur 30 jours'),
  ('audit_percent',              5,      'Part des décisions automatiques relue par un humain (%)'),
  ('points_decay_days',          60,     'Durée de vie d''un point de fiabilité (jours)'),
  ('points_fault',               2,      'Points ajoutés au chauffeur pour une faute établie'),
  ('points_warn',                4,      'Points déclenchant un avertissement au chauffeur'),
  ('points_alert',               8,      'Points déclenchant une alerte admin (examen humain, aucune suspension automatique)')
on conflict (key) do nothing;

create or replace function public._dispute_rule(p_key text)
returns int language sql stable security definer set search_path = public as $fn$
  select coalesce((select value from public.dispute_rules where key = p_key), 0);
$fn$;
revoke execute on function public._dispute_rule(text) from public, anon, authenticated;

create or replace function public.admin_set_dispute_rule(p_key text, p_value int)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_value is null or p_value < 0 then raise exception 'Valeur invalide'; end if;
  update public.dispute_rules set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'Règle inconnue'; end if;
end;
$fn$;
revoke execute on function public.admin_set_dispute_rule(text, int) from public, anon;
grant execute on function public.admin_set_dispute_rule(text, int) to authenticated;

-- B. Dossiers de litige --------------------------------------------------
create table if not exists public.dispute_cases (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  kind text not null check (kind in ('client_claim', 'driver_contest')),
  status text not null check (status in ('auto_decided', 'human_review', 'closed')),
  decision text check (decision in ('driver_at_fault', 'client_at_fault', 'goodwill', 'no_fault')),
  rule_code text,
  confidence text check (confidence in ('high', 'medium', 'low')),
  explanation text,
  evidence jsonb not null default '{}',
  fee_fcfa int not null default 0,
  refund_fcfa int not null default 0,
  cost_fcfa int not null default 0,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  appeal_by uuid references public.profiles(id),
  appeal_at timestamptz,
  appeal_note text,
  appeal_outcome text,
  audit boolean not null default false,
  audit_result text check (audit_result in ('confirmed', 'wrong')),
  audit_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  unique (ride_id, kind)
);
create index if not exists dispute_cases_status_idx on public.dispute_cases (status, opened_at desc);
create index if not exists dispute_cases_decided_idx on public.dispute_cases (decided_at desc);
alter table public.dispute_cases enable row level security;
drop policy if exists dispute_cases_select on public.dispute_cases;
create policy dispute_cases_select on public.dispute_cases for select using (public.is_admin());

-- C. Points de fiabilité à expiration -----------------------------------
create table if not exists public.reliability_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('driver', 'client')),
  ride_id uuid references public.rides(id) on delete cascade,
  kind text not null,
  points int not null,
  reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (ride_id, kind, profile_id)
);
create index if not exists reliability_events_profile_idx on public.reliability_events (profile_id, expires_at);
alter table public.reliability_events enable row level security;
drop policy if exists reliability_events_select on public.reliability_events;
create policy reliability_events_select on public.reliability_events for select
  using (profile_id = auth.uid() or public.is_admin());

create or replace function public._driver_active_points(p_profile uuid)
returns int language sql stable security definer set search_path = public as $fn$
  select coalesce(sum(points), 0)::int from public.reliability_events
   where profile_id = p_profile and role = 'driver' and expires_at > now();
$fn$;
revoke execute on function public._driver_active_points(uuid) from public, anon, authenticated;

create or replace function public.my_reliability()
returns table (active_points int, warn_at int, next_expiry timestamptz)
language sql stable security definer set search_path = public as $fn$
  select public._driver_active_points(auth.uid()),
         public._dispute_rule('points_warn'),
         (select min(expires_at) from public.reliability_events
           where profile_id = auth.uid() and role = 'driver' and expires_at > now());
$fn$;
revoke execute on function public.my_reliability() from public, anon;
grant execute on function public.my_reliability() to authenticated;

-- _apply_driver_strike : réactivé en POINTS À EXPIRATION (plus de comptage permanent,
-- jamais de suspension automatique).
create or replace function public._apply_driver_strike(
  p_driver_id uuid,
  p_ride_id uuid,
  p_reason_label text
)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_profile uuid;
  v_before int;
  v_after int;
  v_warn int := public._dispute_rule('points_warn');
  v_alert int := public._dispute_rule('points_alert');
  v_name text;
begin
  if p_driver_id is null then return; end if;
  select d.profile_id, p.full_name into v_profile, v_name
    from public.drivers d join public.profiles p on p.id = d.profile_id
   where d.id = p_driver_id;
  if v_profile is null then return; end if;

  v_before := public._driver_active_points(v_profile);
  insert into public.reliability_events (profile_id, role, ride_id, kind, points, reason, expires_at)
  values (v_profile, 'driver', p_ride_id, 'cancel_fault', public._dispute_rule('points_fault'),
          left(coalesce(p_reason_label, 'annulation'), 300),
          now() + make_interval(days => greatest(1, public._dispute_rule('points_decay_days'))))
  on conflict (ride_id, kind, profile_id) do nothing;
  if not found then return; end if;     -- déjà compté pour cette course
  v_after := public._driver_active_points(v_profile);

  perform public._push_notify(
    v_profile,
    case when v_before < v_warn and v_after >= v_warn then 'Avertissement : points de fiabilité' else 'Signalement enregistré' end,
    'Une course annulée vous est imputée. Vous cumulez ' || v_after || ' point' || case when v_after > 1 then 's' else '' end
      || ' de fiabilité (ils s''effacent au bout de ' || public._dispute_rule('points_decay_days')
      || ' jours). Vous pouvez contester depuis votre espace.',
    '/strikes', 'strike:' || p_ride_id::text, v_before < v_warn and v_after >= v_warn
  );

  if v_before < v_alert and v_after >= v_alert then
    perform public._admin_alert(
      'driver_points', 'normal',
      v_name || ' : ' || v_after || ' points de fiabilité',
      'Seuil d''alerte atteint. Aucune suspension automatique : à examiner (échange, rappel, décision).',
      '/admin/drivers/' || p_driver_id::text, p_driver_id
    );
  end if;
end;
$fn$;
revoke execute on function public._apply_driver_strike(uuid, uuid, text) from public, anon, authenticated;

-- Une contestation acceptée retire les points de la course.
create or replace function public._strike_revoked_cleanup()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  delete from public.reliability_events where ride_id = new.id and kind = 'cancel_fault';
  return new;
end;
$fn$;
revoke execute on function public._strike_revoked_cleanup() from public, anon, authenticated;

drop trigger if exists rides_strike_revoked on public.rides;
create trigger rides_strike_revoked
  after update of driver_strike_upheld on public.rides
  for each row
  when (new.driver_strike_upheld is false and old.driver_strike_upheld is distinct from false)
  execute function public._strike_revoked_cleanup();

-- D. Application d'un verdict (argent) : partagée par l'automate et l'admin
--    'driver'   : faute chauffeur -> client remboursé, part du chauffeur reprise, points
--    'client'   : faute client / réclamation rejetée -> statu quo
--    'goodwill' : geste commercial -> client remboursé par TamCar, le chauffeur garde sa part
create or replace function public._dispute_apply_verdict(
  p_ride_id uuid,
  p_verdict text,
  p_note text
)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  v_fees int;
  v_refunded int;
  v_refund int := 0;
  v_reimb int;
  v_reclaimed int;
  v_reclaim int := 0;
  v_cw uuid;
  v_dp uuid;
  v_dw uuid;
begin
  if p_verdict not in ('client', 'driver', 'goodwill') then raise exception 'Verdict invalide'; end if;
  select * into r from public.rides where id = p_ride_id for update;
  if r.id is null then raise exception 'Course introuvable'; end if;

  if p_verdict in ('driver', 'goodwill') then
    select coalesce(sum(amount_fcfa), 0)::int into v_fees from public.wallet_transactions
     where ride_id = p_ride_id and type = 'cancellation_fee';
    select coalesce(sum(amount_fcfa), 0)::int into v_refunded from public.wallet_transactions
     where ride_id = p_ride_id and type = 'refund';
    v_refund := greatest(0, v_fees - v_refunded);

    if v_refund > 0 then
      insert into public.wallets (profile_id, kind, balance_fcfa) values (r.client_id, 'tamcar_credit', 0)
        on conflict (profile_id, kind) do nothing;
      select id into v_cw from public.wallets where profile_id = r.client_id and kind = 'tamcar_credit';
      update public.wallets set balance_fcfa = balance_fcfa + v_refund, updated_at = now() where id = v_cw;
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
        values (v_cw, 'refund', v_refund, p_ride_id, 'success');
    end if;
  end if;

  if p_verdict = 'driver' then
    select coalesce(sum(amount_fcfa), 0)::int into v_reimb from public.wallet_transactions
     where ride_id = p_ride_id and type = 'cancellation_reimbursement';
    select coalesce(sum(amount_fcfa), 0)::int into v_reclaimed from public.wallet_transactions
     where ride_id = p_ride_id and type = 'payment';
    v_reclaim := greatest(0, v_reimb - v_reclaimed);

    if v_reclaim > 0 and r.driver_id is not null then
      select profile_id into v_dp from public.drivers where id = r.driver_id;
      if v_dp is not null then
        select id into v_dw from public.wallets where profile_id = v_dp and kind = 'tamcar_revenus';
        if v_dw is not null then
          update public.wallets set balance_fcfa = balance_fcfa - v_reclaim, updated_at = now() where id = v_dw;
          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
            values (v_dw, 'payment', v_reclaim, p_ride_id, 'success');
        end if;
      end if;
    end if;

    if r.driver_id is not null then
      update public.drivers
         set cancellations_driver_fault_count = cancellations_driver_fault_count + 1
       where id = r.driver_id;
      perform public._apply_driver_strike(r.driver_id, p_ride_id, left(coalesce(p_note, 'litige tranché contre le chauffeur'), 200));
    end if;
  end if;

  update public.rides
     set cancel_attributed_to = case p_verdict when 'driver' then 'driver' when 'goodwill' then 'neutral' else 'client' end,
         cancel_disputed = false,
         cancel_driver_fault_evidence = coalesce(nullif(cancel_driver_fault_evidence, '') || E'\n', '') || coalesce(p_note, ''),
         updated_at = now()
   where id = p_ride_id;

  return jsonb_build_object('refund', v_refund, 'reclaim', v_reclaim);
end;
$fn$;
revoke execute on function public._dispute_apply_verdict(uuid, text, text) from public, anon, authenticated;

-- Résolution humaine (admin) : même chemin, avec le verdict « geste commercial » en plus.
create or replace function public.admin_resolve_cancellation_dispute(
  p_ride_id uuid,
  p_verdict text,
  p_admin_note text default null
)
returns public.rides
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  result public.rides;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_verdict not in ('client', 'driver', 'goodwill') then
    raise exception 'Verdict invalide (client|driver|goodwill)';
  end if;
  select * into r from public.rides where id = p_ride_id;
  if r.id is null then raise exception 'Ride not found'; end if;
  if not r.cancel_disputed then raise exception 'Ride non en litige'; end if;

  perform public._dispute_apply_verdict(
    p_ride_id, p_verdict,
    'Arbitrage admin : ' || case p_verdict when 'driver' then 'faute chauffeur' when 'goodwill' then 'geste commercial' else 'faute client' end
      || coalesce(' (' || nullif(trim(p_admin_note), '') || ')', '')
  );
  select * into result from public.rides where id = p_ride_id;
  return result;
end;
$fn$;
revoke execute on function public.admin_resolve_cancellation_dispute(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_cancellation_dispute(uuid, text, text) to authenticated;

-- E. Notification d'une partie (jamais bloquante) ------------------------
create or replace function public._dispute_notify(p_profile uuid, p_title text, p_body text, p_ride uuid)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if p_profile is null then return; end if;
  perform public._push_notify(p_profile, p_title, p_body, '/ride/' || p_ride::text, 'dispute:' || p_ride::text, false);
exception when others then
  null;
end;
$fn$;
revoke execute on function public._dispute_notify(uuid, text, text, uuid) from public, anon, authenticated;

-- F. Le cœur : décision automatique d'une réclamation client -------------
create or replace function public._dispute_decide_claim(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  drv public.drivers;
  v_fee int := 0;
  v_reason text;
  v_cap int := public._dispute_rule('goodwill_cap_fcfa');
  v_prior int;
  v_others int;
  v_goodwill_n int;
  v_budget_used int;
  v_seen_s int;
  v_still_s int;
  v_dist_now int;
  v_secs_matched int;
  v_ev jsonb;
  v_decision text;
  v_rule text;
  v_conf text;
  v_expl text;
  v_verdict text;
  v_res jsonb;
  v_refund int := 0;
  v_cost int := 0;
  v_audit boolean := false;
  v_status text := 'auto_decided';
begin
  select * into r from public.rides where id = p_ride_id;
  if r.id is null or r.cancel_disputed is not true or r.status::text <> 'cancelled_by_client' then return; end if;
  if exists (select 1 from public.dispute_cases where ride_id = p_ride_id and kind = 'client_claim') then return; end if;

  begin
    select * into drv from public.drivers where id = r.driver_id;
    v_reason := r.cancel_reason_user;
    select coalesce(sum(amount_fcfa), 0)::int into v_fee from public.wallet_transactions
     where ride_id = p_ride_id and type = 'cancellation_fee';

    v_seen_s := case when drv.last_seen_at is null then 99999
                     else greatest(0, extract(epoch from (coalesce(r.ended_at, now()) - drv.last_seen_at)))::int end;
    v_still_s := case when drv.last_moved_at is null then null
                      else greatest(0, extract(epoch from (coalesce(r.ended_at, now()) - drv.last_moved_at)))::int end;
    v_dist_now := case when drv.current_location is null or r.pickup_location is null then null
                       else st_distance(drv.current_location, r.pickup_location)::int end;
    v_secs_matched := case when r.matched_at is null then null
                           else extract(epoch from (coalesce(r.ended_at, now()) - r.matched_at))::int end;

    select count(*)::int into v_prior
      from public.dispute_cases c join public.rides x on x.id = c.ride_id
     where x.client_id = r.client_id and c.kind = 'client_claim' and c.ride_id <> p_ride_id
       and c.opened_at > now() - interval '30 days' and c.decision is distinct from 'driver_at_fault';

    select count(distinct x.client_id)::int into v_others
      from public.rides x
     where x.driver_id = r.driver_id and x.id <> p_ride_id and x.client_id <> r.client_id
       and x.status::text = 'cancelled_by_client'
       and x.cancel_reason_user in ('driver_asked', 'driver_not_moving', 'wrong_direction', 'wait_too_long')
       and x.ended_at > now() - interval '30 days';

    select count(*)::int into v_goodwill_n
      from public.dispute_cases c join public.rides x on x.id = c.ride_id
     where x.client_id = r.client_id and c.decision = 'goodwill' and c.decided_at > now() - interval '30 days';

    select coalesce(sum(cost_fcfa), 0)::int into v_budget_used
      from public.dispute_cases where decision = 'goodwill' and decided_at >= date_trunc('month', now());

    v_ev := jsonb_build_object(
      'motif_client', v_reason, 'frais_fcfa', v_fee,
      'secondes_depuis_attribution', v_secs_matched,
      'gps_chauffeur_age_s', v_seen_s, 'immobile_depuis_s', v_still_s,
      'distance_au_match_m', r.driver_distance_at_match_m, 'distance_actuelle_m', v_dist_now,
      'reclamations_client_30j', v_prior, 'autres_clients_contre_chauffeur_30j', v_others,
      'gestes_client_30j', v_goodwill_n, 'budget_gestes_mois_fcfa', v_budget_used
    );

    if v_fee <= 0 then
      v_decision := 'no_fault'; v_rule := 'no_fee'; v_conf := 'high'; v_verdict := 'client';
      v_expl := 'Aucun frais d''annulation n''a été facturé : il n''y a rien à contester.';
    elsif v_prior >= public._dispute_rule('abuse_client_threshold') then
      v_decision := 'client_at_fault'; v_rule := 'claim_abuse'; v_conf := 'medium'; v_verdict := 'client';
      v_expl := 'Plusieurs de vos signalements récents n''ont pas pu être confirmés par les données des courses. Les frais d''annulation sont maintenus.';
    elsif v_others >= greatest(1, public._dispute_rule('driver_pattern_threshold') - 1) then
      v_decision := 'driver_at_fault'; v_rule := 'driver_pattern'; v_conf := 'medium'; v_verdict := 'driver';
      v_expl := 'Plusieurs clients ont signalé le même comportement de ce chauffeur récemment : votre signalement est retenu. Les frais sont remboursés.';
    elsif v_reason in ('driver_not_moving', 'wrong_direction', 'wait_too_long') and v_seen_s <= 180 then
      v_decision := 'client_at_fault'; v_rule := 'telemetry_refutes'; v_conf := 'high'; v_verdict := 'client';
      v_expl := 'Les données de la course (position GPS du chauffeur, délais) ne confirment pas le motif indiqué'
        || case v_reason
             when 'driver_not_moving' then ' : le chauffeur était en mouvement.'
             when 'wrong_direction' then ' : le chauffeur se dirigeait vers vous.'
             else ' : le délai d''attente reste normal.' end
        || ' Les frais d''annulation sont maintenus.';
    elsif v_fee <= v_cap and v_goodwill_n < public._dispute_rule('goodwill_client_max_30d')
          and v_budget_used + v_fee <= public._dispute_rule('goodwill_budget_month_fcfa') then
      v_decision := 'goodwill'; v_rule := 'goodwill'; v_conf := 'low'; v_verdict := 'goodwill';
      v_expl := 'Les données ne permettent pas de trancher. À titre exceptionnel, TamCar vous rembourse les frais de ' || v_fee || ' F.';
    else
      v_status := 'human_review'; v_rule := 'exception'; v_conf := 'low';
      v_expl := 'Votre dossier est examiné par l''équipe TamCar. Vous recevrez une réponse sous 24 h.';
    end if;

    if v_status = 'auto_decided' then
      v_res := public._dispute_apply_verdict(p_ride_id, v_verdict, 'Décision automatique (' || v_rule || ') : ' || v_expl);
      v_refund := coalesce((v_res ->> 'refund')::int, 0);
      v_cost := case v_verdict
                  when 'goodwill' then v_refund
                  when 'driver' then greatest(0, v_refund - coalesce((v_res ->> 'reclaim')::int, 0))
                  else 0 end;
      v_audit := random() * 100 < public._dispute_rule('audit_percent');
    end if;

    insert into public.dispute_cases (ride_id, kind, status, decision, rule_code, confidence, explanation,
                                      evidence, fee_fcfa, refund_fcfa, cost_fcfa, decided_at, audit)
    values (p_ride_id, 'client_claim', v_status, v_decision, v_rule, v_conf, v_expl, v_ev, v_fee, v_refund, v_cost,
            case when v_status = 'auto_decided' then now() end, v_audit);

    perform public._dispute_notify(
      r.client_id,
      case v_status when 'human_review' then 'Litige en cours d''examen' else 'Litige : décision rendue' end,
      v_expl || case when v_decision = 'client_at_fault' and v_rule <> 'no_fee'
                     then ' Vous pouvez faire appel pendant ' || public._dispute_rule('appeal_window_hours') || ' h depuis la course.' else '' end,
      p_ride_id
    );

    if v_status = 'human_review' then
      perform public._admin_alert('dispute_review', 'normal', 'Litige à examiner',
        'Annulation avec frais de ' || v_fee || ' F : les règles automatiques n''ont pas pu trancher.', '/admin/litiges', p_ride_id);
    end if;
  exception when others then
    -- Jamais bloquer l'annulation du client : en cas d'erreur, un humain reprend le dossier.
    insert into public.dispute_cases (ride_id, kind, status, rule_code, confidence, explanation, evidence)
    values (p_ride_id, 'client_claim', 'human_review', 'auto_error', 'low',
            'Votre dossier est examiné par l''équipe TamCar. Vous recevrez une réponse sous 24 h.',
            jsonb_build_object('erreur', sqlerrm))
    on conflict (ride_id, kind) do nothing;
    perform public._admin_alert('dispute_review', 'normal', 'Litige à examiner',
      'Erreur du traitement automatique : dossier transmis pour examen.', '/admin/litiges', p_ride_id);
  end;
end;
$fn$;
revoke execute on function public._dispute_decide_claim(uuid) from public, anon, authenticated;

-- G. Contestation du chauffeur : refus automatique si la preuve est dans les données
create or replace function public._dispute_decide_contest(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  v_dp uuid;
  v_expl text;
begin
  select * into r from public.rides where id = p_ride_id;
  if r.id is null or r.driver_strike_disputed_at is null or r.driver_strike_resolved_at is not null then return; end if;
  if exists (select 1 from public.dispute_cases where ride_id = p_ride_id and kind = 'driver_contest') then return; end if;
  select profile_id into v_dp from public.drivers where id = r.driver_id;

  begin
    if r.cancel_reason = 'free_driver_fault' or r.cancel_reason in ('driver_cancelled', 'booking_late') then
      v_expl := case when r.cancel_reason = 'free_driver_fault'
                  then 'Votre contestation est refusée : la faute est établie par les données enregistrées de la course (' || coalesce(r.cancel_driver_fault_evidence, 'position GPS') || ').'
                  else 'Votre contestation est refusée : cette annulation a été faite par vous-même depuis l''application.' end;
      update public.rides
         set driver_strike_upheld = true, driver_strike_resolved_at = now(), cancel_disputed = false,
             cancel_driver_fault_evidence = coalesce(nullif(cancel_driver_fault_evidence, '') || E'\n', '') || '[Contestation refusée automatiquement : preuve dans les données]',
             updated_at = now()
       where id = p_ride_id;
      insert into public.dispute_cases (ride_id, kind, status, decision, rule_code, confidence, explanation, evidence, decided_at, audit)
      values (p_ride_id, 'driver_contest', 'auto_decided', 'driver_at_fault', 'contest_proven', 'high', v_expl,
              jsonb_build_object('motif_chauffeur', r.driver_strike_dispute_reason, 'preuve', r.cancel_driver_fault_evidence),
              now(), random() * 100 < public._dispute_rule('audit_percent'));
      perform public._dispute_notify(v_dp, 'Contestation : décision rendue', v_expl, p_ride_id);
    else
      insert into public.dispute_cases (ride_id, kind, status, rule_code, confidence, explanation, evidence)
      values (p_ride_id, 'driver_contest', 'human_review', 'contest_needs_human', 'low',
              'Votre contestation est examinée par l''équipe TamCar. Vous recevrez une réponse sous 24 h.',
              jsonb_build_object('motif_chauffeur', r.driver_strike_dispute_reason, 'attribution', r.cancel_attributed_to));
      perform public._dispute_notify(v_dp, 'Contestation en cours d''examen',
        'Votre contestation est examinée par l''équipe TamCar. Vous recevrez une réponse sous 24 h.', p_ride_id);
      perform public._admin_alert('dispute_review', 'normal', 'Contestation chauffeur à examiner',
        'La décision initiale ne reposait pas sur une preuve des données.', '/admin/litiges', p_ride_id);
    end if;
  exception when others then
    insert into public.dispute_cases (ride_id, kind, status, rule_code, confidence, explanation, evidence)
    values (p_ride_id, 'driver_contest', 'human_review', 'auto_error', 'low',
            'Votre contestation est examinée par l''équipe TamCar.', jsonb_build_object('erreur', sqlerrm))
    on conflict (ride_id, kind) do nothing;
    perform public._admin_alert('dispute_review', 'normal', 'Contestation chauffeur à examiner',
      'Erreur du traitement automatique : dossier transmis pour examen.', '/admin/litiges', p_ride_id);
  end;
end;
$fn$;
revoke execute on function public._dispute_decide_contest(uuid) from public, anon, authenticated;

-- H. Déclencheurs ------------------------------------------------------------
-- Réclamation client : décidée à la FIN de la transaction (les frais sont alors débités).
create or replace function public._dispute_trg_claim()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  perform public._dispute_decide_claim(new.id);
  return null;
end;
$fn$;
revoke execute on function public._dispute_trg_claim() from public, anon, authenticated;

drop trigger if exists rides_dispute_claim on public.rides;
create constraint trigger rides_dispute_claim
  after update of cancel_disputed on public.rides
  deferrable initially deferred
  for each row
  when (new.cancel_disputed is true and old.cancel_disputed is distinct from true
        and new.status::text = 'cancelled_by_client' and new.driver_strike_disputed_at is null)
  execute function public._dispute_trg_claim();

create or replace function public._dispute_trg_contest()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  perform public._dispute_decide_contest(new.id);
  return null;
end;
$fn$;
revoke execute on function public._dispute_trg_contest() from public, anon, authenticated;

drop trigger if exists rides_dispute_contest on public.rides;
create constraint trigger rides_dispute_contest
  after update of driver_strike_disputed_at on public.rides
  deferrable initially deferred
  for each row
  when (new.driver_strike_disputed_at is not null and old.driver_strike_disputed_at is null)
  execute function public._dispute_trg_contest();

-- Clôture d'un dossier d'examen humain (verdict de l'admin).
create or replace function public._dispute_trg_close()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_case public.dispute_cases;
  v_decision text;
  v_text text;
begin
  select * into v_case from public.dispute_cases
   where ride_id = new.id and status = 'human_review'
   order by opened_at desc limit 1;
  if v_case.id is null then return null; end if;

  if v_case.kind = 'driver_contest' then
    v_decision := case when new.driver_strike_upheld is false then 'client_at_fault' else 'driver_at_fault' end;
  else
    v_decision := case new.cancel_attributed_to when 'driver' then 'driver_at_fault' when 'neutral' then 'goodwill' else 'client_at_fault' end;
  end if;

  update public.dispute_cases
     set status = 'closed', decision = v_decision, decided_at = now(),
         reviewed_by = auth.uid(), reviewed_at = now(),
         appeal_outcome = case when appeal_at is null then null
                               when decision is not null and decision = v_decision then 'upheld' else 'overturned' end,
         explanation = case v_decision
           when 'driver_at_fault' then 'Après examen par l''équipe TamCar, la faute du chauffeur est retenue.'
           when 'goodwill' then 'Après examen, TamCar vous rembourse les frais à titre de geste commercial.'
           else 'Après examen par l''équipe TamCar, la réclamation n''est pas retenue.' end
   where id = v_case.id
   returning explanation into v_text;

  if v_case.kind = 'client_claim' then
    perform public._dispute_notify(new.client_id, 'Litige : décision rendue',
      v_text || case v_decision when 'client_at_fault' then ' Les frais d''annulation restent dus.' else ' Les frais vous sont remboursés.' end, new.id);
  else
    perform public._dispute_notify((select profile_id from public.drivers where id = new.driver_id), 'Contestation : décision rendue',
      case when new.driver_strike_upheld is false then 'Votre contestation est acceptée : le signalement est retiré.' else 'Votre contestation est refusée après examen.' end, new.id);
  end if;
  return null;
end;
$fn$;
revoke execute on function public._dispute_trg_close() from public, anon, authenticated;

drop trigger if exists rides_dispute_close on public.rides;
create trigger rides_dispute_close
  after update of cancel_disputed on public.rides
  for each row
  when (old.cancel_disputed is true and new.cancel_disputed is false)
  execute function public._dispute_trg_close();

-- I. Filet de sécurité : dossiers restés sans décision ----------------------
create or replace function public._dispute_sweep()
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in
    select r.id from public.rides r
     where r.cancel_disputed is true and r.status::text = 'cancelled_by_client'
       and r.driver_strike_disputed_at is null
       and coalesce(r.ended_at, r.updated_at) < now() - interval '2 minutes'
       and not exists (select 1 from public.dispute_cases c where c.ride_id = r.id and c.kind = 'client_claim')
  loop
    perform public._dispute_decide_claim(v_id);
    v_n := v_n + 1;
  end loop;
  for v_id in
    select r.id from public.rides r
     where r.driver_strike_disputed_at is not null and r.driver_strike_resolved_at is null
       and r.driver_strike_disputed_at < now() - interval '2 minutes'
       and not exists (select 1 from public.dispute_cases c where c.ride_id = r.id and c.kind = 'driver_contest')
  loop
    perform public._dispute_decide_contest(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;
revoke execute on function public._dispute_sweep() from public, anon, authenticated;

do $cron$
begin
  perform cron.unschedule('dispute-sweep');
exception when others then null;
end
$cron$;
select cron.schedule('dispute-sweep', '*/5 * * * *', $job$ select public._dispute_sweep(); $job$);

-- J. Contestation du client (une fois, dans le délai) -----------------------
create or replace function public.client_appeal_dispute(p_ride_id uuid, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  c public.dispute_cases;
  v_n int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r.id is null or r.client_id <> auth.uid() then raise exception 'Course introuvable'; end if;
  select * into c from public.dispute_cases where ride_id = p_ride_id and kind = 'client_claim';
  if c.id is null or c.status <> 'auto_decided' then raise exception 'Aucune décision à contester'; end if;
  if c.decision <> 'client_at_fault' or c.rule_code = 'no_fee' then raise exception 'Cette décision ne peut pas être contestée'; end if;
  if c.appeal_at is not null then raise exception 'Vous avez déjà contesté cette décision'; end if;
  if now() > c.decided_at + make_interval(hours => public._dispute_rule('appeal_window_hours')) then
    raise exception 'Délai de contestation dépassé';
  end if;
  if p_note is null or length(trim(p_note)) < 10 then
    raise exception 'Expliquez en au moins 10 caractères ce qui s''est passé.';
  end if;
  select count(*)::int into v_n from public.dispute_cases d join public.rides x on x.id = d.ride_id
   where x.client_id = auth.uid() and d.appeal_at > now() - interval '30 days';
  if v_n >= public._dispute_rule('appeal_max_30d') then raise exception 'Trop de contestations récentes'; end if;

  if c.confidence = 'high' then
    update public.dispute_cases
       set appeal_by = auth.uid(), appeal_at = now(), appeal_note = trim(p_note), appeal_outcome = 'rejected_auto',
           explanation = explanation || ' Votre contestation a été examinée automatiquement : les données enregistrées confirment la décision.'
     where id = c.id;
    return jsonb_build_object('status', 'rejected_auto',
      'message', 'Votre contestation a été examinée automatiquement : les données enregistrées confirment la décision.');
  end if;

  update public.dispute_cases
     set status = 'human_review', appeal_by = auth.uid(), appeal_at = now(), appeal_note = trim(p_note), rule_code = 'appeal'
   where id = c.id;
  update public.rides set cancel_disputed = true, updated_at = now() where id = p_ride_id;
  perform public._admin_alert('dispute_review', 'normal', 'Contestation client à examiner',
    left(trim(p_note), 140), '/admin/litiges', p_ride_id);
  return jsonb_build_object('status', 'human_review',
    'message', 'Votre contestation est examinée par l''équipe TamCar. Vous recevrez une réponse sous 24 h.');
end;
$fn$;
revoke execute on function public.client_appeal_dispute(uuid, text) from public, anon;
grant execute on function public.client_appeal_dispute(uuid, text) to authenticated;

-- Ce que voit le client sur sa course annulée
create or replace function public.client_dispute_for_ride(p_ride_id uuid)
returns table (
  status text, decision text, explanation text, refund_fcfa int, decided_at timestamptz,
  can_appeal boolean, appeal_deadline timestamptz, appealed boolean, appeal_outcome text
)
language sql stable security definer set search_path = public as $fn$
  select c.status, c.decision, c.explanation, c.refund_fcfa, c.decided_at,
         (c.status = 'auto_decided' and c.decision = 'client_at_fault' and c.rule_code <> 'no_fee' and c.appeal_at is null
           and now() <= c.decided_at + make_interval(hours => public._dispute_rule('appeal_window_hours'))) as can_appeal,
         c.decided_at + make_interval(hours => public._dispute_rule('appeal_window_hours')) as appeal_deadline,
         c.appeal_at is not null as appealed,
         c.appeal_outcome
    from public.dispute_cases c join public.rides r on r.id = c.ride_id
   where c.ride_id = p_ride_id and c.kind = 'client_claim' and r.client_id = auth.uid();
$fn$;
revoke execute on function public.client_dispute_for_ride(uuid) from public, anon;
grant execute on function public.client_dispute_for_ride(uuid) to authenticated;

-- K. Back-office : file d'exceptions, contrôle qualité, indicateurs ----------
create or replace function public.admin_dispute_queue()
returns table (
  ride_id uuid, kind text, rule_code text, explanation text, evidence jsonb, fee_fcfa int,
  opened_at timestamptz, appeal_note text, client_name text, driver_name text, driver_points int,
  pickup_address text, dropoff_address text, cancel_reason_user text, driver_dispute_reason text
)
language sql stable security definer set search_path = public as $fn$
  select c.ride_id, c.kind, c.rule_code, c.explanation, c.evidence, c.fee_fcfa, c.opened_at, c.appeal_note,
         cp.full_name, dp.full_name, public._driver_active_points(d.profile_id),
         r.pickup_address, r.dropoff_address, r.cancel_reason_user, r.driver_strike_dispute_reason
    from public.dispute_cases c
    join public.rides r on r.id = c.ride_id
    left join public.profiles cp on cp.id = r.client_id
    left join public.drivers d on d.id = r.driver_id
    left join public.profiles dp on dp.id = d.profile_id
   where c.status = 'human_review' and public.is_admin()
   order by c.opened_at asc;
$fn$;
revoke execute on function public.admin_dispute_queue() from public, anon;
grant execute on function public.admin_dispute_queue() to authenticated;

create or replace function public.admin_dispute_recent(p_scope text default 'recent', p_limit int default 40)
returns table (
  ride_id uuid, kind text, decision text, rule_code text, confidence text, explanation text, evidence jsonb,
  fee_fcfa int, refund_fcfa int, cost_fcfa int, decided_at timestamptz, audit boolean, audit_result text,
  appeal_outcome text, client_name text, driver_name text, reviewed boolean
)
language sql stable security definer set search_path = public as $fn$
  select c.ride_id, c.kind, c.decision, c.rule_code, c.confidence, c.explanation, c.evidence,
         c.fee_fcfa, c.refund_fcfa, c.cost_fcfa, c.decided_at, c.audit, c.audit_result, c.appeal_outcome,
         cp.full_name, dp.full_name, c.reviewed_by is not null
    from public.dispute_cases c
    join public.rides r on r.id = c.ride_id
    left join public.profiles cp on cp.id = r.client_id
    left join public.drivers d on d.id = r.driver_id
    left join public.profiles dp on dp.id = d.profile_id
   where c.status in ('auto_decided', 'closed') and public.is_admin()
     and (p_scope <> 'audit' or (c.audit and c.audit_result is null and c.reviewed_by is null))
   order by c.decided_at desc nulls last
   limit least(greatest(p_limit, 1), 200);
$fn$;
revoke execute on function public.admin_dispute_recent(text, int) from public, anon;
grant execute on function public.admin_dispute_recent(text, int) to authenticated;

create or replace function public.admin_audit_case(p_ride_id uuid, p_kind text, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update public.dispute_cases
     set audit_result = case when p_ok then 'confirmed' else 'wrong' end, audit_note = nullif(trim(p_note), ''),
         reviewed_by = auth.uid(), reviewed_at = now()
   where ride_id = p_ride_id and kind = p_kind;
  if not found then raise exception 'Dossier introuvable'; end if;
end;
$fn$;
revoke execute on function public.admin_audit_case(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_audit_case(uuid, text, boolean, text) to authenticated;

create or replace function public.admin_dispute_metrics(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_total int; v_auto int; v_human int; v_appeals int; v_over int; v_audit_pending int; v_audit_wrong int;
  v_cost int; v_cost_month int;
begin
  if not public.is_admin() then return '{}'::jsonb; end if;
  select count(*), count(*) filter (where reviewed_by is null and status <> 'human_review'),
         count(*) filter (where reviewed_by is not null or status = 'human_review'),
         count(*) filter (where appeal_at is not null),
         count(*) filter (where appeal_outcome = 'overturned'),
         coalesce(sum(cost_fcfa) filter (where decision = 'goodwill'), 0)
    into v_total, v_auto, v_human, v_appeals, v_over, v_cost
    from public.dispute_cases where opened_at > now() - make_interval(days => greatest(1, p_days));
  select count(*) into v_audit_pending from public.dispute_cases where audit and audit_result is null and reviewed_by is null and status = 'auto_decided';
  select count(*) into v_audit_wrong from public.dispute_cases where audit_result = 'wrong' and opened_at > now() - make_interval(days => greatest(1, p_days));
  select coalesce(sum(cost_fcfa), 0) into v_cost_month from public.dispute_cases
   where decision = 'goodwill' and decided_at >= date_trunc('month', now());
  return jsonb_build_object(
    'days', p_days, 'total', v_total, 'auto', v_auto, 'human', v_human,
    'auto_pct', case when v_total = 0 then null else round(100.0 * v_auto / v_total) end,
    'appeals', v_appeals, 'overturned', v_over, 'audit_pending', v_audit_pending, 'audit_wrong', v_audit_wrong,
    'goodwill_cost', v_cost, 'goodwill_cost_month', v_cost_month,
    'goodwill_budget', public._dispute_rule('goodwill_budget_month_fcfa'));
end;
$fn$;
revoke execute on function public.admin_dispute_metrics(int) from public, anon;
grant execute on function public.admin_dispute_metrics(int) to authenticated;

-- L. Badge « Litiges » = dossiers en examen humain ---------------------------
create or replace function public.admin_badge_counts()
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.is_admin() then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'sos',             (select count(*) from public.sos_alerts where status = 'open'),
    'sos_active',      (select count(*) from public.sos_alerts where status <> 'resolved'),
    'debts',           (select count(*) from public.admin_alerts where kind = 'driver_debt' and seen_at is null),
    'debts_suspended', (select count(*) from public.drivers where status::text = 'suspended' and suspension_reason = 'debt'),
    'disputes',        (select count(*) from public.dispute_cases where status = 'human_review')
  );
end;
$fn$;
revoke execute on function public.admin_badge_counts() from public, anon;
grant execute on function public.admin_badge_counts() to authenticated;

-- Litiges déjà ouverts avant l'automate : l'automate les reprend à la prochaine passe (5 min).
