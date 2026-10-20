-- ============================================================
-- (1) TamAssur facultatif pour les chauffeurs propriétaires de leur véhicule (décision du fondateur, 2026-10-21) ; obligatoire en formule Cession.
--     Adhésion et retrait depuis l'application ; la cotisation (1 000 F par jour, du lundi au samedi) n'est prélevée qu'à partir de l'adhésion.
--     Le retrait de l'adhésion arrête les prélèvements et alerte l'équipe : l'épargne constituée est restituée sous 90 jours (CGU).
--     Le prélèvement du 20 octobre sur les trois propriétaires est annulé (cotisation remboursée, épargne du jour retirée).
-- (2) Durée du contrat du tricycle : 2 ans (24 mois) au lieu de 3 ans ; le premier palier de l'épargne garantie (500 000 F à 24 mois) est alors aussi le terme.
-- ============================================================

alter table public.drivers add column if not exists tamassur_enrolled boolean not null default false;

-- Cotisation quotidienne : formule Cession, ou propriétaire adhérent
CREATE OR REPLACE FUNCTION public.charge_driver_insurance(p_period date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       and (d.application_type::text = 'cession' or d.tamassur_enrolled)
       and not exists (select 1 from public.driver_excused_days x where x.driver_id = d.id and x.day = v_period)
       and not (v_period >= public._floor_start() and public._floor_target(d.id) > 0)
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
$function$;

drop function if exists public.my_tamassur_plan();
create or replace function public.my_tamassur_plan()
returns table (min_amount int, amount int, fund_pct int, goal_fcfa int, optional boolean, enrolled boolean)
language sql stable security definer set search_path = public as $fn$
  select public._tamassur_category_amount(v.category::text),
         public._tamassur_amount(d.id),
         public._program_rule('tamassur_fund_pct'),
         public._tamassur_goal(d.id),
         d.application_type::text = 'proprietaire',
         d.application_type::text = 'cession' or d.tamassur_enrolled
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.profile_id = auth.uid();
$fn$;
revoke execute on function public.my_tamassur_plan() from public, anon;
grant execute on function public.my_tamassur_plan() to authenticated;

-- Adhésion / retrait d'un chauffeur propriétaire
create or replace function public.set_my_tamassur_enrollment(p_enroll boolean)
returns boolean
language plpgsql security definer set search_path = public as $fn$
declare
  v record;
  v_ep int;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id, profile_id, application_type::text as formule, tamassur_enrolled into v from public.drivers where profile_id = auth.uid();
  if v.id is null then raise exception 'not_a_driver'; end if;
  if v.formule <> 'proprietaire' then
    raise exception 'TamAssur est obligatoire pour un chauffeur en formule Cession.';
  end if;
  update public.drivers set tamassur_enrolled = coalesce(p_enroll, false), updated_at = now() where id = v.id;
  if not coalesce(p_enroll, false) and v.tamassur_enrolled then
    select coalesce(max(balance_fcfa), 0) into v_ep from public.wallets where profile_id = v.profile_id and kind::text = 'tamcar_epargne';
    select full_name into v_name from public.profiles where id = v.profile_id;
    if v_ep > 0 then
      perform public._admin_alert('tamassur_exit', 'normal', 'Sortie TamAssur : ' || coalesce(v_name, 'chauffeur propriétaire'),
                                  'Le chauffeur arrête TamAssur : restituer l''épargne constituée (' || v_ep || ' F) sous 90 jours.', '/admin/tamassur', v.id);
    end if;
  end if;
  return coalesce(p_enroll, false);
end;
$fn$;
revoke execute on function public.set_my_tamassur_enrollment(boolean) from public, anon;
grant execute on function public.set_my_tamassur_enrollment(boolean) to authenticated;

-- Annulation du prélèvement du 20 octobre sur les propriétaires non adhérents
do $do$
declare
  r record;
  v_rev uuid;
  v_ep uuid;
begin
  for r in
    select c.id, c.driver_id, c.collected_fcfa, coalesce(c.saved_fcfa, 0) as saved, d.profile_id
      from public.driver_insurance_charges c join public.drivers d on d.id = c.driver_id
     where c.period = date '2026-10-20' and c.status = 'paid' and d.application_type::text = 'proprietaire' and not d.tamassur_enrolled
  loop
    select id into v_rev from public.wallets where profile_id = r.profile_id and kind::text = 'tamcar_revenus' for update;
    select id into v_ep from public.wallets where profile_id = r.profile_id and kind::text = 'tamcar_epargne' for update;
    update public.wallets set balance_fcfa = balance_fcfa + r.collected_fcfa, updated_at = now() where id = v_rev;
    update public.wallets set balance_fcfa = balance_fcfa - r.saved, updated_at = now() where id = v_ep;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_rev, 'adjustment', r.collected_fcfa, 'internal', 'success', jsonb_build_object('reason', 'TamAssur devenu facultatif : cotisation du 20/10 remboursée')),
           (v_ep, 'adjustment', -r.saved, 'internal', 'success', jsonb_build_object('reason', 'TamAssur devenu facultatif : épargne du 20/10 annulée'));
    update public.driver_insurance_charges set status = 'waived' where id = r.id;
  end loop;
end
$do$;

-- Durée du contrat du tricycle : 2 ans
update public.program_rules set value = 24 where key = 'contract_months_tricycle';
