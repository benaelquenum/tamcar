-- ============================================================
-- TamPass — auto-réparation (ne plus dépendre uniquement de pg_cron)
--   + démarrage le jour même (créneaux encore à venir).
--
-- Problèmes corrigés :
--  1. Le pass démarrait toujours DEMAIN → le trajet du jour n'était
--     jamais généré. Désormais starts_on = aujourd'hui, et la génération
--     du jour ne retient que les créneaux ENCORE À VENIR (p_min_slot).
--  2. Génération + monitoring dépendaient de pg_cron seul. tampass_sync()
--     les rejoue à la demande (appelé à l'ouverture des pages TamPass) :
--     l'appli s'auto-répare même si le cron ne tourne pas.
--     (Le cron reste utile pour les notifications à l'heure précise.)
-- ============================================================

-- ------------------------------------------------------------
-- 1. generate_subscription_rides + paramètre p_min_slot
--    (pour aujourd'hui : ne génère que les créneaux >= heure courante)
-- ------------------------------------------------------------
create or replace function public.generate_subscription_rides(
  p_for_date date,
  p_min_slot time default '00:00'
)
returns int
language plpgsql security definer set search_path = public as $fn_gen$
declare
  v_sub record;
  v_count int := 0;
  v_used int;
  v_dirs text[];
  v_dir text;
  v_slot time;
begin
  for v_sub in
    select s.* from public.subscriptions s
    where s.status = 'active'
      and s.days_of_week is not null
      and extract(isodow from p_for_date)::int = any (s.days_of_week)
      and p_for_date >= s.starts_on
      and p_for_date <  s.expires_on
      and (s.paused_until is null or p_for_date > s.paused_until)
      and s.rides_remaining > 0
  loop
    v_used := 0;
    v_dirs := case when v_sub.slot_return is not null
                   then array['aller', 'retour']
                   else array['aller'] end;

    foreach v_dir in array v_dirs
    loop
      exit when v_sub.rides_remaining - v_used <= 0;
      v_slot := case v_dir when 'aller' then v_sub.slot_out else v_sub.slot_return end;

      -- Aujourd'hui : on saute les créneaux déjà passés
      if v_slot < p_min_slot then
        continue;
      end if;

      insert into public.subscription_rides
        (subscription_id, travel_date, direction, slot_time)
      values (v_sub.id, p_for_date, v_dir, v_slot)
      on conflict (subscription_id, travel_date, direction) do nothing;

      if found then
        update public.subscriptions
        set rides_remaining = rides_remaining - 1
        where id = v_sub.id;
        v_used := v_used + 1;
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  update public.subscriptions
  set status = 'expired'
  where status = 'active' and expires_on <= p_for_date;

  update public.subscriptions
  set status = 'active', paused_until = null
  where status = 'paused' and paused_until is not null and paused_until < p_for_date;

  return v_count;
end;
$fn_gen$;

revoke execute on function public.generate_subscription_rides(date, time) from public, authenticated, anon;
grant execute on function public.generate_subscription_rides(date, time) to service_role;

-- ------------------------------------------------------------
-- 2. tampass_sync() : rejoue génération (aujourd'hui + demain) +
--    création des rides + monitoring. Auto-réparation à la demande.
-- ------------------------------------------------------------
create or replace function public.tampass_sync()
returns jsonb
language plpgsql security definer set search_path = public as $fn_sync$
declare
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Africa/Porto-Novo')::date;
  v_tomorrow date := v_today + 1;
  v_min_slot time := (v_now at time zone 'Africa/Porto-Novo')::time;
  g1 int; g2 int; c1 int; c2 int;
begin
  g1 := public.generate_subscription_rides(v_today, v_min_slot);
  g2 := public.generate_subscription_rides(v_tomorrow, '00:00');
  c1 := public.tampass_create_rides(v_today);
  c2 := public.tampass_create_rides(v_tomorrow);
  perform public.tampass_monitor();
  return jsonb_build_object(
    'gen_today', g1, 'gen_tomorrow', g2,
    'rides_today', c1, 'rides_tomorrow', c2
  );
end;
$fn_sync$;

grant execute on function public.tampass_sync to authenticated;

-- ------------------------------------------------------------
-- 3. confirm_subscription_payment : démarrage AUJOURD'HUI + sync immédiat
-- ------------------------------------------------------------
create or replace function public.confirm_subscription_payment(p_subscription_id uuid)
returns public.subscriptions
language plpgsql security definer set search_path = public as $fn_confirm$
declare
  v_sub public.subscriptions;
  v_wallet public.wallets;
begin
  select * into v_sub from public.subscriptions
  where id = p_subscription_id and client_id = auth.uid()
  for update;
  if not found then raise exception 'Abonnement introuvable'; end if;
  if v_sub.status <> 'awaiting_payment' then
    raise exception 'Cet abonnement n''attend pas de paiement';
  end if;
  if v_sub.payment_deadline < now() then
    raise exception 'Délai de confirmation dépassé — relancez une recherche';
  end if;

  select * into v_wallet from public.wallets
  where profile_id = auth.uid() and kind = 'tamcar_credit'
  for update;
  if not found or v_wallet.balance_fcfa < v_sub.total_price_fcfa then
    raise exception 'Solde TamCar Crédit insuffisant (requis : % FCFA). Rechargez votre wallet.',
      v_sub.total_price_fcfa;
  end if;

  update public.wallets
  set balance_fcfa = balance_fcfa - v_sub.total_price_fcfa, updated_at = now()
  where id = v_wallet.id;

  insert into public.wallet_transactions
    (wallet_id, type, amount_fcfa, provider, status, meta)
  values
    (v_wallet.id, 'payment', -v_sub.total_price_fcfa, 'internal', 'success',
     jsonb_build_object('subscription_id', v_sub.id, 'kind', 'tampass'));

  update public.subscriptions
  set status = 'active',
      starts_on = greatest(starts_on, current_date),
      expires_on = greatest(starts_on, current_date) + (expires_on - starts_on)
  where id = v_sub.id
  returning * into v_sub;

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'purchased', jsonb_build_object('total_fcfa', v_sub.total_price_fcfa));

  perform public._push_notify(
    (select d.profile_id from public.drivers d where d.id = v_sub.preferred_driver_id),
    'Abonné TamPass confirmé !',
    'Votre abonné a payé — vos trajets démarrent dès aujourd''hui. Planning dans TamPass.',
    '/tampass', 'tampass-confirmed', true
  );

  -- Génère immédiatement les trajets (aujourd'hui + demain) sans attendre le cron
  perform public.tampass_sync();

  return v_sub;
end;
$fn_confirm$;

grant execute on function public.confirm_subscription_payment to authenticated;
