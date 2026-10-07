-- ============================================================
-- TamCar — Retrait de l'épargne TamAssur : durée et seuil PAR VÉHICULE (2026-10-07, décision de Terence)
--
--   Moto : contrat de 12 mois  -> retrait dès 12 mois, seuil 150 000 F (25 jours x 12 mois x 500 F)
--   Tricycle : 24 mois         -> seuil 450 000 F (25 x 24 x 750 F)
--   Voitures (Essentiel, Confort, Premium) : 24 mois -> seuil 600 000 F (25 x 24 x 1 000 F)
--   Seuil = 25 jours x nombre de mois x cotisation journalière (25 jours par mois, comme dans les chiffres annoncés).
--   Les durées sont des réglages (program_rules), modifiables sans redéploiement.
--   Rappel : le retrait exige aussi un compte à jour ; le paiement reste manuel, sous 60 jours.
-- ============================================================
insert into public.program_rules (key, value, label) values
  ('tamassur_months_moto',      12, 'TamAssur : durée avant retrait, moto (mois)'),
  ('tamassur_months_tricycle',  24, 'TamAssur : durée avant retrait, tricycle (mois)'),
  ('tamassur_months_essentiel', 24, 'TamAssur : durée avant retrait, voiture Essentiel (mois)'),
  ('tamassur_months_confort',   24, 'TamAssur : durée avant retrait, voiture Confort (mois)'),
  ('tamassur_months_premium',   24, 'TamAssur : durée avant retrait, voiture Premium / VIP (mois)')
on conflict (key) do nothing;

create or replace function public._tamassur_months(p_driver uuid)
returns int
language sql stable security definer set search_path = public as $fn$
  select greatest(1, case v.category::text
           when 'moto'     then public._program_rule('tamassur_months_moto')
           when 'tricycle' then public._program_rule('tamassur_months_tricycle')
           when 'confort'  then public._program_rule('tamassur_months_confort')
           when 'premium'  then public._program_rule('tamassur_months_premium')
           else public._program_rule('tamassur_months_essentiel') end)
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = p_driver;
$fn$;
revoke execute on function public._tamassur_months(uuid) from public, anon, authenticated;

create or replace function public._tamassur_goal(p_driver uuid)
returns int
language sql stable security definer set search_path = public as $fn$
  select 25 * public._tamassur_months(p_driver) * public._tamassur_amount(p_driver);
$fn$;
revoke execute on function public._tamassur_goal(uuid) from public, anon, authenticated;

-- Objectif affiché (barre de progression du tableau de bord) : même formule
create or replace function public.my_tamassur_plan()
returns table (min_amount int, amount int, fund_pct int, goal_fcfa int)
language sql stable security definer set search_path = public as $fn_plan$
  select public._tamassur_category_amount(v.category::text),
         public._tamassur_amount(d.id),
         public._program_rule('tamassur_fund_pct'),
         public._tamassur_goal(d.id)
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.profile_id = auth.uid();
$fn_plan$;
revoke execute on function public.my_tamassur_plan() from public, anon;
grant execute on function public.my_tamassur_plan() to authenticated;

-- État du retrait : durée propre au véhicule (colonne months en plus) -> suppression puis recréation
drop function if exists public.my_tamassur_withdrawal_status();

create function public.my_tamassur_withdrawal_status()
returns table (
  start_date date,
  eligible_on date,
  months int,
  epargne_fcfa int,
  goal_fcfa int,
  debt_fcfa int,
  late_days int,
  can_withdraw boolean,
  reason text
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_driver uuid;
  v_profile uuid := auth.uid();
  v_start date;
  v_elig date;
  v_months int;
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_epargne int;
  v_goal int;
  v_rev int;
  v_since timestamptz;
  v_reason text;
begin
  if v_profile is null then return; end if;
  select id into v_driver from public.drivers where profile_id = v_profile;
  if v_driver is null then return; end if;

  v_months := public._tamassur_months(v_driver);
  v_start := public._tamassur_start(v_driver);
  v_elig := (v_start + make_interval(months => v_months))::date;
  v_goal := public._tamassur_goal(v_driver);
  select coalesce(max(balance_fcfa), 0) into v_epargne from public.wallets where profile_id = v_profile and kind::text = 'tamcar_epargne';
  select coalesce(max(balance_fcfa), 0) into v_rev from public.wallets where profile_id = v_profile and kind::text = 'tamcar_revenus';
  select a.since into v_since from public.driver_arrears a where a.driver_id = v_driver;

  v_reason := case
    when exists (select 1 from public.tamassur_withdrawals t where t.driver_id = v_driver and t.status = 'pending') then 'pending'
    when v_start is null then 'not_started'
    when v_today < v_elig then 'too_early'
    when v_epargne < v_goal then 'below_goal'
    when v_rev < 0 then 'in_arrears'
    else 'ok' end;

  return query select v_start, v_elig, v_months, v_epargne, v_goal, greatest(0, -v_rev),
                      case when v_rev < 0 then public._days_late(v_since) else 0 end,
                      v_reason = 'ok', v_reason;
end;
$fn$;
revoke execute on function public.my_tamassur_withdrawal_status() from public, anon;
grant execute on function public.my_tamassur_withdrawal_status() to authenticated;

create or replace function public.request_tamassur_withdrawal(p_amount int)
returns public.tamassur_withdrawals
language plpgsql security definer set search_path = public as $fn$
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
$fn$;
revoke execute on function public.request_tamassur_withdrawal(int) from public, anon;
grant execute on function public.request_tamassur_withdrawal(int) to authenticated;
