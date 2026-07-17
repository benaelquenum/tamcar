-- ============================================================
-- Activation du barème d'annulation + solde négatif autorisé
-- + arrondi au 50 F près (2026-07-17)
--
-- Barème (mémoire projet section 8, split 50/50 chauffeur / plateforme) :
--   - Avant matching / rétractation ≤ 30 s → gratuit
--   - Chauffeur en route → 300 F
--   - Chauffeur arrivé → 500 F
--   - Course commencée (in_progress) → 50% prix estimé
--   - Bonus : chauffeur encore occupé sur autre course → gratuit
--
-- Modifs :
--   1. Retire la contrainte balance_fcfa >= 0 (solde négatif autorisé)
--   2. Fonction round_to_50(v) pour arrondir au multiple de 50 supérieur
--   3. RPC cancel_ride_by_client v2 : applique le débit + split + transactions
--   4. RPC cancellation_fee_preview(ride_id) : renvoie le montant estimé
--      pour affichage côté client avant confirmation
-- ============================================================

-- 1. Autoriser le solde négatif
alter table public.wallets drop constraint if exists wallets_balance_fcfa_check;

-- 2. Fonction utilitaire d'arrondi au 50 F
create or replace function public.round_to_50(v int)
returns int language sql immutable as $$
  select ((v + 25) / 50) * 50;
$$;

comment on function public.round_to_50 is
  'Arrondit au multiple de 50 le plus proche. Ex 275 → 300, 320 → 300, 350 → 350.';

-- 3. Extend wallet_tx_type pour la pénalité annulation (si pas déjà présent)
alter type wallet_tx_type add value if not exists 'cancellation_fee';
alter type wallet_tx_type add value if not exists 'cancellation_reimbursement';

-- 4. cancellation_fee_preview : appelé par le client avant confirmation
-- Retourne le montant qui sera débité et l'explication texte à afficher.
create or replace function public.cancellation_fee_preview(p_ride_id uuid)
returns table (
  fee_fcfa int,
  reason_code text,
  driver_share_fcfa int,
  platform_share_fcfa int,
  driver_still_busy_elsewhere boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rides;
  v_secs_since_matched int;
  v_fee int := 0;
  v_reason text := 'free';
  v_driver_busy_elsewhere boolean := false;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null or r.client_id <> auth.uid() then
    raise exception 'Ride not found';
  end if;

  -- Chauffeur encore engagé sur une autre course antérieure ? → annulation gratuite
  if r.driver_id is not null then
    v_driver_busy_elsewhere := exists (
      select 1 from public.rides other
      where other.driver_id = r.driver_id
        and other.id <> r.id
        and other.status in ('matched', 'arrived', 'in_progress')
        and other.matched_at < r.matched_at
    );
    if v_driver_busy_elsewhere then
      return query select 0, 'free_driver_busy', 0, 0, true;
      return;
    end if;
  end if;

  case
    when r.status = 'requested' then
      v_fee := 0;
      v_reason := 'free_no_match';
    when r.status = 'matched' then
      v_secs_since_matched := extract(epoch from (now() - r.matched_at))::int;
      if v_secs_since_matched <= 30 then
        v_fee := 0;
        v_reason := 'free_within_30s';
      else
        v_fee := public.round_to_50(300);
        v_reason := 'driver_on_way';
      end if;
    when r.status = 'arrived' then
      v_fee := public.round_to_50(500);
      v_reason := 'driver_arrived';
    when r.status = 'in_progress' then
      v_fee := public.round_to_50((r.price_total_fcfa * 0.50)::int);
      v_reason := 'ride_started';
    else
      v_fee := 0;
      v_reason := 'not_cancellable';
  end case;

  return query select
    v_fee,
    v_reason,
    (v_fee / 2)::int,
    v_fee - (v_fee / 2)::int,
    false;
end;
$$;

comment on function public.cancellation_fee_preview is
  'Renvoie les frais estimés + split 50/50 avant confirmation d''annulation. Aucun effet secondaire.';

-- 5. cancel_ride_by_client v2 : applique le débit + split
create or replace function public.cancel_ride_by_client(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  result public.rides;
  v_fee int := 0;
  v_reason text;
  v_driver_share int;
  v_platform_share int;
  v_dummy boolean;
  v_client_wallet_id uuid;
  v_driver_profile_id uuid;
  v_driver_wallet_id uuid;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('requested', 'matched', 'arrived', 'in_progress') then
    raise exception 'Course déjà terminée ou annulée';
  end if;

  -- Calcule les frais (même logique que preview)
  select p.fee_fcfa, p.reason_code, p.driver_share_fcfa, p.platform_share_fcfa
    into v_fee, v_reason, v_driver_share, v_platform_share
  from public.cancellation_fee_preview(ride_id) p;

  -- Update la ride en cancelled
  update public.rides
  set status = 'cancelled_by_client',
      ended_at = now(),
      cancel_reason = v_reason,
      updated_at = now()
  where id = ride_id
  returning * into result;

  -- Applique le débit si frais > 0
  if v_fee > 0 then
    -- 1. Débit du wallet TamCar Crédit client
    insert into public.wallets (profile_id, kind, balance_fcfa)
    values (auth.uid(), 'tamcar_credit', 0)
    on conflict (profile_id, kind) do nothing;

    select id into v_client_wallet_id
    from public.wallets
    where profile_id = auth.uid() and kind = 'tamcar_credit';

    update public.wallets
      set balance_fcfa = balance_fcfa - v_fee,
          updated_at = now()
      where id = v_client_wallet_id;

    insert into public.wallet_transactions (
      wallet_id, type, amount_fcfa, ride_id, status
    ) values (
      v_client_wallet_id, 'cancellation_fee', v_fee, ride_id, 'success'
    );

    -- 2. Crédit part chauffeur si applicable
    if r.driver_id is not null and v_driver_share > 0 then
      select profile_id into v_driver_profile_id
        from public.drivers where id = r.driver_id;
      if v_driver_profile_id is not null then
        insert into public.wallets (profile_id, kind, balance_fcfa)
        values (v_driver_profile_id, 'tamcar_revenus', 0)
        on conflict (profile_id, kind) do nothing;

        select id into v_driver_wallet_id
        from public.wallets
        where profile_id = v_driver_profile_id and kind = 'tamcar_revenus';

        update public.wallets
          set balance_fcfa = balance_fcfa + v_driver_share,
              updated_at = now()
          where id = v_driver_wallet_id;

        insert into public.wallet_transactions (
          wallet_id, type, amount_fcfa, ride_id, status
        ) values (
          v_driver_wallet_id, 'cancellation_reimbursement', v_driver_share, ride_id, 'success'
        );
      end if;
    end if;
    -- Note : la part plateforme reste comptabilisée dans la table wallet_transactions
    -- au wallet client (sous forme de débit), la plateforme n'a pas de wallet dédié.
  end if;

  return result;
end;
$$;

comment on function public.cancel_ride_by_client is
  'v2 : applique le barème d''annulation (débit client + crédit chauffeur 50/50), autorise le solde négatif, arrondit au 50 F.';
