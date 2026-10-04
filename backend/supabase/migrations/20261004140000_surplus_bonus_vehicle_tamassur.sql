-- ============================================================
-- TamCar — Bonus = partage du surplus ; cotisation TamAssur par véhicule (2026-10-04)
--
--   1. BONUS : sur le volume de courses DANS L'APP au-dessus de l'objectif
--      du jour, TamCar reverse au chauffeur la moitié de la part qu'elle
--      touche sur ce surplus.
--         bonus = 50 % x part de TamCar x (volume - objectif)
--      Part de TamCar : voitures (Afrik Group) 23 % ; moto et tricycle 60 %
--      (le versement). Exemple Essentiel à 18 000 F : surplus 6 000 F,
--      TamCar touche 1 380 F, le chauffeur reçoit 690 F, TamCar garde 690 F.
--      Plus de paliers : proportionnel, donc jamais perdant pour TamCar.
--
--   2. TAMASSUR : le montant de la cotisation quotidienne dépend du
--      véhicule (ce qu'il rapporte et ce que le conducteur peut porter).
--      La moitié est prélevée sur le fonds de rachat, l'autre sur Revenus.
--      Le chauffeur peut choisir plus que le minimum de sa catégorie.
--      Retrait ouvert à 600 x la cotisation journalière (~23 mois).
-- ============================================================

-- A. Réglages -------------------------------------------------------------
delete from public.program_rules where key in
  ('tier1_pct', 'tier1_fcfa', 'tier2_pct', 'tier2_fcfa', 'tier3_pct', 'tier3_fcfa', 'tamassur_rachat_share_fcfa');

insert into public.program_rules (key, value, label) values
  ('surplus_cede_pct',     50,   'Bonus : part de sa commission sur le volume excédentaire que TamCar reverse au chauffeur (%)'),
  ('share_moto',           60,   'Part de TamCar sur le volume : moto (%)'),
  ('share_tricycle',       60,   'Part de TamCar sur le volume : tricycle (%)'),
  ('share_essentiel',      23,   'Part de TamCar sur le volume : voiture Essentiel (%)'),
  ('share_confort',        23,   'Part de TamCar sur le volume : voiture Confort (%)'),
  ('tamassur_moto',        500,  'TamAssur : cotisation quotidienne moto (F)'),
  ('tamassur_tricycle',    750,  'TamAssur : cotisation quotidienne tricycle (F)'),
  ('tamassur_essentiel',   1000, 'TamAssur : cotisation quotidienne voiture Essentiel (F)'),
  ('tamassur_confort',     1250, 'TamAssur : cotisation quotidienne voiture Confort (F)'),
  ('tamassur_premium',     1500, 'TamAssur : cotisation quotidienne voiture VIP (F)'),
  ('tamassur_fund_pct',    50,   'TamAssur : part de la cotisation prélevée sur le fonds de rachat (%)')
on conflict (key) do nothing;

create or replace function public.admin_set_program_rule(p_key text, p_value int)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_value is null or p_value < 0 then raise exception 'Valeur invalide'; end if;
  if (p_key like 'share_%' or p_key in ('surplus_cede_pct', 'tamassur_fund_pct')) and p_value > 100 then
    raise exception 'Un pourcentage ne peut pas dépasser 100.';
  end if;
  if p_key like 'tamassur_%' and p_key <> 'tamassur_fund_pct' and p_value < 100 then
    raise exception 'Une cotisation quotidienne doit être d''au moins 100 F.';
  end if;
  update public.program_rules set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'Réglage inconnu'; end if;
end;
$fn$;
revoke execute on function public.admin_set_program_rule(text, int) from public, anon;
grant execute on function public.admin_set_program_rule(text, int) to authenticated;

create or replace function public._vehicle_share(p_category text)
returns int language sql stable security definer set search_path = public as $fn$
  select case p_category
    when 'moto'      then public._program_rule('share_moto')
    when 'tricycle'  then public._program_rule('share_tricycle')
    when 'essentiel' then public._program_rule('share_essentiel')
    when 'confort'   then public._program_rule('share_confort')
    else 0 end;
$fn$;
revoke execute on function public._vehicle_share(text) from public, anon, authenticated;

-- Bonus du jour pour un volume donné (partage du surplus)
create or replace function public._surplus_bonus(p_category text, p_volume int)
returns int language sql stable security definer set search_path = public as $fn$
  select case when public._vehicle_floor(p_category) > 0 then
    floor(
      public._program_rule('surplus_cede_pct') / 100.0
      * public._vehicle_share(p_category) / 100.0
      * greatest(0, p_volume - public._vehicle_floor(p_category))
    )::int
  else 0 end;
$fn$;
revoke execute on function public._surplus_bonus(text, int) from public, anon, authenticated;

-- B. Jauge du chauffeur ---------------------------------------------------
drop function if exists public.driver_today_volume(uuid);
create or replace function public.driver_today_volume(p_driver_id uuid)
returns table (
  volume_today int,
  floor_fcfa int,
  pct int,
  bonus_now_fcfa int,
  rate_per_1000 int,
  fcfa_to_floor int,
  bonus_started boolean,
  bonus_start date,
  bonus_day boolean
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_cat text;
  v_app text;
  v_floor int;
  v_vol int;
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
begin
  if not exists (select 1 from public.drivers d where d.id = p_driver_id and (d.profile_id = auth.uid() or public.is_admin())) then
    raise exception 'Not authorized';
  end if;
  select v.category::text, d.application_type::text into v_cat, v_app
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = p_driver_id;
  v_cat := coalesce(v_cat, 'essentiel');
  v_floor := case when v_app = 'proprietaire' then 0 else public._vehicle_floor(v_cat) end;
  select coalesce(sum(r.price_total_fcfa), 0)::int into v_vol
    from public.rides r
   where r.driver_id = p_driver_id and r.status = 'completed'
     and (r.ended_at at time zone 'Africa/Porto-Novo')::date = v_today;

  return query select
    v_vol, v_floor,
    case when v_floor > 0 then (v_vol * 100 / v_floor) else 0 end,
    case when v_floor > 0 then public._surplus_bonus(v_cat, v_vol) else 0 end,
    case when v_floor > 0 then round(1000 * public._program_rule('surplus_cede_pct') / 100.0 * public._vehicle_share(v_cat) / 100.0)::int else 0 end,
    greatest(0, v_floor - v_vol),
    v_today >= public._bonus_start(), public._bonus_start(), extract(dow from v_today) <> 0;
end;
$fn$;
revoke execute on function public.driver_today_volume(uuid) from public, anon;
grant execute on function public.driver_today_volume(uuid) to authenticated;

-- C. Attribution du soir ----------------------------------------------------
create or replace function public.award_performance_bonus(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Porto-Novo')::date);
  v_drv record;
  v_floor int;
  v_vol int;
  v_bonus int;
  v_wallet uuid;
  v_paid int := 0;
  v_n int := 0;
  v_log uuid;
begin
  if extract(dow from v_day) = 0 then
    return jsonb_build_object('day', v_day, 'skipped', 'sunday');
  end if;
  if v_day < public._bonus_start() then
    return jsonb_build_object('day', v_day, 'skipped', 'not_started', 'starts_on', public._bonus_start());
  end if;

  for v_drv in
    select d.id, d.profile_id, v.category::text as cat
      from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.application_type::text <> 'proprietaire'
  loop
    v_floor := public._vehicle_floor(v_drv.cat);
    if v_floor <= 0 then continue; end if;
    select coalesce(sum(r.price_total_fcfa), 0)::int into v_vol
      from public.rides r
     where r.driver_id = v_drv.id and r.status = 'completed'
       and (r.ended_at at time zone 'Africa/Porto-Novo')::date = v_day;
    v_bonus := public._surplus_bonus(v_drv.cat, v_vol);
    if v_bonus <= 0 then continue; end if;

    v_log := null;
    insert into public.driver_bonus_log (driver_id, day, volume_fcfa, floor_fcfa, pct, bonus_fcfa)
    values (v_drv.id, v_day, v_vol, v_floor, (v_vol * 100 / v_floor), v_bonus)
    on conflict (driver_id, day) do nothing
    returning id into v_log;
    if v_log is null then continue; end if;

    select id into v_wallet from public.wallets where profile_id = v_drv.profile_id and kind = 'tamcar_revenus';
    if v_wallet is null then
      insert into public.wallets (profile_id, kind, balance_fcfa) values (v_drv.profile_id, 'tamcar_revenus', 0)
      returning id into v_wallet;
    end if;
    update public.wallets set balance_fcfa = balance_fcfa + v_bonus, updated_at = now() where id = v_wallet;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_wallet, 'performance_bonus', v_bonus, 'internal', 'success',
            jsonb_build_object('day', v_day, 'volume', v_vol, 'floor', v_floor, 'pct', (v_vol * 100 / v_floor)));

    perform public._push_notify(
      v_drv.profile_id, 'Bonus de performance : +' || v_bonus || ' F',
      'Vous avez fait ' || (v_vol * 100 / v_floor) || ' % de votre objectif aujourd''hui. ' || v_bonus || ' F sont crédités sur votre portefeuille.',
      '/wallet', 'perf-bonus:' || v_day::text, false
    );
    v_paid := v_paid + v_bonus;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('day', v_day, 'drivers_rewarded', v_n, 'paid_fcfa', v_paid);
end;
$fn$;
revoke execute on function public.award_performance_bonus(date) from public, anon, authenticated;
grant execute on function public.award_performance_bonus(date) to service_role;

-- D. TamAssur : cotisation selon le véhicule -------------------------------
create or replace function public._tamassur_category_amount(p_category text)
returns int language sql stable security definer set search_path = public as $fn$
  select greatest(100, case p_category
    when 'moto'      then public._program_rule('tamassur_moto')
    when 'tricycle'  then public._program_rule('tamassur_tricycle')
    when 'essentiel' then public._program_rule('tamassur_essentiel')
    when 'confort'   then public._program_rule('tamassur_confort')
    when 'premium'   then public._program_rule('tamassur_premium')
    else public._program_rule('tamassur_essentiel') end);
$fn$;
revoke execute on function public._tamassur_category_amount(text) from public, anon, authenticated;

-- Montant en vigueur pour un chauffeur : son choix s'il est supérieur au minimum de sa catégorie
create or replace function public._tamassur_amount(p_driver_id uuid)
returns int language sql stable security definer set search_path = public as $fn$
  select greatest(
    public._tamassur_category_amount((select v.category::text from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id where d.id = p_driver_id)),
    coalesce((select tamassur_fcfa from public.drivers where id = p_driver_id), 0));
$fn$;
revoke execute on function public._tamassur_amount(uuid) from public, anon, authenticated;

-- tamassur_fcfa devient un CHOIX du chauffeur (vide = minimum de sa catégorie)
alter table public.drivers drop constraint if exists drivers_tamassur_min;
alter table public.drivers alter column tamassur_fcfa drop not null;
alter table public.drivers alter column tamassur_fcfa drop default;
alter table public.drivers add constraint drivers_tamassur_min check (tamassur_fcfa is null or tamassur_fcfa >= 100);
update public.drivers set tamassur_fcfa = null where tamassur_fcfa = 1000;

create or replace function public.my_tamassur()
returns int
language sql stable security definer set search_path = public as $fn_amt$
  select public._tamassur_amount(id) from public.drivers where profile_id = auth.uid();
$fn_amt$;
revoke execute on function public.my_tamassur() from public, anon;
grant execute on function public.my_tamassur() to authenticated;

create or replace function public.my_tamassur_plan()
returns table (min_amount int, amount int, fund_pct int, goal_fcfa int)
language sql stable security definer set search_path = public as $fn_plan$
  select public._tamassur_category_amount(v.category::text),
         public._tamassur_amount(d.id),
         public._program_rule('tamassur_fund_pct'),
         600 * public._tamassur_amount(d.id)
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.profile_id = auth.uid();
$fn_plan$;
revoke execute on function public.my_tamassur_plan() from public, anon;
grant execute on function public.my_tamassur_plan() to authenticated;

create or replace function public.set_my_tamassur(p_amount int)
returns int
language plpgsql security definer set search_path = public as $fn_set$
declare
  v_driver_id uuid;
  v_min int;
  v_amount int;
begin
  select id into v_driver_id from public.drivers where profile_id = auth.uid();
  if v_driver_id is null then
    raise exception 'not_a_driver';
  end if;
  v_min := public._tamassur_category_amount(
    (select v.category::text from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id where d.id = v_driver_id));
  v_amount := greatest(coalesce(p_amount, v_min), v_min);
  update public.drivers set tamassur_fcfa = case when v_amount = v_min then null else v_amount end where id = v_driver_id;
  return v_amount;
end;
$fn_set$;
revoke execute on function public.set_my_tamassur(int) from public, anon;
grant execute on function public.set_my_tamassur(int) to authenticated;

-- Retrait : ouvert à 600 x la cotisation journalière en vigueur
create or replace function public.request_tamassur_withdrawal(p_amount int)
returns public.tamassur_withdrawals
language plpgsql security definer set search_path = public as $fn$
declare
  v_driver_id uuid;
  w_id uuid;
  v_bal int;
  v_goal int;
  v_amount int;
  rec public.tamassur_withdrawals;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_driver_id from public.drivers where profile_id = auth.uid();
  if v_driver_id is null then raise exception 'not_a_driver'; end if;

  if exists (
    select 1 from public.tamassur_withdrawals
     where driver_id = v_driver_id and status = 'pending'
  ) then
    raise exception 'Une demande de retrait est deja en cours.';
  end if;

  select id, balance_fcfa into w_id, v_bal from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_epargne'
   for update;
  if w_id is null then raise exception 'Poche Epargne introuvable'; end if;

  v_goal := 600 * public._tamassur_amount(v_driver_id);
  if v_bal < v_goal then
    raise exception 'Retrait debloque a partir de % F (solde: % F).', v_goal, v_bal;
  end if;

  v_amount := least(greatest(coalesce(p_amount, v_bal), 1), v_bal);  -- borné [1, solde]

  update public.wallets
   set balance_fcfa = balance_fcfa - v_amount, updated_at = now()
   where id = w_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status)
   values (w_id, 'tamassur_withdrawal', v_amount, 'internal', 'success');

  insert into public.tamassur_withdrawals (driver_id, amount_fcfa)
   values (v_driver_id, v_amount)
   returning * into rec;

  return rec;
end;
$fn$;
revoke execute on function public.request_tamassur_withdrawal(int) from public, anon;
grant execute on function public.request_tamassur_withdrawal(int) to authenticated;

-- Prélèvement quotidien : montant selon le véhicule, part du fonds en pourcentage
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
  v_fund_id uuid;
  v_fund_bal int;
  v_fund_share int;
  v_rev_debit int;
  v_amount int;
  v_charge_id uuid;
  v_new_bal int;
  v_drivers int := 0;
  v_debited int := 0;
  v_total int := 0;
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
    select id, profile_id from public.drivers where status = 'active'
  loop
    v_drivers := v_drivers + 1;
    v_amount := public._tamassur_amount(v_drv.id);

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
    update public.wallets set balance_fcfa = balance_fcfa + v_amount, updated_at = now()
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
    values (v_epargne_id, 'tamassur_saving', v_amount, 'internal', 'success',
            jsonb_build_object('period', v_period, 'product', 'tamassur', 'mode', 'daily_firm',
                               'from_rachat', v_fund_share, 'from_revenus', v_rev_debit));

    v_debited := v_debited + 1;
    v_total := v_total + v_amount;
    v_from_fund := v_from_fund + v_fund_share;
    if v_new_bal < 0 then v_negative := v_negative + 1; end if;
  end loop;

  return jsonb_build_object(
    'period', v_period,
    'drivers_scanned', v_drivers,
    'debited', v_debited,
    'saved_fcfa', v_total,
    'from_rachat_fcfa', v_from_fund,
    'balances_negative', v_negative
  );
end;
$fn_charge$;
revoke execute on function public.charge_driver_insurance(date) from public, anon, authenticated;
grant execute on function public.charge_driver_insurance(date) to service_role;
