-- ============================================================
-- Litiges : politique « en cas de doute » réglable (2026-10-04)
--   Quand les données ne permettent pas de trancher :
--     1 = geste commercial (TamCar rembourse les petits frais, dans l'enveloppe)  [défaut, comportement actuel]
--     2 = frais maintenus (0 F, sans intervention humaine ; le client peut contester 48 h)
--     3 = examen par un humain (0 F)
-- ============================================================
insert into public.dispute_rules (key, value, label) values
  ('doubt_policy', 1, 'En cas de doute (les données ne tranchent pas) : 1 = geste commercial, 2 = frais maintenus (0 F, sans humain), 3 = examen humain')
on conflict (key) do nothing;

create or replace function public.admin_set_dispute_rule(p_key text, p_value int)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_value is null or p_value < 0 then raise exception 'Valeur invalide'; end if;
  if p_key = 'doubt_policy' and p_value not in (1, 2, 3) then raise exception 'Choisissez 1, 2 ou 3.'; end if;
  update public.dispute_rules set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'Règle inconnue'; end if;
end;
$fn$;
revoke execute on function public.admin_set_dispute_rule(text, int) from public, anon;
grant execute on function public.admin_set_dispute_rule(text, int) to authenticated;

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
    elsif public._dispute_rule('doubt_policy') = 2 then
      v_decision := 'client_at_fault'; v_rule := 'doubt_client_pays'; v_conf := 'low'; v_verdict := 'client';
      v_expl := 'Les données ne permettent pas de trancher : les frais d''annulation sont maintenus.';
    elsif public._dispute_rule('doubt_policy') <> 3 and v_fee <= v_cap and v_goodwill_n < public._dispute_rule('goodwill_client_max_30d')
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

    if v_rule <> 'no_fee' then
    perform public._dispute_notify(
      r.client_id,
      case v_status when 'human_review' then 'Litige en cours d''examen' else 'Litige : décision rendue' end,
      v_expl || case when v_decision = 'client_at_fault' and v_rule <> 'no_fee'
                     then ' Vous pouvez faire appel pendant ' || public._dispute_rule('appeal_window_hours') || ' h depuis la course.' else '' end,
      p_ride_id
    );
    end if;

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
