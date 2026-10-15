-- ============================================================
-- TamCar — TamAssur : épargne GARANTIE de 250 000 F par année de cotisation + calculateur décès / invalidité (2026-10-15)
--
--   Décision de Terence (2026-10-15) : TamCar garantit 250 000 F par année de cotisation complète (moto 250 000 F à 12 mois ; tricycle et
--   voitures 500 000 F à 24 mois) pour une cotisation de 1 000 F par jour (lundi-samedi). Avantage présenté comme une garantie offerte par
--   TamCar ; la cotisation reste prélevée sur Revenus et le solde finance les frais du contrat d'assurance-épargne et la garantie.
--
--   Mécanique (aucun prélèvement réel avant tamassur_debit_from = 2027-01-01, donc aucune donnée à reprendre) :
--     - chaque jour, la poche Épargne reçoit la part épargnée = ceil(250 000 / 300) = 834 F de la cotisation de 1 000 F (300 = 25 jours x 12
--       mois : atteint à 25 jours de cotisation par mois, 260 208 F à 26 jours) ; les 166 F restants ne sont pas épargnés ;
--     - objectif de retrait (_tamassur_goal) = 250 000 F x durée / 12 ;
--     - départ avant l'échéance : restitution de l'épargne constituée (la part épargnée), voir CGU.
--
--   Décès ou invalidité (CGU) : avant 12 mois de cotisation, la moitié des cotisations réellement prélevées ; à partir de 12 mois, la totalité.
--   admin_tamassur_death_calc() applique cette règle (pourcentages et durée réglables) aux cotisations effectivement prélevées jusqu'à la date
--   de l'événement. Les dettes éventuelles ne sont PAS déduites (la CGU ne le prévoit pas pour le décès ou l'invalidité) : elles sont affichées.
-- ============================================================

-- 1. Traçabilité de la part épargnée de chaque prélèvement
alter table public.driver_insurance_charges add column if not exists saved_fcfa int;

-- 2. Réglages
insert into public.program_rules (key, value, label) values
  ('tamassur_guarantee_year', 250000, 'TamAssur : épargne garantie par TamCar, par année de cotisation (F)'),
  ('death_early_pct',          50,    'Décès ou invalidité avant la durée : % des cotisations prélevées restitué'),
  ('death_late_pct',           100,   'Décès ou invalidité à partir de la durée : % des cotisations prélevées restitué'),
  ('death_threshold_months',   12,    'Décès ou invalidité : mois de cotisation à partir desquels le taux « après » s''applique')
on conflict (key) do nothing;

-- validation des nouveaux réglages (le reste de la fonction est inchangé)
create or replace function public.admin_set_program_rule(p_key text, p_value integer)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_value is null or p_value < 0 then raise exception 'Valeur invalide'; end if;
  if (p_key like 'share_%' or p_key in ('surplus_cede_pct', 'tamassur_fund_pct')) and p_value > 100 then
    raise exception 'Un pourcentage ne peut pas dépasser 100.';
  end if;
  if p_key in ('death_early_pct', 'death_late_pct') and p_value > 100 then
    raise exception 'Un pourcentage ne peut pas dépasser 100.';
  end if;
  if p_key = 'death_threshold_months' and (p_value < 1 or p_value > 120) then
    raise exception 'Une durée doit être comprise entre 1 et 120 mois.';
  end if;
  if p_key = 'tamassur_guarantee_year' then
    if p_value < 50000 or p_value > 300000 then
      raise exception 'La garantie annuelle doit être comprise entre 50 000 et 300 000 F (au-delà, elle dépasserait la cotisation de 25 jours par mois).';
    end if;
  elsif p_key like 'tamassur_months_%' then
    if p_value < 1 or p_value > 120 then raise exception 'Une durée doit être comprise entre 1 et 120 mois.'; end if;
  elsif p_key like 'tamassur_%' and p_key <> 'tamassur_fund_pct' and p_value < 100 then
    raise exception 'Une cotisation quotidienne doit être d''au moins 100 F.';
  end if;
  if p_key in ('payments_test_mode', 'payouts_auto', 'payments_provider') and p_value not in (0, 1) then
    raise exception 'Ce réglage se règle sur 1 (activé) ou 0 (désactivé).';
  end if;
  if p_key = 'booking_penalty_fcfa' and p_value > 5000 then
    raise exception 'La pénalité de réservation ne peut pas dépasser 5 000 F.';
  end if;
  if p_key like 'upkeep\_permille\_%' and p_value > 80 then
    raise exception 'Au plus 80 ‰ du volume (8 %%) : le fonds de rachat ne reçoit pas plus.';
  end if;
  if p_key = 'data_bundle_top_pct' and (p_value < 1 or p_value > 100) then
    raise exception 'Entre 1 et 100 %%.';
  end if;
  if p_key = 'data_bundle_min_days' and (p_value < 1 or p_value > 6) then
    raise exception 'Entre 1 et 6 jours.';
  end if;
  if p_key = 'data_bundle_min_rating' and p_value > 50 then
    raise exception 'La note minimale s''exprime en dixièmes d''étoile (45 = 4,5) et ne peut pas dépasser 50.';
  end if;
  if p_key = 'data_bundle_min_winners' and p_value > 100 then
    raise exception 'Au plus 100 bénéficiaires minimum.';
  end if;
  if p_key = 'data_bundle_max_winners' and p_value > 500 then
    raise exception 'Au plus 500 bénéficiaires par semaine.';
  end if;
  if p_key = 'data_bundle_cost_fcfa' and p_value > 20000 then
    raise exception 'Au plus 20 000 F par forfait.';
  end if;
  if p_key = 'payout_auto_max_fcfa' and p_value > 500000 then
    raise exception 'Au plus 500 000 F (limite d''un retrait).';
  end if;
  if p_key = 'payout_auto_daily_cap_fcfa' and p_value > 2000000 then
    raise exception 'Au plus 2 000 000 F par chauffeur et par jour.';
  end if;
  if p_key = 'payout_hold_new_number' and p_value not in (0, 1) then
    raise exception 'Mettre 0 ou 1.';
  end if;
  if p_key = 'rdv_capacity_per_slot' and (p_value < 1 or p_value > 20) then
    raise exception 'Entre 1 et 20 candidats par créneau.';
  end if;
  if p_key in ('gadget_driver_min_rating', 'gadget_client_min_rating') and p_value > 50 then
    raise exception 'Une note minimale s''exprime en dixièmes d''étoile (47 = 4,7) et ne peut pas dépasser 50.';
  end if;
  if p_key in ('gadget_winners_drivers', 'gadget_winners_clients') and p_value > 50 then
    raise exception 'Au plus 50 gagnants par catégorie.';
  end if;
  if p_key = 'prio_enabled' and p_value not in (0, 1) then
    raise exception 'La priorité de proximité se règle sur 1 (active) ou 0 (désactivée).';
  end if;
  if p_key like 'prio_r%_m' and (p_value < 500 or p_value > 50000) then
    raise exception 'Un rayon doit être compris entre 500 m et 50 000 m.';
  end if;
  if p_key like 'prio_d%_s' and p_value > 300 then
    raise exception 'Un délai ne peut pas dépasser 300 secondes.';
  end if;
  update public.program_rules set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'Réglage inconnu'; end if;
end;
$fn$;

-- 3. Part épargnée par jour et objectif de retrait
create or replace function public._tamassur_savings_day(p_driver uuid)
returns int
language sql stable security definer set search_path = public as $fn$
  select least(public._tamassur_amount(p_driver), ceil(public._program_rule('tamassur_guarantee_year') / 300.0)::int);
$fn$;
revoke execute on function public._tamassur_savings_day(uuid) from public, anon, authenticated;

create or replace function public._tamassur_goal(p_driver uuid)
returns int
language sql stable security definer set search_path = public as $fn$
  select least(
    (public._program_rule('tamassur_guarantee_year')::bigint * public._tamassur_months(p_driver) / 12)::int,
    25 * public._tamassur_months(p_driver) * public._tamassur_savings_day(p_driver)
  );
$fn$;
revoke execute on function public._tamassur_goal(uuid) from public, anon, authenticated;

-- 4. Prélèvement quotidien : la poche Épargne reçoit la part épargnée (le reste de la cotisation n'est pas épargné)
create or replace function public.charge_driver_insurance(p_period date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
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
  v_fund_id uuid;
  v_fund_bal int;
  v_fund_share int;
  v_rev_debit int;
  v_amount int;
  v_saved int;
  v_charge_id uuid;
  v_new_bal int;
  v_drivers int := 0;
  v_debited int := 0;
  v_total int := 0;
  v_saved_total int := 0;
  v_from_fund int := 0;
  v_negative int := 0;
begin
  if extract(dow from v_period) = 0 then
    return jsonb_build_object('period', v_period, 'skipped', 'sunday');
  end if;

  select nullif(value, '')::date into v_from
    from public._push_settings where key = 'tamassur_debit_from';
  v_from := coalesce(v_from, date '2027-01-01');
  if v_period < v_from then
    return jsonb_build_object('period', v_period, 'skipped', 'not_started', 'starts_on', v_from);
  end if;

  for v_drv in
    select d.id, d.profile_id from public.drivers d
     where d.status = 'active'
       and not exists (select 1 from public.driver_excused_days x where x.driver_id = d.id and x.day = v_period)
  loop
    v_drivers := v_drivers + 1;
    v_amount := public._tamassur_amount(v_drv.id);
    v_saved := public._tamassur_savings_day(v_drv.id);

    v_charge_id := null;
    insert into public.driver_insurance_charges
      (driver_id, period, amount_fcfa, collected_fcfa, saved_fcfa, status, collected_at)
    values (v_drv.id, v_period, v_amount, v_amount, v_saved, 'paid', now())
    on conflict (driver_id, period) do update
      set amount_fcfa = excluded.amount_fcfa,
          collected_fcfa = excluded.collected_fcfa,
          saved_fcfa = excluded.saved_fcfa,
          status = 'paid',
          collected_at = now()
      where driver_insurance_charges.status <> 'paid'
    returning id into v_charge_id;
    if v_charge_id is null then continue; end if;

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

    -- Part du fonds de rachat (jamais en négatif : sinon la part manquante reste sur Revenus)
    v_fund_share := 0;
    select id, balance_fcfa into v_fund_id, v_fund_bal from public.wallets
     where profile_id = v_drv.profile_id and kind = 'tamcar_rachat' for update;
    if v_fund_id is not null then
      v_fund_share := greatest(0, least(
        round(v_amount * public._program_rule('tamassur_fund_pct') / 100.0)::int, v_fund_bal, v_amount));
    end if;
    v_rev_debit := v_amount - v_fund_share;

    v_new_bal := v_rev_bal - v_rev_debit;
    update public.wallets set balance_fcfa = v_new_bal, updated_at = now() where id = v_rev_id;
    if v_fund_share > 0 then
      update public.wallets set balance_fcfa = balance_fcfa - v_fund_share, updated_at = now() where id = v_fund_id;
    end if;
    update public.wallets set balance_fcfa = balance_fcfa + v_saved, updated_at = now()
     where id = v_epargne_id;
    update public.driver_insurance_charges set from_rachat_fcfa = v_fund_share where id = v_charge_id;

    if v_rev_debit > 0 then
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
      values (v_rev_id, 'insurance_premium', v_rev_debit, 'internal', 'success',
              jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm'));
    end if;
    if v_fund_share > 0 then
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
      values (v_fund_id, 'tamassur_from_rachat', v_fund_share, 'internal', 'success',
              jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm'));
    end if;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_epargne_id, 'tamassur_saving', v_saved, 'internal', 'success',
            jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm',
                               'cotisation', v_amount, 'frais_garantie', v_amount - v_saved,
                               'from_rachat', v_fund_share, 'from_revenus', v_rev_debit));

    v_debited := v_debited + 1;
    v_total := v_total + v_amount;
    v_saved_total := v_saved_total + v_saved;
    v_from_fund := v_from_fund + v_fund_share;
    if v_new_bal < 0 then v_negative := v_negative + 1; end if;
  end loop;

  return jsonb_build_object(
    'period', v_period,
    'drivers_scanned', v_drivers,
    'debited', v_debited,
    'cotisations_fcfa', v_total,
    'saved_fcfa', v_saved_total,
    'from_rachat_fcfa', v_from_fund,
    'balances_negative', v_negative
  );
end;
$fn$;
revoke execute on function public.charge_driver_insurance(date) from public, anon, authenticated;

-- 5. Liste des chauffeurs pour le calculateur (admin)
drop function if exists public.admin_tamassur_drivers();
create function public.admin_tamassur_drivers()
returns table (driver_id uuid, full_name text, phone text, category text, start_date date, cotisations_fcfa int)
language sql stable security definer set search_path = public as $fn$
  select d.id, p.full_name, p.phone, v.category::text,
         (select min(c.period)::date from public.driver_insurance_charges c where c.driver_id = d.id and c.status = 'paid'),
         coalesce((select sum(c.collected_fcfa)::int from public.driver_insurance_charges c where c.driver_id = d.id and c.status = 'paid'), 0)
    from public.drivers d
    join public.profiles p on p.id = d.profile_id
    left join public.vehicles v on v.id = d.current_vehicle_id
   where public.is_admin()
   order by p.full_name nulls last
   limit 1000;
$fn$;
revoke execute on function public.admin_tamassur_drivers() from public, anon;
grant execute on function public.admin_tamassur_drivers() to authenticated;

-- 6. CALCULATEUR DÉCÈS / INVALIDITÉ (admin) : cotisations réellement prélevées jusqu'à la date de l'événement x taux selon la durée de cotisation
drop function if exists public.admin_tamassur_death_calc(uuid, date);
create function public.admin_tamassur_death_calc(p_driver_id uuid, p_event_date date default null)
returns table (
  driver_id uuid, full_name text, phone text, category text,
  start_date date, event_date date, months_elapsed int,
  days_paid int, cotisations_fcfa int, epargne_constituee_fcfa int,
  threshold_months int, pct int, benefit_fcfa int,
  epargne_now_fcfa int, guarantee_at_term_fcfa int, term_months int, debt_fcfa int
)
language plpgsql stable security definer set search_path = public as $fn$
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
    public._tamassur_goal(p_driver_id), public._tamassur_months(p_driver_id),
    greatest(0, -coalesce((select min(w.balance_fcfa) from public.wallets w where w.profile_id = v_prof and w.kind::text = 'tamcar_revenus'), 0))::int;
end;
$fn$;
revoke execute on function public.admin_tamassur_death_calc(uuid, date) from public, anon;
grant execute on function public.admin_tamassur_death_calc(uuid, date) to authenticated;
