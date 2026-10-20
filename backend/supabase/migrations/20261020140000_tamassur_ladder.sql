-- ============================================================
-- TamAssur : épargne garantie par paliers annuels, alignée sur la durée du contrat du véhicule (décision du fondateur, 2026-10-20)
--
--   • Moto : 12 mois -> 250 000 F (= durée du contrat).
--   • Tricycle, Essentiel, Confort, VIP : 500 000 F à 24 mois, puis 250 000 F de plus à chaque année de contrat accomplie jusqu'au terme du contrat
--     (Essentiel 36 mois : 750 000 F ; Confort 48 mois : 1 000 000 F ; VIP 60 mois : 1 250 000 F). Le chauffeur peut retirer à chaque palier
--     ou attendre le terme et tout retirer d'un coup.
--   • Véhicule hors cadre (durée de contrat différente de celle de sa catégorie) : retrait seulement au terme du contrat, montant proportionnel
--     (250 000 F x durée en mois / 12).
--   • Condition constante : le compte est à jour (aucune dette sur le portefeuille Revenus), autrement dit les objectifs ont été atteints.
-- La durée avant le premier retrait (tamassur_months_*) reste réglable ; le terme est la durée du contrat du véhicule (_contract_months).
-- ============================================================

-- Le contrat du véhicule suit-il la durée de sa catégorie ?
create or replace function public._tamassur_standard(p_driver uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select v.contract_months is null
      or v.contract_months = case v.category::text
           when 'moto' then public._program_rule('contract_months_moto')
           when 'tricycle' then public._program_rule('contract_months_tricycle')
           when 'confort' then public._program_rule('contract_months_confort')
           when 'premium' then public._program_rule('contract_months_premium')
           else public._program_rule('contract_months_essentiel') end
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = p_driver;
$fn$;
revoke execute on function public._tamassur_standard(uuid) from public, anon, authenticated;

-- Premier palier de retrait (en mois) : celui de la catégorie, sans dépasser le contrat ; véhicule hors cadre : le terme du contrat
create or replace function public._tamassur_months(p_driver uuid)
returns int
language sql stable security definer set search_path = public as $fn$
  select greatest(1, case
           when public._tamassur_standard(p_driver) then least(
             case v.category::text
               when 'moto'     then public._program_rule('tamassur_months_moto')
               when 'tricycle' then public._program_rule('tamassur_months_tricycle')
               when 'confort'  then public._program_rule('tamassur_months_confort')
               when 'premium'  then public._program_rule('tamassur_months_premium')
               else public._program_rule('tamassur_months_essentiel') end,
             public._contract_months(p_driver))
           else public._contract_months(p_driver) end)
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = p_driver;
$fn$;
revoke execute on function public._tamassur_months(uuid) from public, anon, authenticated;

-- Épargne garantie au terme du contrat (cumul de tous les paliers)
create or replace function public._tamassur_term_goal(p_driver uuid)
returns int
language sql stable security definer set search_path = public as $fn$
  select least(
    (public._program_rule('tamassur_guarantee_year')::bigint * public._contract_months(p_driver) / 12)::int,
    25 * public._contract_months(p_driver) * public._tamassur_savings_day(p_driver)
  );
$fn$;
revoke execute on function public._tamassur_term_goal(uuid) from public, anon, authenticated;

-- Total déjà demandé en retrait (en attente ou payé)
create or replace function public._tamassur_withdrawn(p_driver uuid)
returns int
language sql stable security definer set search_path = public as $fn$
  select coalesce(sum(amount_fcfa), 0)::int from public.tamassur_withdrawals where driver_id = p_driver and status in ('pending', 'paid');
$fn$;
revoke execute on function public._tamassur_withdrawn(uuid) from public, anon, authenticated;

-- Situation de retrait : palier atteint ou prochain palier, montant à avoir épargné, conditions
drop function if exists public.my_tamassur_withdrawal_status();
create or replace function public.my_tamassur_withdrawal_status()
returns table (
  start_date date, eligible_on date, months int, epargne_fcfa int, goal_fcfa int, debt_fcfa int, late_days int, can_withdraw boolean, reason text,
  term_months int, term_goal_fcfa int, withdrawn_fcfa int
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_driver uuid;
  v_profile uuid := auth.uid();
  v_start date;
  v_elapsed int;
  v_first int;
  v_term int;
  v_window int;
  v_year int := public._program_rule('tamassur_guarantee_year');
  v_withdrawn int;
  v_goal int;
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_epargne int;
  v_rev int;
  v_since timestamptz;
  v_reason text;
begin
  if v_profile is null then return; end if;
  select id into v_driver from public.drivers where profile_id = v_profile;
  if v_driver is null then return; end if;

  v_first := public._tamassur_months(v_driver);
  v_term := greatest(public._contract_months(v_driver), v_first);
  v_start := public._tamassur_start(v_driver);
  v_withdrawn := public._tamassur_withdrawn(v_driver);
  select coalesce(max(balance_fcfa), 0) into v_epargne from public.wallets where profile_id = v_profile and kind::text = 'tamcar_epargne';
  select coalesce(max(balance_fcfa), 0) into v_rev from public.wallets where profile_id = v_profile and kind::text = 'tamcar_revenus';
  select a.since into v_since from public.driver_arrears a where a.driver_id = v_driver;

  v_window := v_first;
  if v_start is not null then
    v_elapsed := extract(year from age(v_today, v_start))::int * 12 + extract(month from age(v_today, v_start))::int;
    if v_elapsed >= v_first then
      v_window := least(v_term, v_first + ((v_elapsed - v_first) / 12) * 12);          -- dernier palier atteint
    end if;
  end if;
  v_goal := (v_year::bigint * v_window / 12)::int - v_withdrawn;                       -- épargne à avoir pour ce palier, retraits déjà faits déduits

  -- Palier atteint mais déjà intégralement retiré : on regarde le suivant
  if v_start is not null and v_elapsed >= v_first and v_goal <= 0 and v_window < v_term then
    v_window := least(v_term, v_window + 12);
    v_goal := (v_year::bigint * v_window / 12)::int - v_withdrawn;
    v_elapsed := -1;                                                                    -- le prochain palier n'est pas encore atteint
  end if;

  v_reason := case
    when exists (select 1 from public.tamassur_withdrawals t where t.driver_id = v_driver and t.status = 'pending') then 'pending'
    when v_start is null then 'not_started'
    when v_elapsed < v_first then 'too_early'
    when v_elapsed = -1 then 'too_early'
    when v_goal <= 0 and v_window >= v_term and v_epargne <= 0 then 'completed'
    when v_epargne < greatest(v_goal, 0) then 'below_goal'
    when v_rev < 0 then 'in_arrears'
    else 'ok' end;

  return query select v_start, (v_start + make_interval(months => v_window))::date, v_window, v_epargne, greatest(v_goal, 0),
                      greatest(0, -v_rev),
                      case when v_rev < 0 then public._days_late(v_since) else 0 end,
                      v_reason = 'ok', v_reason,
                      v_term, public._tamassur_term_goal(v_driver), v_withdrawn;
end;
$fn$;
revoke execute on function public.my_tamassur_withdrawal_status() from public, anon;
grant execute on function public.my_tamassur_withdrawal_status() to authenticated;

-- Retrait demandé : un palier entièrement retiré affiche « completed » ; le calculateur décès / invalidité affiche la garantie au terme du contrat -----

CREATE OR REPLACE FUNCTION public.request_tamassur_withdrawal(p_amount integer)
 RETURNS tamassur_withdrawals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_driver_id uuid;
  v_name text;
  w_id uuid;
  v_bal int;
  v_amount int;
  v_st record;
  rec public.tamassur_withdrawals;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_driver_id from public.drivers where profile_id = auth.uid();
  if v_driver_id is null then raise exception 'not_a_driver'; end if;

  select * into v_st from public.my_tamassur_withdrawal_status();
  if v_st.reason = 'pending' then
    raise exception 'Une demande de retrait est deja en cours.';
  elsif v_st.reason = 'not_started' then
    raise exception 'Le retrait s''ouvre % mois apres le premier prelevement TamAssur.', v_st.months;
  elsif v_st.reason = 'too_early' then
    raise exception 'Retrait possible a partir du % (% mois apres le premier prelevement).', to_char(v_st.eligible_on, 'DD/MM/YYYY'), v_st.months;
  elsif v_st.reason = 'below_goal' then
    raise exception 'Retrait possible des % F d''epargne (solde : % F).', v_st.goal_fcfa, v_st.epargne_fcfa;
  elsif v_st.reason = 'in_arrears' then
    raise exception 'Compte a regulariser : % jour(s) de retard, % F a regler avant de demander le retrait.', v_st.late_days, v_st.debt_fcfa;
  elsif v_st.reason = 'completed' then
    raise exception 'Toute l''epargne garantie a deja ete retiree.';
  end if;

  select id, balance_fcfa into w_id, v_bal from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_epargne'
   for update;
  if w_id is null then raise exception 'Poche Epargne introuvable'; end if;

  if exists (select 1 from public.tamassur_withdrawals where driver_id = v_driver_id and status = 'pending') then
    raise exception 'Une demande de retrait est deja en cours.';
  end if;

  v_amount := least(greatest(coalesce(p_amount, v_bal), 1), v_bal);
  if v_amount < 1 then raise exception 'Aucune epargne a retirer.'; end if;

  update public.wallets
     set balance_fcfa = balance_fcfa - v_amount, updated_at = now()
   where id = w_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status)
  values (w_id, 'tamassur_withdrawal', v_amount, 'internal', 'success');

  insert into public.tamassur_withdrawals (driver_id, amount_fcfa, due_at)
  values (v_driver_id, v_amount, now() + interval '60 days')
  returning * into rec;

  select full_name into v_name from public.profiles where id = auth.uid();
  perform public._admin_alert(
    'tamassur_withdrawal', 'normal',
    'Retrait TamAssur : ' || coalesce(v_name, 'chauffeur') || ' demande ' || v_amount || ' F',
    'À régler (espèces ou Mobile Money) avant le ' || to_char(rec.due_at at time zone 'Africa/Porto-Novo', 'DD/MM/YYYY') || ' (60 jours).',
    '/admin/tamassur', rec.id
  );
  perform public._push_notify(
    auth.uid(), 'Demande de retrait enregistrée',
    'L''équipe TamCar traite votre demande et effectue le virement sous 60 jours au plus.',
    '/wallet', 'tamassur-withdrawal:' || rec.id::text, false
  );

  return rec;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_tamassur_death_calc(p_driver_id uuid, p_event_date date DEFAULT NULL::date)
 RETURNS TABLE(driver_id uuid, full_name text, phone text, category text, start_date date, event_date date, months_elapsed integer, days_paid integer, cotisations_fcfa integer, epargne_constituee_fcfa integer, threshold_months integer, pct integer, benefit_fcfa integer, epargne_now_fcfa integer, guarantee_at_term_fcfa integer, term_months integer, debt_fcfa integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_date date := coalesce(p_event_date, (now() at time zone 'Africa/Porto-Novo')::date);
  v_start date;
  v_months int;
  v_thr int := greatest(1, public._program_rule('death_threshold_months'));
  v_pct int;
  v_cot int;
  v_sav int;
  v_days int;
  v_prof uuid;
  r record;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select d.id, d.profile_id, p.full_name as nm, p.phone as ph, v.category::text as cat
    into r
    from public.drivers d
    join public.profiles p on p.id = d.profile_id
    left join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = p_driver_id;
  if r.id is null then raise exception 'Chauffeur introuvable'; end if;
  v_prof := r.profile_id;

  select min(c.period)::date into v_start
    from public.driver_insurance_charges c where c.driver_id = p_driver_id and c.status = 'paid';
  select count(*)::int, coalesce(sum(c.collected_fcfa), 0)::int, coalesce(sum(coalesce(c.saved_fcfa, c.collected_fcfa)), 0)::int
    into v_days, v_cot, v_sav
    from public.driver_insurance_charges c
   where c.driver_id = p_driver_id and c.status = 'paid' and c.period <= v_date;

  v_months := case when v_start is null or v_date < v_start then 0
                   else (extract(year from age(v_date, v_start))::int * 12 + extract(month from age(v_date, v_start))::int) end;
  v_pct := case when v_months < v_thr then public._program_rule('death_early_pct') else public._program_rule('death_late_pct') end;

  return query select
    r.id, r.nm, r.ph, r.cat,
    v_start, v_date, v_months,
    v_days, v_cot, v_sav,
    v_thr, v_pct, floor(v_cot * v_pct / 100.0)::int,
    coalesce((select max(w.balance_fcfa) from public.wallets w where w.profile_id = v_prof and w.kind::text = 'tamcar_epargne'), 0)::int,
    public._tamassur_term_goal(p_driver_id), greatest(public._contract_months(p_driver_id), public._tamassur_months(p_driver_id)),
    greatest(0, -coalesce((select min(w.balance_fcfa) from public.wallets w where w.profile_id = v_prof and w.kind::text = 'tamcar_revenus'), 0))::int;
end;
$function$;
