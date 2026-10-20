-- ============================================================
-- TamCar — Contrat de partenariat véhicule : planchers, durées par véhicule, fiche véhicule, sort du fonds, relevés, avis de fin (2026-10-20)
--
--   • Planchers de recettes (volume de courses par jour) = objectif du jour tout compris ÷ 60 % : moto 3 500 → 5 850 F, tricycle 6 000 → 10 000 F,
--     Essentiel 8 200 → 13 700 F, Confort 10 000 → 16 700 F (décision du fondateur, 2026-10-20). Ils servent de seuil au bonus et aux tableaux admin ;
--     le versement réellement dû reste celui des réglages versement_* (+ 1 000 F de TamAssur).
--   • Durée du contrat PAR VÉHICULE (article 4.2) : durée retenue sur la fiche, à défaut la durée de la catégorie (moto 12, tricycle 36, Essentiel 36,
--     Confort 48, VIP 60 mois). La date de fin de contrat n'est plus liée à la durée du retrait TamAssur (inchangée).
--   • Fiche véhicule numérique (annexe 1, articles 5.3 bis, 6.1, 6.3) : assurance, visite technique, traceur, châssis, kilométrage, motorisation, dépôt des
--     papiers. Un véhicule dont l'assurance ou la visite technique est expirée est SUSPENDU (hors ligne, sans Part due), réactivé dès la régularisation ;
--     rappels au partenaire 30 et 7 jours avant l'échéance.
--   • Sort du fonds de rachat à la fin du contrat d'un chauffeur (article 12) : restitué au chauffeur, sauf faute (alors conservé par TamCar).
--   • Relevé mensuel par véhicule (article 9.8) et fins de Durée à venir ; avis écrit 15 jours avant la fin de la Durée (article 5.3 ter).
-- ============================================================

-- 1. Planchers et durées --------------------------------------------------------------------------------------------------------------
update public.program_rules set value = 5850  where key = 'floor_moto';
update public.program_rules set value = 10000 where key = 'floor_tricycle';
update public.program_rules set value = 13700 where key = 'floor_essentiel';
update public.program_rules set value = 16700 where key = 'floor_confort';
update public.program_rules set label = 'Plancher de recettes moto : volume de courses par jour (F) à partir duquel la part de TamCar (60 %) couvre l''objectif du jour de 3 500 F' where key = 'floor_moto';
update public.program_rules set label = 'Plancher de recettes tricycle : volume de courses par jour (F) à partir duquel la part de TamCar (60 %) couvre l''objectif du jour de 6 000 F' where key = 'floor_tricycle';
update public.program_rules set label = 'Plancher de recettes Essentiel : volume de courses par jour (F) à partir duquel la part de TamCar (60 %) couvre l''objectif du jour de 8 200 F' where key = 'floor_essentiel';
update public.program_rules set label = 'Plancher de recettes Confort : volume de courses par jour (F) à partir duquel la part de TamCar (60 %) couvre l''objectif du jour de 10 000 F' where key = 'floor_confort';

insert into public.program_rules (key, value, label) values
  ('contract_months_moto',      12, 'Durée indicative du contrat, moto (mois)'),
  ('contract_months_tricycle',  36, 'Durée indicative du contrat, tricycle (mois)'),
  ('contract_months_essentiel', 36, 'Durée indicative du contrat, voiture Essentiel (mois)'),
  ('contract_months_confort',   48, 'Durée indicative du contrat, voiture Confort (mois)'),
  ('contract_months_premium',   60, 'Durée indicative du contrat, voiture VIP (mois)')
on conflict (key) do update set label = excluded.label;

-- 2. Fiche véhicule ------------------------------------------------------------------------------------------------------------------
alter table public.vehicles add column if not exists vin text;
alter table public.vehicles add column if not exists entry_km int;
alter table public.vehicles add column if not exists engine text;
alter table public.vehicles add column if not exists contract_months int;
alter table public.vehicles add column if not exists insurance_company text;
alter table public.vehicles add column if not exists insurance_policy text;
alter table public.vehicles add column if not exists insurance_expires_on date;
alter table public.vehicles add column if not exists technical_visit_expires_on date;
alter table public.vehicles add column if not exists tracker_id text;
alter table public.vehicles add column if not exists papers_deposited_on date;
alter table public.vehicles add column if not exists papers_receipt text;
alter table public.vehicles add column if not exists suspension_reason text;
alter table public.vehicles drop constraint if exists vehicles_engine_chk;
alter table public.vehicles add constraint vehicles_engine_chk check (engine is null or engine in ('essence', 'diesel', 'hybride', 'electrique'));
alter table public.vehicles drop constraint if exists vehicles_contract_months_chk;
alter table public.vehicles add constraint vehicles_contract_months_chk check (contract_months is null or contract_months between 1 and 120);

create table if not exists public.vehicle_compliance_notices (
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  kind text not null check (kind in ('insurance', 'visit')),
  expires_on date not null,
  threshold int not null,
  created_at timestamptz not null default now(),
  primary key (vehicle_id, kind, expires_on, threshold)
);
alter table public.vehicle_compliance_notices enable row level security;
revoke all on public.vehicle_compliance_notices from anon, authenticated;

-- Durée du contrat d'un chauffeur : durée retenue de son véhicule, sinon durée de la catégorie
create or replace function public._contract_months(p_driver uuid)
returns int
language sql stable security definer set search_path = public as $fn$
  select greatest(1, coalesce(v.contract_months, case v.category::text
           when 'moto' then public._program_rule('contract_months_moto')
           when 'tricycle' then public._program_rule('contract_months_tricycle')
           when 'confort' then public._program_rule('contract_months_confort')
           when 'premium' then public._program_rule('contract_months_premium')
           else public._program_rule('contract_months_essentiel') end))
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = p_driver;
$fn$;
revoke execute on function public._contract_months(uuid) from public, anon, authenticated;

-- Conformité d'un véhicule : suspend si l'assurance ou la visite technique est expirée, réactive après régularisation ; renvoie l'action faite
create or replace function public._vehicle_compliance_one(p_vehicle uuid)
returns text
language plpgsql security definer set search_path = public as $fn$
declare
  v public.vehicles;
  today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_reason text;
  v_dealer_profile uuid;
  r record;
begin
  select * into v from public.vehicles where id = p_vehicle for update;
  if v.id is null then return null; end if;
  v_reason := case
    when v.insurance_expires_on is not null and v.insurance_expires_on < today then 'Assurance expirée le ' || to_char(v.insurance_expires_on, 'DD/MM/YYYY')
    when v.technical_visit_expires_on is not null and v.technical_visit_expires_on < today then 'Visite technique expirée le ' || to_char(v.technical_visit_expires_on, 'DD/MM/YYYY')
    else null end;
  if v_reason is not null and v.status = 'active' and v.suspension_reason is null then
    update public.vehicles set status = 'maintenance', suspension_reason = v_reason, updated_at = now() where id = v.id;
    update public.drivers set is_online = false, updated_at = now() where current_vehicle_id = v.id and is_online;
    select dp.profile_id into v_dealer_profile from public.dealer_partners dp where dp.id = v.dealer_partner_id;
    perform public._admin_alert('vehicle_suspended', 'critical', 'Véhicule suspendu', v.plate_number || ' : ' || v_reason, '/admin/vehicles', v.id);
    if v_dealer_profile is not null then
      perform public._push_notify(v_dealer_profile, 'Véhicule suspendu', v.plate_number || ' : ' || v_reason || '. Régularisez pour le remettre en service.', '/espace/vehicules', 'veh-susp:' || v.id::text, true);
    end if;
    for r in select d.profile_id from public.drivers d where d.current_vehicle_id = v.id loop
      perform public._push_notify(r.profile_id, 'Véhicule suspendu', v_reason || '. Contactez TamCar.', '/', 'veh-susp-d:' || v.id::text, true);
    end loop;
    return 'suspended';
  elsif v_reason is null and v.suspension_reason is not null and v.status = 'maintenance' then
    update public.vehicles set status = 'active', suspension_reason = null, updated_at = now() where id = v.id;
    perform public._admin_alert('vehicle_reactivated', 'info', 'Véhicule remis en service', v.plate_number || ' : papiers régularisés.', '/admin/vehicles', v.id);
    return 'reactivated';
  end if;
  return null;
end;
$fn$;
revoke execute on function public._vehicle_compliance_one(uuid) from public, anon, authenticated;

-- Tournée quotidienne : suspensions, réactivations, rappels à 30 et 7 jours
create or replace function public._vehicle_compliance_sweep()
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  today date := (now() at time zone 'Africa/Porto-Novo')::date;
  r record;
  k record;
  v_act text;
  v_susp int := 0;
  v_react int := 0;
  v_remind int := 0;
  v_ins int;
  v_profile uuid;
begin
  for r in select id from public.vehicles
            where status in ('active', 'maintenance')
              and (insurance_expires_on is not null or technical_visit_expires_on is not null or suspension_reason is not null) loop
    v_act := public._vehicle_compliance_one(r.id);
    if v_act = 'suspended' then v_susp := v_susp + 1; elsif v_act = 'reactivated' then v_react := v_react + 1; end if;
  end loop;

  for k in
    select v.id, v.plate_number, v.dealer_partner_id, x.kind, x.expires_on, x.threshold
      from public.vehicles v
      cross join lateral (values ('insurance', v.insurance_expires_on), ('visit', v.technical_visit_expires_on)) as e(kind, expires_on)
      cross join lateral (values (30), (7)) as t(threshold)
      cross join lateral (select e.kind, e.expires_on, t.threshold) as x
     where v.status = 'active' and e.expires_on is not null and e.expires_on >= today and e.expires_on - today <= t.threshold
  loop
    insert into public.vehicle_compliance_notices (vehicle_id, kind, expires_on, threshold) values (k.id, k.kind, k.expires_on, k.threshold)
    on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then
      v_remind := v_remind + 1;
      select dp.profile_id into v_profile from public.dealer_partners dp where dp.id = k.dealer_partner_id;
      if v_profile is not null then
        perform public._push_notify(v_profile, case when k.kind = 'insurance' then 'Assurance bientôt expirée' else 'Visite technique bientôt expirée' end,
                                    k.plate_number || ' : échéance le ' || to_char(k.expires_on, 'DD/MM/YYYY') || '. Renouvelez-la pour éviter la suspension du véhicule.',
                                    '/espace/vehicules', 'veh-remind:' || k.id::text || ':' || k.kind || ':' || k.threshold::text, false);
      end if;
      perform public._admin_alert('vehicle_expiry', 'info', 'Échéance de véhicule',
                                  k.plate_number || ' : ' || case when k.kind = 'insurance' then 'assurance' else 'visite technique' end || ' le ' || to_char(k.expires_on, 'DD/MM/YYYY'),
                                  '/admin/vehicles', k.id);
    end if;
  end loop;
  return jsonb_build_object('suspended', v_susp, 'reactivated', v_react, 'reminders', v_remind);
end;
$fn$;
revoke execute on function public._vehicle_compliance_sweep() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'vehicle-compliance') then perform cron.unschedule('vehicle-compliance'); end if;
  perform cron.schedule('vehicle-compliance', '0 5 * * *', 'select public._vehicle_compliance_sweep()');
end
$do$;

create or replace function public.admin_update_vehicle_sheet(
  p_vehicle uuid, p_vin text, p_entry_km int, p_engine text, p_contract_months int,
  p_insurance_company text, p_insurance_policy text, p_insurance_expires_on date, p_technical_visit_expires_on date,
  p_tracker_id text, p_papers_deposited_on date, p_papers_receipt text
)
returns text
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if nullif(btrim(coalesce(p_engine, '')), '') is not null and p_engine not in ('essence', 'diesel', 'hybride', 'electrique') then
    raise exception 'Motorisation invalide';
  end if;
  if p_contract_months is not null and (p_contract_months < 1 or p_contract_months > 120) then
    raise exception 'La durée du contrat doit être comprise entre 1 et 120 mois.';
  end if;
  update public.vehicles
     set vin = nullif(btrim(coalesce(p_vin, '')), ''), entry_km = p_entry_km, engine = nullif(btrim(coalesce(p_engine, '')), ''),
         contract_months = p_contract_months,
         insurance_company = nullif(btrim(coalesce(p_insurance_company, '')), ''), insurance_policy = nullif(btrim(coalesce(p_insurance_policy, '')), ''),
         insurance_expires_on = p_insurance_expires_on, technical_visit_expires_on = p_technical_visit_expires_on,
         tracker_id = nullif(btrim(coalesce(p_tracker_id, '')), ''), papers_deposited_on = p_papers_deposited_on,
         papers_receipt = nullif(btrim(coalesce(p_papers_receipt, '')), ''), updated_at = now()
   where id = p_vehicle;
  if not found then raise exception 'Véhicule introuvable'; end if;
  return coalesce(public._vehicle_compliance_one(p_vehicle), 'ok');
end;
$fn$;
revoke execute on function public.admin_update_vehicle_sheet(uuid, text, int, text, int, text, text, date, date, text, date, text) from public, anon;
grant execute on function public.admin_update_vehicle_sheet(uuid, text, int, text, int, text, text, date, date, text, date, text) to authenticated;

-- Fiches des véhicules d'un partenaire (lecture seule) : conformité, durée, papiers déposés
create or replace function public.dealer_my_vehicle_sheets(p_dealer_id uuid default null)
returns table (
  vehicle_id uuid, plate_number text, engine text, contract_months int, insurance_company text, insurance_expires_on date,
  technical_visit_expires_on date, tracker_id text, papers_deposited_on date, suspension_reason text, driver_name text, contract_end date
)
language sql stable security definer set search_path = public as $fn$
  select v.id, v.plate_number, v.engine,
         coalesce(v.contract_months, case v.category::text when 'moto' then public._program_rule('contract_months_moto')
           when 'tricycle' then public._program_rule('contract_months_tricycle') when 'confort' then public._program_rule('contract_months_confort')
           when 'premium' then public._program_rule('contract_months_premium') else public._program_rule('contract_months_essentiel') end),
         v.insurance_company, v.insurance_expires_on, v.technical_visit_expires_on, v.tracker_id, v.papers_deposited_on, v.suspension_reason,
         (select p.full_name from public.drivers d join public.profiles p on p.id = d.profile_id
           where d.current_vehicle_id = v.id and d.status = 'active' order by d.created_at limit 1),
         (select public._cession_end(d.id) from public.drivers d
           where d.current_vehicle_id = v.id and d.status = 'active' and d.application_type::text = 'cession' order by d.created_at limit 1)
    from public.vehicles v
   where v.dealer_partner_id = public._dealer_resolve(p_dealer_id) and v.status <> 'archived'
   order by v.plate_number;
$fn$;
revoke execute on function public.dealer_my_vehicle_sheets(uuid) from public, anon;
grant execute on function public.dealer_my_vehicle_sheets(uuid) to authenticated;

-- 3. Sort du fonds de rachat (article 12) ---------------------------------------------------------------------------------------------
create table if not exists public.driver_fund_settlements (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id),
  vehicle_id uuid,
  amount_fcfa int not null,
  outcome text not null check (outcome in ('returned', 'kept')),
  note text,
  settled_by uuid,
  settled_at timestamptz not null default now()
);
alter table public.driver_fund_settlements enable row level security;
drop policy if exists driver_fund_settlements_admin on public.driver_fund_settlements;
create policy driver_fund_settlements_admin on public.driver_fund_settlements for select using (public.is_admin());
revoke all on public.driver_fund_settlements from anon, authenticated;
grant select on public.driver_fund_settlements to authenticated;

create or replace function public.admin_driver_fund(p_driver uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare v_bal int;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select coalesce(w.balance_fcfa, 0) into v_bal from public.drivers d
    left join public.wallets w on w.profile_id = d.profile_id and w.kind = 'tamcar_rachat' where d.id = p_driver;
  return jsonb_build_object(
    'balance_fcfa', coalesce(v_bal, 0),
    'settlements', coalesce((select jsonb_agg(jsonb_build_object('amount_fcfa', s.amount_fcfa, 'outcome', s.outcome, 'note', s.note, 'at', s.settled_at) order by s.settled_at desc)
                               from public.driver_fund_settlements s where s.driver_id = p_driver), '[]'::jsonb));
end;
$fn$;
revoke execute on function public.admin_driver_fund(uuid) from public, anon;
grant execute on function public.admin_driver_fund(uuid) to authenticated;

create or replace function public.admin_settle_driver_fund(p_driver uuid, p_fault boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_profile uuid;
  v_vehicle uuid;
  v_rachat record;
  v_rev record;
  v_bal int;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if coalesce(p_fault, false) and v_note is null then
    raise exception 'Une faute du chauffeur doit être motivée (preuves, observations recueillies sous 8 jours).';
  end if;
  select profile_id, current_vehicle_id into v_profile, v_vehicle from public.drivers where id = p_driver;
  if v_profile is null then raise exception 'Chauffeur introuvable'; end if;
  select id, balance_fcfa into v_rachat from public.wallets where profile_id = v_profile and kind = 'tamcar_rachat' for update;
  select id into v_rev from public.wallets where profile_id = v_profile and kind = 'tamcar_revenus' for update;
  v_bal := coalesce(v_rachat.balance_fcfa, 0);
  if v_rachat.id is null or v_bal <= 0 then
    return jsonb_build_object('settled_fcfa', 0, 'outcome', null);
  end if;
  update public.wallets set balance_fcfa = balance_fcfa - v_bal, updated_at = now() where id = v_rachat.id;
  if coalesce(p_fault, false) then
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_rachat.id, 'rachat_forfeit', -v_bal, 'internal', 'success', jsonb_build_object('note', v_note, 'by', auth.uid()));
  else
    if v_rev.id is null then raise exception 'Portefeuille Revenus du chauffeur introuvable'; end if;
    update public.wallets set balance_fcfa = balance_fcfa + v_bal, updated_at = now() where id = v_rev.id;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
    values (v_rachat.id, 'rachat_return', -v_bal, 'internal', 'success', jsonb_build_object('note', v_note, 'by', auth.uid(), 'to', 'tamcar_revenus')),
           (v_rev.id, 'rachat_return', v_bal, 'internal', 'success', jsonb_build_object('note', v_note, 'by', auth.uid(), 'from', 'tamcar_rachat'));
    perform public._push_notify(v_profile, 'Fonds de rachat restitué',
                                'Votre fonds de rachat de ' || v_bal || ' F a été versé sur vos revenus.', '/wallet', 'fund-return:' || p_driver::text || ':' || extract(epoch from now())::bigint::text, true);
  end if;
  insert into public.driver_fund_settlements (driver_id, vehicle_id, amount_fcfa, outcome, note, settled_by, settled_at)
  values (p_driver, v_vehicle, v_bal, case when coalesce(p_fault, false) then 'kept' else 'returned' end, v_note, auth.uid(), clock_timestamp());
  return jsonb_build_object('settled_fcfa', v_bal, 'outcome', case when coalesce(p_fault, false) then 'kept' else 'returned' end);
end;
$fn$;
revoke execute on function public.admin_settle_driver_fund(uuid, boolean, text) from public, anon;
grant execute on function public.admin_settle_driver_fund(uuid, boolean, text) to authenticated;

-- 4. Relevé mensuel par véhicule (article 9.8) -----------------------------------------------------------------------------------------
create or replace function public.dealer_my_statement(p_month date default null, p_dealer_id uuid default null)
returns table (
  vehicle_id uuid, plate_number text, brand text, model text, category text, rides int, active_days int, volume_fcfa bigint, share_fcfa bigint,
  fund_month_fcfa bigint, fund_total_fcfa bigint
)
language sql stable security definer set search_path = public as $fn$
  with b as (
    select date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Porto-Novo')::date))::date as d0
  ),
  me as (select public._dealer_resolve(p_dealer_id) as id)
  select v.id, v.plate_number, v.brand, v.model, v.category::text,
         (count(r.id) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date >= b.d0 and (r.ended_at at time zone 'Africa/Porto-Novo')::date < (b.d0 + interval '1 month')::date))::int,
         (count(distinct (r.ended_at at time zone 'Africa/Porto-Novo')::date) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date >= b.d0 and (r.ended_at at time zone 'Africa/Porto-Novo')::date < (b.d0 + interval '1 month')::date))::int,
         coalesce(sum(r.price_total_fcfa) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date >= b.d0 and (r.ended_at at time zone 'Africa/Porto-Novo')::date < (b.d0 + interval '1 month')::date), 0)::bigint,
         coalesce(sum(r.dealer_share_fcfa) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date >= b.d0 and (r.ended_at at time zone 'Africa/Porto-Novo')::date < (b.d0 + interval '1 month')::date), 0)::bigint,
         coalesce(sum(r.driver_rachat_fcfa) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date >= b.d0 and (r.ended_at at time zone 'Africa/Porto-Novo')::date < (b.d0 + interval '1 month')::date), 0)::bigint,
         coalesce(sum(r.driver_rachat_fcfa) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date < (b.d0 + interval '1 month')::date), 0)::bigint
    from public.vehicles v
    cross join b cross join me
    left join public.rides r on r.vehicle_id = v.id and r.status = 'completed' and r.ended_at is not null and r.dealer_partner_id = me.id
   where v.dealer_partner_id = me.id and v.status <> 'archived'
   group by v.id, v.plate_number, v.brand, v.model, v.category, b.d0
   order by v.plate_number;
$fn$;
revoke execute on function public.dealer_my_statement(date, uuid) from public, anon;
grant execute on function public.dealer_my_statement(date, uuid) to authenticated;

create or replace function public.dealer_my_statement_payouts(p_month date default null, p_dealer_id uuid default null)
returns table (decided_at timestamptz, amount_fcfa int, aib_fcfa int, fee_fcfa int, net_fcfa int, invoice_number text, reference text)
language sql stable security definer set search_path = public as $fn$
  select q.decided_at, q.amount_fcfa, q.aib_fcfa, q.fee_fcfa, q.net_fcfa, q.invoice_number, q.reference
    from public.dealer_payout_requests q
   where q.dealer_id = public._dealer_resolve(p_dealer_id) and q.status = 'paid'
     and (q.decided_at at time zone 'Africa/Porto-Novo')::date >= date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Porto-Novo')::date))::date
     and (q.decided_at at time zone 'Africa/Porto-Novo')::date < (date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Porto-Novo')::date)) + interval '1 month')::date
   order by q.decided_at;
$fn$;
revoke execute on function public.dealer_my_statement_payouts(date, uuid) from public, anon;
grant execute on function public.dealer_my_statement_payouts(date, uuid) to authenticated;

-- 5. Avis écrit 15 jours avant la fin de la Durée (article 5.3 ter) ----------------------------------------------------------------------
create table if not exists public.cession_notices (
  driver_id uuid not null references public.drivers(id) on delete cascade,
  end_date date not null,
  vehicle_id uuid,
  notified_on date not null default current_date,
  primary key (driver_id, end_date)
);
alter table public.cession_notices enable row level security;
drop policy if exists cession_notices_admin on public.cession_notices;
create policy cession_notices_admin on public.cession_notices for select using (public.is_admin());
revoke all on public.cession_notices from anon, authenticated;
grant select on public.cession_notices to authenticated;

create or replace function public._notify_cession_end()
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  today date := (now() at time zone 'Africa/Porto-Novo')::date;
  r record;
  v_n int := 0;
  v_ins int;
  v_dealer_profile uuid;
begin
  for r in
    select d.id as driver_id, d.profile_id, v.id as vehicle_id, v.plate_number, v.dealer_partner_id, public._cession_end(d.id) as end_date
      from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.application_type::text = 'cession'
  loop
    continue when r.end_date is null or r.end_date <= today or r.end_date > today + 15;
    insert into public.cession_notices (driver_id, end_date, vehicle_id, notified_on) values (r.driver_id, r.end_date, r.vehicle_id, today) on conflict do nothing;
    get diagnostics v_ins = row_count;
    continue when v_ins = 0;
    v_n := v_n + 1;
    select dp.profile_id into v_dealer_profile from public.dealer_partners dp where dp.id = r.dealer_partner_id;
    perform public._push_notify(r.profile_id, 'Fin de votre contrat', 'Votre contrat arrive à son terme le ' || to_char(r.end_date, 'DD/MM/YYYY') || ' : le véhicule vous sera transféré.', '/', 'cession-end:' || r.driver_id::text, true);
    if v_dealer_profile is not null then
      perform public._push_notify(v_dealer_profile, 'Fin de Durée à venir', r.plate_number || ' : la Durée prend fin le ' || to_char(r.end_date, 'DD/MM/YYYY') || '. Les papiers seront transférés au chauffeur.', '/espace/vehicules', 'cession-end-p:' || r.driver_id::text, true);
    end if;
    perform public._admin_alert('cession_end', 'normal', 'Fin de contrat chauffeur à 15 jours', r.plate_number || ' : fin le ' || to_char(r.end_date, 'DD/MM/YYYY') || ' — préparer le transfert des papiers.', '/admin/drivers/' || r.driver_id::text, r.driver_id);
  end loop;
  return v_n;
end;
$fn$;
revoke execute on function public._notify_cession_end() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'cession-end-notices') then perform cron.unschedule('cession-end-notices'); end if;
  perform cron.schedule('cession-end-notices', '30 5 * * *', 'select public._notify_cession_end()');
end
$do$;

-- Fins de Durée à venir côté partenaire (avec la date de l'avis écrit)
create or replace function public.dealer_my_contract_ends(p_dealer_id uuid default null)
returns table (vehicle_id uuid, plate_number text, brand text, model text, driver_name text, end_on date, notified_on date)
language sql stable security definer set search_path = public as $fn$
  select v.id, v.plate_number, v.brand, v.model, p.full_name, public._cession_end(d.id), n.notified_on
    from public.vehicles v
    join public.drivers d on d.current_vehicle_id = v.id and d.status = 'active' and d.application_type::text = 'cession'
    join public.profiles p on p.id = d.profile_id
    left join public.cession_notices n on n.driver_id = d.id and n.end_date = public._cession_end(d.id)
   where v.dealer_partner_id = public._dealer_resolve(p_dealer_id) and v.status <> 'archived'
   order by public._cession_end(d.id) nulls last;
$fn$;
revoke execute on function public.dealer_my_contract_ends(uuid) from public, anon;
grant execute on function public.dealer_my_contract_ends(uuid) to authenticated;

-- 6. Fonctions existantes retouchées : fin de contrat selon la durée du véhicule, durée affichée sur la fiche chauffeur, mise en ligne refusée si véhicule suspendu -----------

CREATE OR REPLACE FUNCTION public._cession_end(p_driver uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when s.d is null then null
         else (s.d + make_interval(months => public._contract_months(p_driver))
                   + make_interval(days => (select count(*)::int from public.driver_excused_days x where x.driver_id = p_driver)))::date end
    from (select coalesce((select cession_start_on from public.drivers where id = p_driver), public._tamassur_start(p_driver)) as d) s;
$function$;

CREATE OR REPLACE FUNCTION public.admin_driver_contract(p_driver_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_app text; v_cat text; v_manual date; v_start date;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select d.application_type::text, v.category::text, d.cession_start_on into v_app, v_cat, v_manual
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id where d.id = p_driver_id;
  if not found then raise exception 'Chauffeur inconnu'; end if;
  v_start := coalesce(v_manual, public._tamassur_start(p_driver_id));
  return jsonb_build_object(
    'application_type', v_app,
    'category', v_cat,
    'versement_fcfa', case when v_app = 'cession' then public._vehicle_versement(coalesce(v_cat, '')) else 0 end,
    'target_fcfa', public._floor_target(p_driver_id),
    'cotisation_fcfa', case when v_app = 'cession' then public._tamassur_amount(p_driver_id) else 0 end,
    'start_on', v_start,
    'manual_start', v_manual is not null,
    'months', public._contract_months(p_driver_id),
    'tamassur_months', public._tamassur_months(p_driver_id),
    'extension_days', (select count(*)::int from public.driver_excused_days x where x.driver_id = p_driver_id),
    'end_on', public._cession_end(p_driver_id),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'day', x.day, 'reason', x.reason, 'note', x.note,
        'closed', exists (select 1 from public.driver_floor_log l where l.driver_id = x.driver_id and l.day = x.day)
      ) order by x.day desc)
        from public.driver_excused_days x where x.driver_id = p_driver_id), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.driver_go_online(current_lng double precision, current_lat double precision)
 RETURNS drivers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result public.drivers;
  v_balance int;
  v_until timestamptz;
  v_status text;
  v_susp text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select status::text into v_status from public.drivers where profile_id = auth.uid();
  if v_status = 'suspended' then
    raise exception 'Compte suspendu. Si c''est pour une dette, réglez-la depuis votre portefeuille : la réactivation est automatique.'
      using errcode = 'P0001';
  end if;

  -- Véhicule suspendu (assurance ou visite technique expirée) : pas de mise en ligne tant que les papiers ne sont pas régularisés.
  select v.suspension_reason into v_susp
    from public.drivers d join public.vehicles v on v.id = d.current_vehicle_id
   where d.profile_id = auth.uid();
  if v_susp is not null then
    raise exception 'Véhicule suspendu : %. Contactez TamCar ou le propriétaire pour régulariser les papiers.', v_susp
      using errcode = 'P0001';
  end if;

  -- Blocage dette : à partir de −5 000 F, recharger avant de repasser en ligne.
  select balance_fcfa into v_balance from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus';
  if coalesce(v_balance, 0) <= -5000 then
    raise exception 'Dette de % F (seuil de 5 000 F atteint). Rechargez au moins % F pour repasser en ligne.',
      (-v_balance), (-v_balance - 4999)
      using errcode = 'P0001';
  end if;

  -- Véhicule réservé : pas de mise en ligne pendant la location ni son tampon.
  select max(vr.ends_at) into v_until
    from public.vehicle_rentals vr
    join public.drivers d on d.id = vr.driver_id
    join public.rental_rates rr on rr.category = vr.category
   where d.profile_id = auth.uid()
     and vr.status in ('confirmed', 'in_progress')
     and now() >= vr.starts_at - make_interval(mins => rr.block_before_min)
     and now() < vr.ends_at;
  if v_until is not null then
    raise exception 'Ton véhicule est réservé (location VIP) jusqu''à %. Tu repasseras en ligne ensuite.',
      to_char(v_until at time zone 'Africa/Porto-Novo', 'HH24"h"MI')
      using errcode = 'P0001';
  end if;

  update public.drivers
  set is_online = true,
      current_location = st_setsrid(st_makepoint(current_lng, current_lat), 4326)::geography,
      last_seen_at = now(),
      updated_at = now()
  where profile_id = auth.uid()
  returning * into result;

  if result is null then
    raise exception 'Not a driver';
  end if;
  return result;
end;
$function$;
