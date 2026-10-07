-- ============================================================
-- TamCar — Retrait de l'épargne TamAssur : nouvelles règles (2026-10-07)
--
--   1. Le retrait ne peut être DEMANDÉ qu'à partir de 2 ans après le premier prélèvement
--      (plus de seuil en francs), et seulement si le compte est à jour (aucune dette Revenus).
--   2. Le retard est décompté en jours (dimanches exclus) depuis le jour où le solde Revenus est
--      passé sous zéro ; le chauffeur doit le rattraper avant de pouvoir demander son retrait.
--   3. La demande ne déclenche AUCUN virement : elle crée une ligne « en attente », alerte les
--      administrateurs (notification + badge) qui traitent à la main, sous 60 jours au plus.
-- ============================================================

-- A. Suivi du retard : une ligne tant que le solde Revenus du chauffeur est négatif -------------
--    (table à part : une colonne de `drivers` pourrait être effacée par le chauffeur lui-même)
create table if not exists public.driver_arrears (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  since timestamptz not null default now()
);

alter table public.driver_arrears enable row level security;
drop policy if exists driver_arrears_select on public.driver_arrears;
create policy driver_arrears_select on public.driver_arrears
  for select using (
    driver_id in (select id from public.drivers where profile_id = (select auth.uid()))
    or (select public.is_admin())
  );
revoke all on public.driver_arrears from anon, authenticated;
grant select on public.driver_arrears to authenticated;

create or replace function public._wallet_arrears_track()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_driver uuid;
begin
  select id into v_driver from public.drivers where profile_id = new.profile_id;
  if v_driver is null then return new; end if;
  if new.balance_fcfa < 0 then
    insert into public.driver_arrears (driver_id) values (v_driver) on conflict (driver_id) do nothing;
  else
    delete from public.driver_arrears where driver_id = v_driver;
  end if;
  return new;
end;
$fn$;
revoke execute on function public._wallet_arrears_track() from public, anon, authenticated;

drop trigger if exists wallets_arrears_track on public.wallets;
create trigger wallets_arrears_track
  after insert or update of balance_fcfa on public.wallets
  for each row
  when (new.kind::text = 'tamcar_revenus')
  execute function public._wallet_arrears_track();

-- Chauffeurs déjà endettés : le décompte part d'aujourd'hui
insert into public.driver_arrears (driver_id)
select d.id from public.drivers d
  join public.wallets w on w.profile_id = d.profile_id and w.kind::text = 'tamcar_revenus'
 where w.balance_fcfa < 0
on conflict (driver_id) do nothing;

-- B. Outils internes -------------------------------------------------------------------------
-- Démarrage = premier prélèvement TamAssur réellement effectué
create or replace function public._tamassur_start(p_driver uuid)
returns date
language sql stable security definer set search_path = public as $fn$
  select min(period)::date from public.driver_insurance_charges
   where driver_id = p_driver and status = 'paid';
$fn$;
revoke execute on function public._tamassur_start(uuid) from public, anon, authenticated;

-- Jours de retard : jours écoulés depuis le jour où la dette est apparue, dimanches exclus
create or replace function public._days_late(p_since timestamptz)
returns int
language sql stable set search_path = public as $fn$
  select case when p_since is null then 0 else (
    select count(*)::int
      from generate_series(
             ((p_since at time zone 'Africa/Porto-Novo')::date + 1)::timestamp,
             (now() at time zone 'Africa/Porto-Novo')::date::timestamp,
             interval '1 day') g
     where extract(dow from g) <> 0
  ) end;
$fn$;
revoke execute on function public._days_late(timestamptz) from public, anon, authenticated;

-- C. Délai de règlement : 60 jours -----------------------------------------------------------
alter table public.tamassur_withdrawals alter column due_at set default (now() + interval '60 days');

-- D. État du retrait pour le chauffeur connecté ------------------------------------------------
create or replace function public.my_tamassur_withdrawal_status()
returns table (
  start_date date,
  eligible_on date,
  epargne_fcfa int,
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
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_epargne int;
  v_rev int;
  v_since timestamptz;
  v_reason text;
begin
  if v_profile is null then return; end if;
  select id into v_driver from public.drivers where profile_id = v_profile;
  if v_driver is null then return; end if;

  v_start := public._tamassur_start(v_driver);
  v_elig := (v_start + interval '2 years')::date;
  select coalesce(max(balance_fcfa), 0) into v_epargne from public.wallets where profile_id = v_profile and kind::text = 'tamcar_epargne';
  select coalesce(max(balance_fcfa), 0) into v_rev from public.wallets where profile_id = v_profile and kind::text = 'tamcar_revenus';
  select a.since into v_since from public.driver_arrears a where a.driver_id = v_driver;

  v_reason := case
    when exists (select 1 from public.tamassur_withdrawals t where t.driver_id = v_driver and t.status = 'pending') then 'pending'
    when v_start is null then 'not_started'
    when v_today < v_elig then 'too_early'
    when v_rev < 0 then 'in_arrears'
    when v_epargne <= 0 then 'empty'
    else 'ok' end;

  return query select v_start, v_elig, v_epargne, greatest(0, -v_rev),
                      case when v_rev < 0 then public._days_late(v_since) else 0 end,
                      v_reason = 'ok', v_reason;
end;
$fn$;
revoke execute on function public.my_tamassur_withdrawal_status() from public, anon;
grant execute on function public.my_tamassur_withdrawal_status() to authenticated;

-- E. Demande de retrait : 2 ans + compte à jour, alerte admin, 60 jours -------------------------
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
    raise exception 'Le retrait s''ouvre 2 ans apres le premier prelevement TamAssur.';
  elsif v_st.reason = 'too_early' then
    raise exception 'Retrait possible a partir du % (2 ans apres le premier prelevement).', to_char(v_st.eligible_on, 'DD/MM/YYYY');
  elsif v_st.reason = 'in_arrears' then
    raise exception 'Compte a regulariser : % jour(s) de retard, % F a regler avant de demander le retrait.', v_st.late_days, v_st.debt_fcfa;
  elsif v_st.reason = 'empty' then
    raise exception 'Aucune epargne a retirer.';
  end if;

  select id, balance_fcfa into w_id, v_bal from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_epargne'
   for update;
  if w_id is null then raise exception 'Poche Epargne introuvable'; end if;

  -- deuxième lecture sous verrou : deux demandes simultanées ne passent pas toutes les deux
  if exists (select 1 from public.tamassur_withdrawals where driver_id = v_driver_id and status = 'pending') then
    raise exception 'Une demande de retrait est deja en cours.';
  end if;

  v_amount := least(greatest(coalesce(p_amount, v_bal), 1), v_bal);  -- borné [1, solde]
  if v_amount < 1 then raise exception 'Aucune epargne a retirer.'; end if;

  update public.wallets
     set balance_fcfa = balance_fcfa - v_amount, updated_at = now()
   where id = w_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status)
  values (w_id, 'tamassur_withdrawal', v_amount, 'internal', 'success');

  insert into public.tamassur_withdrawals (driver_id, amount_fcfa, due_at)
  values (v_driver_id, v_amount, now() + interval '60 days')
  returning * into rec;

  -- Aucun virement automatique : les administrateurs sont prévenus et traitent à la main.
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

-- F. Paiement par l'administrateur : le chauffeur est prévenu -------------------------------------
create or replace function public.admin_mark_tamassur_paid(p_id uuid, p_method text default 'cash')
returns public.tamassur_withdrawals
language plpgsql security definer set search_path = public as $fn$
declare
  rec public.tamassur_withdrawals;
  v_profile uuid;
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  update public.tamassur_withdrawals
     set status = 'paid', method = p_method, paid_at = now()
   where id = p_id and status = 'pending'
   returning * into rec;
  if rec.id is null then raise exception 'Demande introuvable ou deja traitee'; end if;

  select profile_id into v_profile from public.drivers where id = rec.driver_id;
  if v_profile is not null then
    perform public._push_notify(
      v_profile, 'Retrait TamAssur payé',
      'Votre retrait de ' || rec.amount_fcfa || ' F a été réglé ('
        || case when p_method = 'mobile_money' then 'Mobile Money' else 'espèces' end || ').',
      '/wallet', 'tamassur-paid:' || rec.id::text, false
    );
  end if;
  return rec;
end;
$fn$;
revoke execute on function public.admin_mark_tamassur_paid(uuid, text) from public, anon;
grant execute on function public.admin_mark_tamassur_paid(uuid, text) to authenticated;

-- G. Badge « Retraits TamAssur » dans la barre latérale admin ---------------------------------
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
    'tamassur',        (select count(*) from public.tamassur_withdrawals where status = 'pending'),
    'disputes',        0
  );
end;
$fn$;
revoke execute on function public.admin_badge_counts() from public, anon;
grant execute on function public.admin_badge_counts() to authenticated;
