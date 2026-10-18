-- ============================================================
-- TamCar — Objectif quotidien : le manque se prélève sur l'OBJECTIF (3 500 F pour une moto), annulation d'un versement hors application,
--          comptabilisation des versements hors application dans TamCar Office (2026-10-16)
--
--   Décision de Terence (2026-10-16) : « En deça de 3 500 F, on prélève le manque sur 3 500 F ». Le manque est donc calculé sur l'OBJECTIF
--   tout compris (versement + cotisation), plus seulement sur le versement. À minuit, la part de TamCar est complétée jusqu'à l'objectif ;
--   la cotisation étant ainsi payée, l'épargne du jour (834 F) est créditée dans tous les cas (jour travaillé, lundi-samedi) :
--     - part >= objectif : rien n'est prélevé, 834 F épargnés (crédité dès que l'objectif est atteint, avant minuit) ;
--     - part < objectif  : (objectif - part) est prélevé à minuit, 834 F épargnés.
--
--   Versements hors application (admin_declare_offline_payment) : désormais
--     - ANNULABLES (admin_cancel_offline_payment) : le versement reste visible, barré, avec le motif ; le jour est ré-évalué ;
--     - COMPTABILISÉS dans TamCar Office : écriture CS (espèces, compte 571) ou MM (Mobile Money MTN 5311 / Moov 5312 / Celtiis 5313)
--       au débit, commissions sur courses (7061) au crédit ; l'annulation passe l'extourne correspondante.
-- ============================================================

-- 1. Table : opérateur Mobile Money, annulation, lien avec l'écriture comptable
alter table public.driver_offline_payments add column if not exists operator text;
alter table public.driver_offline_payments add column if not exists cancelled_at timestamptz;
alter table public.driver_offline_payments add column if not exists cancelled_by uuid;
alter table public.driver_offline_payments add column if not exists cancel_reason text;
alter table public.driver_offline_payments add column if not exists bo_entry_id uuid references public.bo_entries(id);
alter table public.driver_offline_payments add column if not exists bo_reversal_id uuid references public.bo_entries(id);
alter table public.driver_offline_payments drop constraint if exists driver_offline_payments_operator_check;
alter table public.driver_offline_payments add constraint driver_offline_payments_operator_check
  check (operator is null or operator in ('mtn', 'moov', 'celtiis'));

-- 2. Nouvelle origine d'écriture dans le moteur comptable
alter table public.bo_entries drop constraint if exists bo_entries_source_check;
alter table public.bo_entries add constraint bo_entries_source_check
  check (source in ('manual', 'expense', 'platform', 'reversal', 'offline_payment'));

-- 3. Évaluation d'un jour : le manque se prélève sur l'objectif ; l'épargne du jour est créditée dès que l'objectif est payé (atteint ou complété à minuit)
create or replace function public._floor_eval_day(p_driver uuid, p_day date, p_final boolean)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_prof uuid; v_cat text; v_app text;
  v_vers int; v_cot int; v_target int; v_vol int; v_part int; v_off int; v_s int;
  v_reached boolean; v_short int; v_prev_short int := 0; v_prev_status text; v_prev_exists boolean := false; v_delta int;
  v_wallet uuid; v_ep uuid; v_saved int := 0; v_saved_done boolean; v_dfrom date; v_status text;
begin
  select d.profile_id, v.category::text, d.application_type::text into v_prof, v_cat, v_app
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id where d.id = p_driver;
  if v_prof is null or v_app <> 'cession' then return null; end if;
  v_vers := public._vehicle_versement(coalesce(v_cat, ''));
  if v_vers <= 0 then return null; end if;

  v_cot := public._tamassur_amount(p_driver);
  v_target := v_vers + v_cot;

  if exists (select 1 from public.driver_excused_days x where x.driver_id = p_driver and x.day = p_day) then
    if p_final then
      insert into public.driver_floor_log (driver_id, day, due_fcfa, status)
      values (p_driver, p_day, v_target, 'excused') on conflict (driver_id, day) do nothing;
    end if;
    return jsonb_build_object('status', 'excused');
  end if;

  select t.volume, t.part into v_vol, v_part from public._floor_day_totals(p_driver, p_day) t;
  select coalesce(sum(o.amount_fcfa), 0)::int into v_off
    from public.driver_offline_payments o where o.driver_id = p_driver and o.day = p_day and o.cancelled_at is null;
  v_s := v_part + v_off;
  v_reached := v_s >= v_target;
  v_short := greatest(0, v_target - v_s);

  -- Épargne : créditée une seule fois par jour, dès que l'objectif est atteint, ou à la clôture (le manque prélevé complète alors l'objectif)
  select nullif(value, '')::date into v_dfrom from public._push_settings where key = 'tamassur_debit_from';
  v_dfrom := coalesce(v_dfrom, date '2027-01-01');
  select exists (select 1 from public.driver_insurance_charges c where c.driver_id = p_driver and c.period = p_day and c.status = 'paid') into v_saved_done;
  if (v_reached or p_final) and not v_saved_done and p_day >= v_dfrom then
    v_saved := public._tamassur_savings_day(p_driver);
    insert into public.driver_insurance_charges (driver_id, period, amount_fcfa, collected_fcfa, saved_fcfa, status, collected_at)
    values (p_driver, p_day, v_cot, v_cot, v_saved, 'paid', now())
    on conflict (driver_id, period) do update
      set amount_fcfa = excluded.amount_fcfa, collected_fcfa = excluded.collected_fcfa, saved_fcfa = excluded.saved_fcfa,
          status = 'paid', collected_at = now()
      where public.driver_insurance_charges.status <> 'paid';
    select id into v_ep from public.wallets where profile_id = v_prof and kind = 'tamcar_epargne' for update;
    if v_ep is null then
      insert into public.wallets (profile_id, kind, balance_fcfa) values (v_prof, 'tamcar_epargne', 0) returning id into v_ep;
    end if;
    update public.wallets set balance_fcfa = balance_fcfa + v_saved, updated_at = now() where id = v_ep;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_ep, 'tamassur_saving', v_saved, 'internal', 'success',
            jsonb_build_object('day', p_day, 'product', 'tamassur',
                               'mode', case when v_reached then 'objectif_atteint' else 'complete_a_minuit' end,
                               'cotisation', v_cot, 'frais_garantie', v_cot - v_saved, 'part_tamcar', v_s, 'objectif', v_target));
  end if;

  if p_final then
    select true, l.shortfall_fcfa, l.status into v_prev_exists, v_prev_short, v_prev_status
      from public.driver_floor_log l where l.driver_id = p_driver and l.day = p_day;
    if v_prev_status = 'refunded' then return jsonb_build_object('status', 'refunded'); end if;
    v_delta := v_short - coalesce(v_prev_short, 0);
    if v_delta <> 0 then
      select id into v_wallet from public.wallets where profile_id = v_prof and kind = 'tamcar_revenus' for update;
      if v_wallet is null then
        insert into public.wallets (profile_id, kind, balance_fcfa) values (v_prof, 'tamcar_revenus', 0) returning id into v_wallet;
      end if;
      update public.wallets set balance_fcfa = balance_fcfa - v_delta, updated_at = now() where id = v_wallet;
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
      values (v_wallet, (case when v_delta > 0 then 'floor_topup' else 'floor_refund' end)::public.wallet_tx_type, abs(v_delta), 'internal', 'success',
              jsonb_build_object('day', p_day, 'due', v_vers, 'objectif', v_target, 'tamcar_part', v_part, 'hors_application', v_off, 'volume', v_vol));
    end if;
    v_status := case when v_short = 0 then 'covered' else 'charged' end;
    insert into public.driver_floor_log (driver_id, day, due_fcfa, volume_fcfa, tamcar_part_fcfa, shortfall_fcfa, status, offline_fcfa, saved_fcfa)
    values (p_driver, p_day, v_target, v_vol, v_part, v_short, v_status, v_off,
            coalesce((select c.saved_fcfa from public.driver_insurance_charges c where c.driver_id = p_driver and c.period = p_day and c.status = 'paid'), 0))
    on conflict (driver_id, day) do update
      set due_fcfa = excluded.due_fcfa, volume_fcfa = excluded.volume_fcfa, tamcar_part_fcfa = excluded.tamcar_part_fcfa,
          shortfall_fcfa = excluded.shortfall_fcfa, status = excluded.status, offline_fcfa = excluded.offline_fcfa, saved_fcfa = excluded.saved_fcfa;
    if not coalesce(v_prev_exists, false) and v_short > 0 then
      perform public._push_notify(
        v_prof,
        'Objectif du jour : ' || v_short || ' F prélevés',
        'Le ' || to_char(p_day, 'DD/MM') || ', la part de TamCar sur vos courses était de ' || v_s || ' F pour un objectif de ' || v_target
          || ' F. Les ' || v_short || ' F manquants ont été prélevés sur votre portefeuille : l''objectif est atteint et votre épargne avance'
          || case when v_saved > 0 then ' de ' || v_saved || ' F.' else '.' end,
        '/wallet', 'floor:' || p_day::text, false
      );
    end if;
  end if;

  return jsonb_build_object('status', case when v_short = 0 then 'covered' else 'charged' end, 'reached', v_reached, 'part', v_s, 'target', v_target,
                            'shortfall', v_short, 'saved', v_saved, 'closed', p_final, 'delta', v_delta);
end;
$fn$;
revoke execute on function public._floor_eval_day(uuid, date, boolean) from public, anon, authenticated;

-- 4. Clôture de minuit : l'épargne du jour compte aussi pour les jours complétés par un prélèvement
create or replace function public.charge_driver_floor(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Porto-Novo')::date - 1);
  v_drv record;
  v_res jsonb;
  v_scanned int := 0; v_covered int := 0; v_excused int := 0; v_charged int := 0; v_total int := 0; v_saved int := 0;
begin
  if extract(dow from v_day) = 0 then
    return jsonb_build_object('day', v_day, 'skipped', 'sunday');
  end if;
  if v_day < public._floor_start() then
    return jsonb_build_object('day', v_day, 'skipped', 'not_started', 'starts_on', public._floor_start());
  end if;

  for v_drv in
    select d.id from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.application_type::text = 'cession'
  loop
    v_res := public._floor_eval_day(v_drv.id, v_day, true);
    if v_res is null then continue; end if;
    v_scanned := v_scanned + 1;
    case v_res ->> 'status'
      when 'excused' then v_excused := v_excused + 1;
      when 'covered' then v_covered := v_covered + 1; v_saved := v_saved + coalesce((v_res ->> 'saved')::int, 0);
      when 'charged' then v_charged := v_charged + 1; v_total := v_total + coalesce((v_res ->> 'shortfall')::int, 0);
                          v_saved := v_saved + coalesce((v_res ->> 'saved')::int, 0);
      else null;
    end case;
  end loop;

  return jsonb_build_object('day', v_day, 'drivers_scanned', v_scanned, 'covered', v_covered,
                            'excused', v_excused, 'charged', v_charged, 'charged_fcfa', v_total, 'saved_fcfa', v_saved);
end;
$fn$;
revoke execute on function public.charge_driver_floor(date) from public, anon, authenticated;
grant execute on function public.charge_driver_floor(date) to service_role;

-- 5. Jauge du chauffeur : seuls les versements non annulés comptent
drop function if exists public.driver_floor_today(uuid);
create function public.driver_floor_today(p_driver_id uuid)
returns table (
  applies boolean, versement_fcfa int, volume_fcfa int, tamcar_part_fcfa int, pct int, surplus_fcfa int, remaining_fcfa int,
  excused boolean, is_sunday boolean, started boolean, starts_on date, extension_days int, contract_end_on date,
  cotisation_fcfa int, savings_fcfa int, offline_fcfa int, reached boolean
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_target int;
  v_cot int;
  v_vol int := 0;
  v_part int := 0;
  v_off int := 0;
  v_s int;
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
begin
  if not exists (select 1 from public.drivers d where d.id = p_driver_id and (d.profile_id = auth.uid() or public.is_admin())) then
    raise exception 'Not authorized';
  end if;
  v_target := public._floor_target(p_driver_id);
  v_cot := case when v_target > 0 then public._tamassur_amount(p_driver_id) else 0 end;
  select t.volume, t.part into v_vol, v_part from public._floor_day_totals(p_driver_id, v_today) t;
  select coalesce(sum(o.amount_fcfa), 0)::int into v_off
    from public.driver_offline_payments o where o.driver_id = p_driver_id and o.day = v_today and o.cancelled_at is null;
  v_s := v_part + v_off;

  return query select
    v_target > 0,
    v_target,
    v_vol,
    v_s,
    case when v_target > 0 then (v_s * 100 / v_target) else 0 end,
    greatest(0, v_s - v_target),
    greatest(0, v_target - v_s),
    exists (select 1 from public.driver_excused_days x where x.driver_id = p_driver_id and x.day = v_today),
    extract(dow from v_today) = 0,
    v_today >= public._floor_start(),
    public._floor_start(),
    (select count(*)::int from public.driver_excused_days x where x.driver_id = p_driver_id),
    public._cession_end(p_driver_id),
    v_cot,
    case when v_target > 0 then public._tamassur_savings_day(p_driver_id) else 0 end,
    v_off,
    v_target > 0 and v_s >= v_target;
end;
$fn$;
revoke execute on function public.driver_floor_today(uuid) from public, anon;
grant execute on function public.driver_floor_today(uuid) to authenticated;

-- 6. Déclaration d'un versement hors application : + opérateur Mobile Money + écriture comptable TamCar Office
drop function if exists public.admin_declare_offline_payment(uuid, date, int, text, text);
create function public.admin_declare_offline_payment(
  p_driver_id uuid, p_day date, p_amount int, p_method text, p_note text default null, p_operator text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_prof uuid;
  v_app text;
  v_name text;
  v_target int;
  v_id uuid;
  v_res jsonb;
  v_acc text;
  v_journal text;
  v_how text;
  v_entry public.bo_entries;
  v_refund int := 0;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_method is null or p_method not in ('cash', 'mobile_money') then raise exception 'Moyen de paiement invalide (espèces ou Mobile Money)'; end if;
  if p_method = 'mobile_money' and coalesce(p_operator, '') not in ('mtn', 'moov', 'celtiis') then
    raise exception 'Indiquez l''opérateur Mobile Money (MTN, Moov ou Celtiis)';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'Montant invalide (entre 1 et 1 000 000 F)'; end if;
  if p_day is null or p_day > v_today then raise exception 'La date ne peut pas être dans le futur'; end if;
  if p_day < v_today - 30 then raise exception 'On ne peut pas déclarer un jour de plus de 30 jours en arrière'; end if;
  if extract(dow from p_day) = 0 then raise exception 'Pas d''objectif le dimanche'; end if;
  if p_day < public._floor_start() then
    raise exception 'L''objectif quotidien démarre le %', to_char(public._floor_start(), 'DD/MM/YYYY');
  end if;
  select d.profile_id, d.application_type::text, p.full_name into v_prof, v_app, v_name
    from public.drivers d left join public.profiles p on p.id = d.profile_id where d.id = p_driver_id;
  if v_prof is null then raise exception 'Chauffeur inconnu'; end if;
  if v_app <> 'cession' then raise exception 'Seuls les chauffeurs en formule Cession ont un objectif quotidien'; end if;
  v_target := public._floor_target(p_driver_id);
  if v_target <= 0 then raise exception 'Aucun objectif pour ce véhicule'; end if;
  if exists (select 1 from public.driver_excused_days x where x.driver_id = p_driver_id and x.day = p_day) then
    raise exception 'Ce jour est déclaré non travaillé : retirez-le d''abord';
  end if;

  insert into public.driver_offline_payments (driver_id, day, amount_fcfa, method, operator, note, created_by)
  values (p_driver_id, p_day, p_amount, p_method, case when p_method = 'mobile_money' then p_operator else null end,
          nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;

  -- TamCar Office : espèces -> caisse (571, journal CS) ; Mobile Money -> compte de l'opérateur (journal MM) ; produit -> commissions sur courses (7061)
  if p_method = 'cash' then
    v_acc := '571'; v_journal := 'CS'; v_how := 'espèces';
  else
    v_acc := case p_operator when 'mtn' then '5311' when 'moov' then '5312' else '5313' end;
    v_journal := 'MM';
    v_how := 'Mobile Money ' || case p_operator when 'mtn' then 'MTN' when 'moov' then 'Moov' else 'Celtiis' end;
  end if;
  v_entry := public._bo_insert_entry(
    v_journal, v_today,
    'Versement hors application — ' || coalesce(v_name, 'chauffeur') || ' — jour du ' || to_char(p_day, 'DD/MM/YYYY') || ' — ' || v_how,
    jsonb_build_array(
      jsonb_build_object('account', v_acc, 'label', 'Encaissement ' || v_how, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account', '7061', 'label', 'Part de TamCar sur courses hors application', 'debit', 0, 'credit', p_amount)),
    'offline_payment', 'offline:' || v_id::text, null, null);
  update public.driver_offline_payments set bo_entry_id = v_entry.id where id = v_id;

  -- Jour déjà clôturé : prélèvement ajusté (remboursement du manque) ; jour en cours : seule l'épargne, dès que l'objectif est atteint
  v_res := public._floor_eval_day(p_driver_id, p_day, p_day < v_today);
  if coalesce((v_res ->> 'delta')::int, 0) < 0 then v_refund := -(v_res ->> 'delta')::int; end if;

  perform public._push_notify(
    v_prof, 'Versement hors application enregistré',
    'TamCar a enregistré ' || p_amount || ' F reçus ' || case when p_method = 'mobile_money' then 'par Mobile Money' else 'en espèces' end
      || ' pour le ' || to_char(p_day, 'DD/MM') || '.'
      || case when v_refund > 0 then ' ' || v_refund || ' F vous ont été remboursés.' else '' end
      || case when coalesce((v_res ->> 'reached')::boolean, false) then ' Objectif atteint.' else '' end,
    '/dashboard', 'offline:' || v_id::text, false
  );

  return jsonb_build_object('id', v_id, 'reached', coalesce((v_res ->> 'reached')::boolean, false), 'part_fcfa', v_res -> 'part', 'target_fcfa', v_target,
                            'shortfall_fcfa', v_res -> 'shortfall', 'saved_fcfa', v_res -> 'saved', 'refunded_fcfa', v_refund,
                            'entry_no', v_entry.entry_no);
end;
$fn$;
revoke execute on function public.admin_declare_offline_payment(uuid, date, int, text, text, text) from public, anon;
grant execute on function public.admin_declare_offline_payment(uuid, date, int, text, text, text) to authenticated;

-- 7. Annulation d'un versement hors application : le versement reste visible (annulé), le jour est ré-évalué, l'écriture comptable est extournée
create or replace function public.admin_cancel_offline_payment(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  o public.driver_offline_payments;
  e public.bo_entries;
  v_rev public.bo_entries;
  v_lines jsonb;
  v_prof uuid;
  v_res jsonb;
  v_extra int := 0;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select * into o from public.driver_offline_payments where id = p_id for update;
  if not found then raise exception 'Versement introuvable'; end if;
  if o.cancelled_at is not null then raise exception 'Ce versement est déjà annulé'; end if;

  update public.driver_offline_payments
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = nullif(trim(p_reason), '')
   where id = p_id;

  -- TamCar Office : extourne de l'écriture d'encaissement (sauf si elle a déjà été extournée à la main)
  if o.bo_entry_id is not null then
    select * into e from public.bo_entries where id = o.bo_entry_id;
    if found and e.reversed_by is null then
      select jsonb_agg(jsonb_build_object('account', l.account_code, 'label', coalesce(l.label, 'Extourne'),
                                          'debit', l.credit_fcfa, 'credit', l.debit_fcfa) order by l.line_no)
        into v_lines from public.bo_entry_lines l where l.entry_id = e.id;
      v_rev := public._bo_insert_entry(e.journal_code, v_today, 'EXTOURNE ' || e.entry_no || ' — ' || e.label,
                                       v_lines, 'reversal', null, e.document_id, e.id);
      update public.bo_entries set reversed_by = v_rev.id where id = e.id;
      update public.driver_offline_payments set bo_reversal_id = v_rev.id where id = p_id;
    end if;
  end if;

  -- Le jour est ré-évalué sans ce versement : si le jour est clôturé, le manque est prélevé de nouveau
  v_res := public._floor_eval_day(o.driver_id, o.day, o.day < v_today);
  if coalesce((v_res ->> 'delta')::int, 0) > 0 then v_extra := (v_res ->> 'delta')::int; end if;

  select profile_id into v_prof from public.drivers where id = o.driver_id;
  if v_prof is not null then
    perform public._push_notify(
      v_prof, 'Versement hors application annulé',
      'TamCar a annulé l''enregistrement de ' || o.amount_fcfa || ' F pour le ' || to_char(o.day, 'DD/MM') || '.'
        || case when v_extra > 0 then ' ' || v_extra || ' F ont été prélevés pour compléter la part de TamCar du jour.'
                else ' Votre part du jour est recalculée.' end,
      '/dashboard', 'offline_cancel:' || p_id::text, false
    );
  end if;

  return jsonb_build_object('cancelled', true, 'day', o.day, 'amount_fcfa', o.amount_fcfa,
                            'part_fcfa', v_res -> 'part', 'target_fcfa', v_res -> 'target', 'extra_debited_fcfa', v_extra);
end;
$fn$;
revoke execute on function public.admin_cancel_offline_payment(uuid, text) from public, anon;
grant execute on function public.admin_cancel_offline_payment(uuid, text) to authenticated;

-- 8. Liste admin des versements hors application (annulés compris)
drop function if exists public.admin_driver_offline_payments(uuid);
create function public.admin_driver_offline_payments(p_driver_id uuid)
returns table (
  id uuid, day date, amount_fcfa int, method text, operator text, note text, created_at timestamptz, created_by_name text,
  day_status text, day_saved_fcfa int, cancelled_at timestamptz, cancel_reason text, entry_no text
)
language sql stable security definer set search_path = public as $fn$
  select o.id, o.day, o.amount_fcfa, o.method, o.operator, o.note, o.created_at, p.full_name,
         (select l.status from public.driver_floor_log l where l.driver_id = o.driver_id and l.day = o.day),
         (select c.saved_fcfa from public.driver_insurance_charges c where c.driver_id = o.driver_id and c.period = o.day and c.status = 'paid'),
         o.cancelled_at, o.cancel_reason,
         (select e.entry_no from public.bo_entries e where e.id = o.bo_entry_id)
    from public.driver_offline_payments o
    left join public.profiles p on p.id = o.created_by
   where o.driver_id = p_driver_id and public.is_admin()
   order by o.day desc, o.created_at desc
   limit 60;
$fn$;
revoke execute on function public.admin_driver_offline_payments(uuid) from public, anon;
grant execute on function public.admin_driver_offline_payments(uuid) to authenticated;
