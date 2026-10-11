-- ============================================================
-- TamCar — Paiement Mobile Money via FeexPay (2026-10-11)
--
--   FeexPay remplace FedaPay comme agrégateur. Différence de fond : pas de fenêtre de paiement dans le navigateur. Le serveur
--   (fonction feexpay-pay) demande le paiement à FeexPay avec la clé privée ; le client reçoit une demande de confirmation sur
--   son téléphone (code PIN Mobile Money) ; le résultat arrive par webhook et par vérification directe (feexpay-verify).
--
--   Les fonctions SQL de crédit sont inchangées et réutilisées (le suffixe « fedapay » de leur nom est historique, elles ne
--   parlent à aucun fournisseur) : initiate_fedapay_topup / initiate_fedapay_debt créent la transaction « en attente » et sa
--   référence FDP-…, apply_fedapay_success / apply_fedapay_declined la créditent ou la refusent (verrou, montant vérifié).
--
--   Ajouts : réglage « payments_provider » (1 = paiement réel FeexPay, 0 = simulation si le mode TEST est actif), RPC
--   payments_config() lue par les applications, « prise » d'une transaction avant l'appel à FeexPay (jamais deux demandes de
--   paiement pour la même référence), source « pay » dans les traces de paiement.
-- ============================================================

-- A. Traces : la fonction de demande de paiement laisse aussi une ligne ----------------------------------------------
alter table public.payment_events drop constraint if exists payment_events_source_check;
alter table public.payment_events
  add constraint payment_events_source_check check (source in ('webhook', 'verify', 'pay'));

-- B. Réglage : fournisseur de paiement actif ---------------------------------------------------------------------------
insert into public.program_rules (key, value, label) values
  ('payments_provider', 0,
   'Paiement Mobile Money réel FeexPay (1 = actif ; 0 = simulation, seulement tant que le mode TEST est à 1). À passer à 1 une fois les clés FeexPay posées.')
on conflict (key) do nothing;

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

-- C. Lecture par les applications ---------------------------------------------------------------------------------------
create or replace function public.payments_config()
returns table (feexpay boolean, test_mode boolean)
language sql stable security definer set search_path = public as $fn$
  select public._program_rule('payments_provider') = 1, public._payments_test_mode();
$fn$;
revoke execute on function public.payments_config() from public, anon;
grant execute on function public.payments_config() to authenticated;

-- D. « Prise » de la transaction avant l'appel à FeexPay --------------------------------------------------------------
-- Une seule demande de paiement par référence : le premier appel prend la transaction (marqueur SUBMITTING), les suivants
-- (double clic, deux onglets) voient qu'elle est déjà prise et ne redemandent rien au client.
create or replace function public.feexpay_claim_payin(p_reference text)
returns boolean
language plpgsql security definer set search_path = public as $fn$
begin
  update public.wallet_transactions
     set fedapay_transaction_id = 'SUBMITTING'
   where fedapay_reference = p_reference and status = 'pending' and fedapay_transaction_id is null;
  return found;
end;
$fn$;
revoke execute on function public.feexpay_claim_payin(text) from public, anon, authenticated;
grant execute on function public.feexpay_claim_payin(text) to service_role;

-- Enregistre l'identifiant FeexPay, l'opérateur et la fin du numéro (jamais le numéro entier)
create or replace function public.feexpay_record_payin(p_reference text, p_provider_ref text, p_network text, p_phone_last4 text)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  update public.wallet_transactions
     set fedapay_transaction_id = coalesce(nullif(p_provider_ref, ''), fedapay_transaction_id),
         meta = coalesce(meta, '{}'::jsonb)
                || jsonb_build_object('provider', 'feexpay', 'network', p_network, 'phone_last4', p_phone_last4)
   where fedapay_reference = p_reference;
end;
$fn$;
revoke execute on function public.feexpay_record_payin(text, text, text, text) from public, anon, authenticated;
grant execute on function public.feexpay_record_payin(text, text, text, text) to service_role;
