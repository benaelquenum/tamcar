-- ============================================================
-- TamCar — Retraits chauffeur : virement automatique FeexPay (2026-10-11)
--
--   Le circuit existant (request_driver_payout → réservation du solde → confirm / fail avec recrédit) est conservé. On y ajoute :
--   • l'envoi automatique via l'API Payout de FeexPay (Edge Functions feexpay-payout et feexpay-payout-check), derrière le réglage
--     payouts_auto (0 = tout à la main, comme aujourd'hui) ;
--   • des règles de VALIDATION : un retrait automatique ne part que s'il est ≤ payout_auto_max_fcfa (100 000 F), si le chauffeur n'a
--     pas déjà reçu payout_auto_daily_cap_fcfa (200 000 F) aujourd'hui, et si le numéro a déjà reçu un retrait payé (payout_hold_new_number) ;
--     sinon le retrait reste « en attente » avec un motif et l'équipe le valide d'un clic ;
--   • des garde-fous : un seul envoi possible par retrait (verrou), jamais de renvoi ni de recrédit automatique en cas de doute,
--     les boutons « Payé » et « Refuser » refusés pour un retrait déjà parti chez FeexPay.
--   Frais FeexPay du retrait (1 % annoncé) : à la charge de TamCar, pas du chauffeur (décision du 2026-10-11).
-- ============================================================

-- Traces : un événement « payout » dans payment_events
alter table public.payment_events drop constraint if exists payment_events_source_check;
alter table public.payment_events add constraint payment_events_source_check
  check (source = any (array['webhook'::text, 'verify'::text, 'pay'::text, 'payout'::text]));

-- Colonnes de suivi du virement automatique (fedapay_payout_id garde son nom historique : il contient l'identifiant FeexPay)
alter table public.driver_payouts add column if not exists hold_reason text;
alter table public.driver_payouts add column if not exists auto boolean not null default false;
alter table public.driver_payouts add column if not exists attempts int not null default 0;
alter table public.driver_payouts add column if not exists last_error text;
alter table public.driver_payouts add column if not exists sent_at timestamptz;

insert into public.program_rules (key, value, label) values
  ('payout_auto_max_fcfa',       100000, 'Retraits chauffeur : montant maximal envoyé automatiquement (au-delà : validation de l''équipe)'),
  ('payout_auto_daily_cap_fcfa', 200000, 'Retraits chauffeur : total maximal envoyé automatiquement par chauffeur et par jour (au-delà : validation)'),
  ('payout_hold_new_number',     1,      'Retraits chauffeur : 1 = le premier retrait vers un numéro Mobile Money est validé par l''équipe')
on conflict (key) do update set label = excluded.label;

create or replace function public.admin_set_program_rule(p_key text, p_value int)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_value is null or p_value < 0 then raise exception 'Valeur invalide'; end if;
  if (p_key like 'share_%' or p_key in ('surplus_cede_pct', 'tamassur_fund_pct')) and p_value > 100 then
    raise exception 'Un pourcentage ne peut pas dépasser 100.';
  end if;
  if p_key like 'tamassur_months_%' then
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
revoke execute on function public.admin_set_program_rule(text, int) from public, anon;
grant execute on function public.admin_set_program_rule(text, int) to authenticated;

-- Règle de validation : renvoie le motif qui empêche l'envoi automatique, ou null si le retrait peut partir seul.
create or replace function public._payout_hold_reason(p_payout_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $fn$
declare
  v public.driver_payouts;
  v_max int := public._program_rule('payout_auto_max_fcfa');
  v_cap int := public._program_rule('payout_auto_daily_cap_fcfa');
  v_today bigint;
  v_digits text;
  v_known boolean;
begin
  select * into v from public.driver_payouts where id = p_payout_id;
  if v.id is null then return 'Retrait introuvable'; end if;
  if v.provider::text not in ('mtn', 'moov') then return 'Opérateur non géré par le virement automatique'; end if;
  if v_max > 0 and v.amount_fcfa > v_max then
    return 'Montant supérieur à ' || v_max || ' F : validation de l''équipe requise';
  end if;
  select coalesce(sum(p2.amount_fcfa), 0) into v_today
    from public.driver_payouts p2
   where p2.driver_id = v.driver_id and p2.id <> v.id and p2.status in ('processing', 'paid')
     and (p2.created_at at time zone 'Africa/Porto-Novo')::date = (now() at time zone 'Africa/Porto-Novo')::date;
  if v_cap > 0 and v_today + v.amount_fcfa > v_cap then
    return 'Plafond de ' || v_cap || ' F par jour dépassé : validation de l''équipe requise';
  end if;
  if public._program_rule('payout_hold_new_number') = 1 then
    v_digits := right(regexp_replace(coalesce(v.msisdn, ''), '\D', '', 'g'), 8);
    select exists (
      select 1 from public.driver_payouts p3
       where p3.driver_id = v.driver_id and p3.id <> v.id and p3.status = 'paid'
         and right(regexp_replace(coalesce(p3.msisdn, ''), '\D', '', 'g'), 8) = v_digits
    ) into v_known;
    if not v_known then return 'Premier retrait vers ce numéro : vérification de l''équipe requise'; end if;
  end if;
  return null;
end;
$fn$;
revoke execute on function public._payout_hold_reason(uuid) from public, anon, authenticated;

-- Prise du verrou d'envoi : « pending » → « processing » en une seule opération (un seul appel peut envoyer).
create or replace function public.feexpay_payout_prepare(p_payout_id uuid, p_force boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v public.driver_payouts;
  v_reason text;
  adm record;
begin
  select * into v from public.driver_payouts where id = p_payout_id for update;
  if v.id is null then return jsonb_build_object('action', 'none', 'status', 'missing'); end if;
  if v.status <> 'pending' then
    return jsonb_build_object('action', 'none', 'status', v.status, 'ref', v.fedapay_payout_id);
  end if;

  if not coalesce(p_force, false) then
    v_reason := public._payout_hold_reason(p_payout_id);
    if v_reason is not null then
      update public.driver_payouts set hold_reason = v_reason, updated_at = now() where id = p_payout_id;
      if v.hold_reason is distinct from v_reason then
        for adm in select id from public.profiles where role::text = 'admin' loop
          perform public._push_notify(adm.id, 'Retrait à valider', v.amount_fcfa || ' F · ' || upper(v.provider::text) || ' · ' || v_reason,
                                      '/admin/retraits', 'payout-hold:' || p_payout_id::text, true);
        end loop;
      end if;
      return jsonb_build_object('action', 'hold', 'status', 'pending', 'reason', v_reason);
    end if;
  end if;

  update public.driver_payouts
     set status = 'processing', hold_reason = null, auto = true, attempts = attempts + 1, sent_at = now(),
         last_error = null, updated_at = now()
   where id = p_payout_id;
  return jsonb_build_object('action', 'send', 'status', 'processing', 'amount', v.amount_fcfa, 'provider', v.provider::text,
                            'msisdn', v.msisdn, 'driver', v.profile_id);
end;
$fn$;

-- Identifiant FeexPay du retrait parti
create or replace function public.feexpay_payout_set_ref(p_payout_id uuid, p_ref text)
returns void
language sql security definer set search_path = public as $fn$
  update public.driver_payouts set fedapay_payout_id = p_ref, updated_at = now()
   where id = p_payout_id and status = 'processing' and fedapay_payout_id is null;
$fn$;

-- Refus définitif de FeexPay (argent non parti) : le retrait revient « en attente » avec le motif, l'équipe décide.
create or replace function public.feexpay_payout_release(p_payout_id uuid, p_error text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v public.driver_payouts; adm record;
begin
  update public.driver_payouts
     set status = 'pending', hold_reason = 'Envoi automatique impossible : ' || left(coalesce(nullif(trim(p_error), ''), 'erreur inconnue'), 200),
         last_error = left(coalesce(p_error, ''), 300), updated_at = now()
   where id = p_payout_id and status = 'processing' and fedapay_payout_id is null
   returning * into v;
  if v.id is not null then
    for adm in select id from public.profiles where role::text = 'admin' loop
      perform public._push_notify(adm.id, 'Retrait à traiter à la main', v.amount_fcfa || ' F · ' || upper(v.provider::text) || ' · ' || v.hold_reason,
                                  '/admin/retraits', 'payout-release:' || p_payout_id::text, true);
    end loop;
  end if;
end;
$fn$;

-- Signalement à l'équipe d'un retrait dont l'issue est incertaine (une seule notification par motif)
create or replace function public.feexpay_payout_hold(p_payout_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v public.driver_payouts; adm record;
begin
  select * into v from public.driver_payouts where id = p_payout_id for update;
  if v.id is null or v.status not in ('pending', 'processing') then return; end if;
  if v.hold_reason is not distinct from p_reason then return; end if;
  update public.driver_payouts set hold_reason = p_reason, updated_at = now() where id = p_payout_id;
  for adm in select id from public.profiles where role::text = 'admin' loop
    perform public._push_notify(adm.id, 'Retrait à vérifier', v.amount_fcfa || ' F · ' || upper(v.provider::text) || ' · ' || p_reason,
                                '/admin/retraits', 'payout-check:' || p_payout_id::text, true);
  end loop;
end;
$fn$;

-- Issue définitive d'un retrait (relue chez FeexPay) : payé → débit définitif ; échoué → chauffeur recrédité. Idempotent.
create or replace function public.feexpay_payout_finalize(p_payout_id uuid, p_status text, p_ref text default null, p_reason text default null)
returns text
language plpgsql security definer set search_path = public as $fn$
declare v public.driver_payouts; adm record;
begin
  select * into v from public.driver_payouts where id = p_payout_id for update;
  if v.id is null then return 'missing'; end if;

  if p_status = 'success' then
    if v.status = 'paid' then return 'paid'; end if;
    if v.status = 'failed' then
      -- FeexPay a payé alors que le chauffeur avait déjà été recrédité : à régulariser par l'équipe
      update public.driver_payouts set last_error = 'Payé par FeexPay après recrédit du chauffeur', updated_at = now() where id = v.id;
      for adm in select id from public.profiles where role::text = 'admin' loop
        perform public._push_notify(adm.id, 'Retrait payé ET recrédité',
          'Le retrait de ' || v.amount_fcfa || ' F est parti chez FeexPay mais le chauffeur avait déjà été recrédité : à régulariser.',
          '/admin/retraits', 'payout-conflict:' || v.id::text, true);
      end loop;
      return 'conflict';
    end if;
    perform public.confirm_driver_payout(p_payout_id, p_ref);
    update public.driver_payouts set processed_at = now(), hold_reason = null, updated_at = now() where id = p_payout_id;
    perform public._push_notify(v.profile_id, 'Retrait envoyé', 'Ton retrait de ' || v.amount_fcfa || ' F a été envoyé sur ton Mobile Money.',
                                '/wallet', 'payout-paid:' || p_payout_id::text, true);
    return 'paid';
  end if;

  if p_status = 'failed' then
    if v.status in ('paid', 'failed') then return v.status; end if;
    perform public.fail_driver_payout(p_payout_id, coalesce(nullif(trim(p_reason), ''), 'Refusé par l''opérateur'));
    update public.driver_payouts set processed_at = now(), last_error = left(coalesce(p_reason, ''), 300), hold_reason = null, updated_at = now()
     where id = p_payout_id;
    return 'failed';
  end if;

  return v.status;
end;
$fn$;

-- Retraits à relire chez FeexPay (ceux qui sont partis depuis plus de 15 secondes)
create or replace function public.feexpay_payouts_to_check()
returns table (id uuid, ref text, age_s int)
language sql stable security definer set search_path = public as $fn$
  select p.id, p.fedapay_payout_id, extract(epoch from (now() - coalesce(p.sent_at, p.updated_at)))::int
    from public.driver_payouts p
   where p.status = 'processing' and coalesce(p.sent_at, p.updated_at) < now() - interval '15 seconds'
   order by p.created_at
   limit 100;
$fn$;

revoke execute on function public.feexpay_payout_prepare(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.feexpay_payout_set_ref(uuid, text) from public, anon, authenticated;
revoke execute on function public.feexpay_payout_release(uuid, text) from public, anon, authenticated;
revoke execute on function public.feexpay_payout_hold(uuid, text) from public, anon, authenticated;
revoke execute on function public.feexpay_payout_finalize(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.feexpay_payouts_to_check() from public, anon, authenticated;
grant execute on function public.feexpay_payout_prepare(uuid, boolean) to service_role;
grant execute on function public.feexpay_payout_set_ref(uuid, text) to service_role;
grant execute on function public.feexpay_payout_release(uuid, text) to service_role;
grant execute on function public.feexpay_payout_hold(uuid, text) to service_role;
grant execute on function public.feexpay_payout_finalize(uuid, text, text, text) to service_role;
grant execute on function public.feexpay_payouts_to_check() to service_role;

-- Écran de l'équipe : nouveaux champs (la signature de retour change : on supprime puis on recrée)
drop function if exists public.admin_driver_payouts(text);
create function public.admin_driver_payouts(p_scope text default 'open')
returns table (
  id uuid, created_at timestamptz, profile_id uuid, full_name text, phone text, msisdn text, provider mobile_money_provider,
  amount_fcfa integer, status text, failure_reason text, reference text, processed_at timestamptz, balance_fcfa integer,
  hold_reason text, auto boolean, provider_ref text, last_error text, sent_at timestamptz
)
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;
  return query
  select dp.id, dp.created_at, dp.profile_id, p.full_name, p.phone, dp.msisdn, dp.provider, dp.amount_fcfa, dp.status,
         dp.failure_reason, dp.reference, dp.processed_at,
         (select w.balance_fcfa from public.wallets w where w.profile_id = dp.profile_id and w.kind = 'tamcar_revenus'),
         dp.hold_reason, dp.auto, dp.fedapay_payout_id, dp.last_error, dp.sent_at
    from public.driver_payouts dp
    join public.profiles p on p.id = dp.profile_id
   where case when p_scope = 'open' then dp.status in ('pending', 'processing') else dp.status in ('paid', 'failed') end
   order by dp.created_at desc
   limit 200;
end;
$fn$;
revoke execute on function public.admin_driver_payouts(text) from public, anon;
grant execute on function public.admin_driver_payouts(text) to authenticated;

-- « Payé » et « Refuser » refusés pour un retrait déjà parti chez FeexPay (sinon : double paiement ou recrédit à tort)
create or replace function public.admin_mark_payout_paid(p_payout_id uuid, p_reference text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v public.driver_payouts;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;
  select * into v from public.driver_payouts where id = p_payout_id for update;
  if v.id is null then raise exception 'Retrait introuvable.'; end if;
  if v.status not in ('pending', 'processing') then raise exception 'Ce retrait est déjà clos.'; end if;
  if v.status = 'processing' and v.fedapay_payout_id is not null then
    raise exception 'Ce retrait est déjà parti chez FeexPay : utilisez « Vérifier » pour connaître son issue.';
  end if;
  perform public.confirm_driver_payout(p_payout_id, null);
  update public.driver_payouts
     set reference = nullif(trim(coalesce(p_reference, '')), ''), processed_by = auth.uid(), processed_at = now(), hold_reason = null
   where id = p_payout_id;
  perform public._push_notify(
    v.profile_id, 'Retrait envoyé',
    'Ton retrait de ' || v.amount_fcfa || ' F a été envoyé sur ton Mobile Money.',
    '/wallet', 'payout-paid:' || p_payout_id::text, true
  );
end;
$fn$;

create or replace function public.admin_reject_payout(p_payout_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v public.driver_payouts;
begin
  if not public.is_admin() then raise exception 'Réservé à l''équipe TamCar.'; end if;
  select * into v from public.driver_payouts where id = p_payout_id for update;
  if v.id is null then raise exception 'Retrait introuvable.'; end if;
  if v.status not in ('pending', 'processing') then raise exception 'Ce retrait est déjà clos.'; end if;
  if v.status = 'processing' and v.fedapay_payout_id is not null then
    raise exception 'Ce retrait est déjà parti chez FeexPay : utilisez « Vérifier » pour connaître son issue.';
  end if;
  perform public.fail_driver_payout(p_payout_id, coalesce(nullif(trim(p_reason), ''), 'Refusé par TamCar'));
  update public.driver_payouts set processed_by = auth.uid(), processed_at = now(), hold_reason = null where id = p_payout_id;
end;
$fn$;

-- Réglages visibles par le chauffeur (texte de l'écran de retrait)
create or replace function public.payouts_config()
returns table (auto boolean, max_fcfa int)
language sql stable security definer set search_path = public as $fn$
  select public._program_rule('payouts_auto') = 1, public._program_rule('payout_auto_max_fcfa');
$fn$;
revoke execute on function public.payouts_config() from public, anon;
grant execute on function public.payouts_config() to authenticated;

-- Demande de retrait : l'équipe n'est plus prévenue de chaque demande quand le virement est automatique
-- (feexpay_payout_prepare la prévient seulement des retraits qui attendent sa validation).
create or replace function public.request_driver_payout(p_amount_fcfa integer, p_provider mobile_money_provider, p_msisdn text default null)
returns driver_payouts
language plpgsql security definer set search_path = public as $fn$
declare
  v_driver record;
  v_wallet record;
  v_msisdn text;
  v_tx public.wallet_transactions;
  v_payout public.driver_payouts;
  adm record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_provider not in ('mtn', 'moov') then raise exception 'Opérateur invalide (mtn / moov)'; end if;
  if p_amount_fcfa < 500 or p_amount_fcfa > 500000 then
    raise exception 'Montant invalide (500 - 500 000 FCFA)';
  end if;

  select d.id, d.profile_id, p.phone into v_driver
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where d.profile_id = auth.uid() and d.status = 'active';
  if v_driver.id is null then raise exception 'Compte chauffeur introuvable ou inactif'; end if;

  v_msisdn := coalesce(nullif(trim(p_msisdn), ''), v_driver.phone);
  if v_msisdn is null or length(regexp_replace(v_msisdn, '\D', '', 'g')) < 8 then
    raise exception 'Numéro Mobile Money invalide';
  end if;

  if exists (select 1 from public.driver_payouts
             where driver_id = v_driver.id and status in ('pending', 'processing')) then
    raise exception 'Un retrait est déjà en cours de traitement';
  end if;

  select id, balance_fcfa into v_wallet from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus'
   for update;
  if v_wallet.id is null then raise exception 'Wallet TamCar Revenus introuvable'; end if;
  if v_wallet.balance_fcfa < p_amount_fcfa then
    raise exception 'Solde insuffisant (% F disponibles)', v_wallet.balance_fcfa;
  end if;

  update public.wallets
     set balance_fcfa = balance_fcfa - p_amount_fcfa, updated_at = now()
   where id = v_wallet.id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
  values (v_wallet.id, 'withdrawal', -p_amount_fcfa, p_provider, 'pending',
          jsonb_build_object('kind', 'payout'))
  returning * into v_tx;

  insert into public.driver_payouts (driver_id, profile_id, amount_fcfa, provider, msisdn, wallet_tx_id)
  values (v_driver.id, v_driver.profile_id, p_amount_fcfa, p_provider, v_msisdn, v_tx.id)
  returning * into v_payout;

  if public._program_rule('payouts_auto') <> 1 then
    for adm in select id from public.profiles where role::text = 'admin' loop
      perform public._push_notify(
        adm.id, 'Demande de retrait',
        p_amount_fcfa || ' F · ' || upper(p_provider::text) || ' ' || v_msisdn,
        '/admin/retraits', 'payout-req:' || v_payout.id::text, true
      );
    end loop;
  end if;

  return v_payout;
end;
$fn$;

-- Vérification planifiée : toutes les 2 minutes, seulement s'il y a un retrait en cours (même mécanisme que la sauvegarde quotidienne)
insert into public._push_settings (key, value)
values ('payout_check_url', 'https://psoukliivojfjltkwtwd.supabase.co/functions/v1/feexpay-payout-check')
on conflict (key) do update set value = excluded.value;

create or replace function public._run_payout_check()
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_url text; v_key text;
begin
  if not exists (select 1 from public.driver_payouts where status = 'processing') then return; end if;
  select value into v_url from public._push_settings where key = 'payout_check_url';
  select value into v_key from public._push_settings where key = 'service_role_key';
  if v_url is null or v_url = '' or v_key is null or v_key = '' then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 30000
  );
end;
$fn$;
revoke execute on function public._run_payout_check() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'payout-check') then perform cron.unschedule('payout-check'); end if;
  perform cron.schedule('payout-check', '*/2 * * * *', 'select public._run_payout_check()');
end
$do$;
