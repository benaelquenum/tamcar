-- ============================================================
-- Boucle chauffeur autour des strikes :
--   (a) auto-suspension à ≥ 5 strikes sur 30 jours glissants
--   (b) push chauffeur à chaque strike appliqué
--   (c) endpoint chauffeur pour contester un strike sous 7 jours
--
-- Fenêtre récente : 30 jours glissants — un ancien historique ne suspend
-- pas un chauffeur redevenu régulier.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colonnes contestation chauffeur sur rides
-- ------------------------------------------------------------
alter table public.rides
  add column if not exists driver_strike_disputed_at timestamptz,
  add column if not exists driver_strike_dispute_reason text,
  add column if not exists driver_strike_resolved_at timestamptz,
  add column if not exists driver_strike_upheld boolean;

-- ------------------------------------------------------------
-- 2. Helper : compte strikes récents (30j par défaut)
-- ------------------------------------------------------------
create or replace function public._recent_driver_strikes(
  p_driver_id uuid,
  p_days int default 30
)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.rides
    where driver_id = p_driver_id
      and cancel_attributed_to = 'driver'
      and ended_at > now() - (p_days || ' days')::interval
      and coalesce(driver_strike_upheld, true) = true;
$$;

comment on function public._recent_driver_strikes is
  'Compte les strikes actifs (non révoqués par contestation) sur N jours glissants.';

-- ------------------------------------------------------------
-- 3. Helper : applique un strike + push + auto-suspend si seuil
--    Idempotent — safe à appeler plusieurs fois sur la même ride
-- ------------------------------------------------------------
create or replace function public._apply_driver_strike(
  p_driver_id uuid,
  p_ride_id uuid,
  p_reason_label text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
  v_recent int;
  v_full_name text;
begin
  if p_driver_id is null then return; end if;

  select profile_id into v_profile_id
    from public.drivers where id = p_driver_id;
  if v_profile_id is null then return; end if;

  -- Push chauffeur
  perform public._push_notify(
    v_profile_id,
    '⚠ Signalement reçu',
    'Un client a signalé un problème : ' || coalesce(p_reason_label, 'annulation') ||
      '. Tu as 7 jours pour contester depuis ton espace.',
    '/strikes',
    'strike:' || p_ride_id::text,
    true
  );

  -- Auto-suspension si ≥ 5 strikes récents
  v_recent := public._recent_driver_strikes(p_driver_id, 30);
  if v_recent >= 5 then
    update public.drivers
      set status = 'suspended',
          updated_at = now()
      where id = p_driver_id
        and status = 'active';

    if found then
      perform public._push_notify(
        v_profile_id,
        '🚫 Compte suspendu',
        'Trop de signalements récents (' || v_recent::text ||
          ' sur 30 jours). Ton compte est suspendu — contacte le support.',
        '/strikes',
        'suspension:' || p_driver_id::text,
        true
      );
    end if;
  end if;
end;
$$;

comment on function public._apply_driver_strike is
  'Push signalement au chauffeur + check auto-suspension au seuil 5 strikes / 30 jours.';

-- ------------------------------------------------------------
-- 4. Refactor cancel_ride_by_client v3.1 : appelle _apply_driver_strike
-- ------------------------------------------------------------
create or replace function public.cancel_ride_by_client(
  ride_id uuid,
  p_user_reason text default null
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  result public.rides;
  v_fee int := 0;
  v_reason text;
  v_driver_share int;
  v_platform_share int;
  v_is_driver_fault boolean := false;
  v_evidence text;
  v_disputed boolean := false;
  v_client_wallet_id uuid;
  v_driver_profile_id uuid;
  v_driver_wallet_id uuid;
  v_attributed text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('requested', 'matched', 'arrived', 'in_progress') then
    raise exception 'Course déjà terminée ou annulée';
  end if;

  select p.fee_fcfa, p.reason_code, p.driver_share_fcfa, p.platform_share_fcfa,
         p.is_driver_fault, p.driver_fault_evidence, p.will_be_disputed
    into v_fee, v_reason, v_driver_share, v_platform_share,
         v_is_driver_fault, v_evidence, v_disputed
  from public.cancellation_fee_preview(ride_id, p_user_reason) p;

  v_attributed := case
    when v_is_driver_fault then 'driver'
    when v_reason = 'free_driver_busy' then 'neutral'
    else 'client'
  end;

  update public.rides
  set status = 'cancelled_by_client',
      ended_at = now(),
      cancel_reason = v_reason,
      cancel_reason_user = p_user_reason,
      cancel_attributed_to = v_attributed,
      cancel_disputed = v_disputed,
      cancel_driver_fault_evidence = v_evidence,
      updated_at = now()
  where id = ride_id
  returning * into result;

  -- Strike chauffeur si faute prouvée
  if v_is_driver_fault and r.driver_id is not null then
    update public.drivers
      set cancellations_driver_fault_count = cancellations_driver_fault_count + 1
      where id = r.driver_id;
    perform public._apply_driver_strike(
      r.driver_id,
      ride_id,
      coalesce(v_evidence, p_user_reason, 'faute prouvée')
    );
  end if;

  if v_fee > 0 then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (auth.uid(), 'tamcar_credit', 0)
      on conflict (profile_id, kind) do nothing;
    select id into v_client_wallet_id
      from public.wallets
      where profile_id = auth.uid() and kind = 'tamcar_credit';

    update public.wallets
      set balance_fcfa = balance_fcfa - v_fee, updated_at = now()
      where id = v_client_wallet_id;
    insert into public.wallet_transactions
      (wallet_id, type, amount_fcfa, ride_id, status)
      values (v_client_wallet_id, 'cancellation_fee', v_fee, ride_id, 'success');

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
          set balance_fcfa = balance_fcfa + v_driver_share, updated_at = now()
          where id = v_driver_wallet_id;
        insert into public.wallet_transactions
          (wallet_id, type, amount_fcfa, ride_id, status)
          values (v_driver_wallet_id, 'cancellation_reimbursement', v_driver_share, ride_id, 'success');
      end if;
    end if;
  end if;

  return result;
end;
$$;

-- ------------------------------------------------------------
-- 5. Refactor admin_resolve_cancellation_dispute : appelle _apply_driver_strike
-- ------------------------------------------------------------
create or replace function public.admin_resolve_cancellation_dispute(
  p_ride_id uuid,
  p_verdict text,
  p_admin_note text default null
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  result public.rides;
  v_client_wallet_id uuid;
  v_driver_profile_id uuid;
  v_driver_wallet_id uuid;
  v_refund_fcfa int;
  v_reclaim_driver_fcfa int;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_verdict not in ('client', 'driver') then
    raise exception 'Verdict invalide (client|driver)';
  end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if not r.cancel_disputed then raise exception 'Ride non en litige'; end if;

  if p_verdict = 'driver' then
    v_refund_fcfa := coalesce(
      (select sum(amount_fcfa)::int from public.wallet_transactions
        where ride_id = p_ride_id and type = 'cancellation_fee'),
      0
    );
    v_reclaim_driver_fcfa := coalesce(
      (select sum(amount_fcfa)::int from public.wallet_transactions
        where ride_id = p_ride_id and type = 'cancellation_reimbursement'),
      0
    );

    if v_refund_fcfa > 0 then
      select id into v_client_wallet_id
        from public.wallets
        where profile_id = r.client_id and kind = 'tamcar_credit';
      update public.wallets
        set balance_fcfa = balance_fcfa + v_refund_fcfa, updated_at = now()
        where id = v_client_wallet_id;
      insert into public.wallet_transactions
        (wallet_id, type, amount_fcfa, ride_id, status)
        values (v_client_wallet_id, 'refund', v_refund_fcfa, p_ride_id, 'success');
    end if;

    if v_reclaim_driver_fcfa > 0 and r.driver_id is not null then
      select profile_id into v_driver_profile_id
        from public.drivers where id = r.driver_id;
      if v_driver_profile_id is not null then
        select id into v_driver_wallet_id
          from public.wallets
          where profile_id = v_driver_profile_id and kind = 'tamcar_revenus';
        if v_driver_wallet_id is not null then
          update public.wallets
            set balance_fcfa = balance_fcfa - v_reclaim_driver_fcfa,
                updated_at = now()
            where id = v_driver_wallet_id;
          insert into public.wallet_transactions
            (wallet_id, type, amount_fcfa, ride_id, status)
            values (v_driver_wallet_id, 'payment', v_reclaim_driver_fcfa, p_ride_id, 'success');
        end if;
      end if;
    end if;

    if r.driver_id is not null then
      update public.drivers
        set cancellations_driver_fault_count = cancellations_driver_fault_count + 1
        where id = r.driver_id;
      perform public._apply_driver_strike(
        r.driver_id,
        p_ride_id,
        'Arbitrage admin — ' || coalesce(p_admin_note, 'litige tranché contre le chauffeur')
      );
    end if;

    update public.rides
      set cancel_attributed_to = 'driver',
          cancel_disputed = false,
          cancel_driver_fault_evidence = coalesce(
            cancel_driver_fault_evidence,
            'Arbitrage admin : faute chauffeur (' || coalesce(p_admin_note, 'sans note') || ')'
          ),
          updated_at = now()
      where id = p_ride_id
      returning * into result;
  else
    update public.rides
      set cancel_disputed = false,
          cancel_attributed_to = 'client',
          cancel_driver_fault_evidence = coalesce(p_admin_note, 'Arbitrage admin : faute client'),
          updated_at = now()
      where id = p_ride_id
      returning * into result;
  end if;

  return result;
end;
$$;

-- ------------------------------------------------------------
-- 6. RPC chauffeur : liste des strikes actifs
-- ------------------------------------------------------------
create or replace function public.my_driver_strikes()
returns table (
  ride_id uuid,
  ended_at timestamptz,
  pickup_address text,
  dropoff_address text,
  cancel_reason_user text,
  cancel_driver_fault_evidence text,
  disputed_at timestamptz,
  dispute_reason text,
  resolved_at timestamptz,
  upheld boolean,
  can_dispute boolean
)
language sql stable security definer set search_path = public as $$
  select
    r.id as ride_id,
    r.ended_at,
    r.pickup_address,
    r.dropoff_address,
    r.cancel_reason_user,
    r.cancel_driver_fault_evidence,
    r.driver_strike_disputed_at as disputed_at,
    r.driver_strike_dispute_reason as dispute_reason,
    r.driver_strike_resolved_at as resolved_at,
    r.driver_strike_upheld as upheld,
    (
      r.driver_strike_disputed_at is null
      and r.ended_at > now() - interval '7 days'
    ) as can_dispute
  from public.rides r
  join public.drivers d on d.id = r.driver_id
  where d.profile_id = auth.uid()
    and r.cancel_attributed_to = 'driver'
    and coalesce(r.driver_strike_upheld, true) = true
  order by r.ended_at desc
  limit 100;
$$;

comment on function public.my_driver_strikes is
  'Liste des strikes du chauffeur connecté — actifs (non annulés) + flag can_dispute (< 7 jours et pas déjà contesté).';

-- ------------------------------------------------------------
-- 7. RPC chauffeur : contester un strike
-- ------------------------------------------------------------
create or replace function public.driver_dispute_strike(
  p_ride_id uuid,
  p_reason text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  v_driver_profile uuid;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'Explique en au moins 10 caractères ce qui s''est réellement passé.';
  end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Course introuvable'; end if;
  if r.driver_id is null then raise exception 'Aucun chauffeur assigné'; end if;

  select profile_id into v_driver_profile
    from public.drivers where id = r.driver_id;
  if v_driver_profile <> auth.uid() then raise exception 'Not your ride'; end if;

  if r.cancel_attributed_to <> 'driver' then
    raise exception 'Cette course n''est pas un strike contre toi';
  end if;
  if r.driver_strike_disputed_at is not null then
    raise exception 'Tu as déjà contesté ce strike';
  end if;
  if r.ended_at < now() - interval '7 days' then
    raise exception 'Délai de contestation dépassé (7 jours)';
  end if;

  update public.rides
    set driver_strike_disputed_at = now(),
        driver_strike_dispute_reason = trim(p_reason),
        cancel_disputed = true,     -- ré-ouvre le litige pour l'admin
        updated_at = now()
    where id = p_ride_id;
end;
$$;

comment on function public.driver_dispute_strike is
  'Le chauffeur conteste un strike sous 7 jours — remet la course en litige pour ré-arbitrage admin.';

-- ------------------------------------------------------------
-- 8. RPC admin : trancher la contestation chauffeur
-- ------------------------------------------------------------
create or replace function public.admin_resolve_strike_dispute(
  p_ride_id uuid,
  p_uphold boolean,     -- true = strike maintenu ; false = strike révoqué
  p_admin_note text default null
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  result public.rides;
  v_client_wallet_id uuid;
  v_driver_profile_id uuid;
  v_driver_wallet_id uuid;
  v_previously_refunded int;
  v_driver_share_recovered int;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride not found'; end if;
  if r.driver_strike_disputed_at is null then
    raise exception 'Aucune contestation à trancher';
  end if;
  if r.driver_strike_resolved_at is not null then
    raise exception 'Contestation déjà tranchée';
  end if;

  if p_uphold then
    -- Strike maintenu : rien à défaire
    update public.rides
      set driver_strike_upheld = true,
          driver_strike_resolved_at = now(),
          cancel_disputed = false,
          cancel_driver_fault_evidence = coalesce(cancel_driver_fault_evidence, '') ||
            E'\n[Contestation rejetée' ||
            case when p_admin_note is not null then ' : ' || p_admin_note else '' end || ']',
          updated_at = now()
      where id = p_ride_id
      returning * into result;
  else
    -- Strike révoqué : décrémente compteur, ré-attribue au client, reprend le remboursement
    v_previously_refunded := coalesce(
      (select sum(amount_fcfa)::int from public.wallet_transactions
        where ride_id = p_ride_id and type = 'refund'),
      0
    );

    -- Reprendre le remboursement fait au client (il n'y a pas droit finalement)
    if v_previously_refunded > 0 then
      select id into v_client_wallet_id
        from public.wallets
        where profile_id = r.client_id and kind = 'tamcar_credit';
      if v_client_wallet_id is not null then
        update public.wallets
          set balance_fcfa = balance_fcfa - v_previously_refunded, updated_at = now()
          where id = v_client_wallet_id;
        insert into public.wallet_transactions
          (wallet_id, type, amount_fcfa, ride_id, status)
          values (v_client_wallet_id, 'cancellation_fee', v_previously_refunded, p_ride_id, 'success');
      end if;
    end if;

    -- Recréditer chauffeur (part reprise à l'arbitrage initial)
    v_driver_share_recovered := coalesce(
      (select sum(amount_fcfa)::int from public.wallet_transactions
        where ride_id = p_ride_id and type = 'payment'),
      0
    );
    if v_driver_share_recovered > 0 and r.driver_id is not null then
      select profile_id into v_driver_profile_id
        from public.drivers where id = r.driver_id;
      if v_driver_profile_id is not null then
        select id into v_driver_wallet_id
          from public.wallets
          where profile_id = v_driver_profile_id and kind = 'tamcar_revenus';
        if v_driver_wallet_id is not null then
          update public.wallets
            set balance_fcfa = balance_fcfa + v_driver_share_recovered, updated_at = now()
            where id = v_driver_wallet_id;
          insert into public.wallet_transactions
            (wallet_id, type, amount_fcfa, ride_id, status)
            values (v_driver_wallet_id, 'cancellation_reimbursement', v_driver_share_recovered, p_ride_id, 'success');
        end if;
      end if;
    end if;

    -- Décrémente strike compteur chauffeur
    if r.driver_id is not null then
      update public.drivers
        set cancellations_driver_fault_count = greatest(0, cancellations_driver_fault_count - 1)
        where id = r.driver_id;
    end if;

    update public.rides
      set driver_strike_upheld = false,
          driver_strike_resolved_at = now(),
          cancel_attributed_to = 'client',
          cancel_disputed = false,
          cancel_driver_fault_evidence = coalesce(cancel_driver_fault_evidence, '') ||
            E'\n[Contestation acceptée — strike révoqué' ||
            case when p_admin_note is not null then ' : ' || p_admin_note else '' end || ']',
          updated_at = now()
      where id = p_ride_id
      returning * into result;

    -- Push chauffeur : "bonne nouvelle, strike révoqué"
    if v_driver_profile_id is not null then
      perform public._push_notify(
        v_driver_profile_id,
        '✓ Signalement révoqué',
        'Ta contestation a été acceptée — le strike sur la course annulée est retiré.',
        '/strikes',
        'strike-revoked:' || p_ride_id::text,
        false
      );
    end if;
  end if;

  return result;
end;
$$;

comment on function public.admin_resolve_strike_dispute is
  'Tranche la contestation du chauffeur : uphold=true garde le strike, uphold=false le révoque + rembourse le chauffeur + reprend le remboursement du client.';

-- ------------------------------------------------------------
-- 9. Enrichit cancellations_disputed_view avec les contestations chauffeur
-- ------------------------------------------------------------
drop view if exists public.cancellations_disputed_view;
create view public.cancellations_disputed_view as
select
  r.id as ride_id,
  r.client_id,
  cp.full_name as client_name,
  r.driver_id,
  dp.full_name as driver_name,
  r.pickup_address,
  r.dropoff_address,
  r.cancel_reason_user,
  r.cancel_reason,
  r.cancel_driver_fault_evidence,
  r.matched_at,
  r.ended_at,
  r.driver_distance_at_match_m,
  d.cancellations_driver_fault_count as driver_strike_count,
  r.driver_strike_disputed_at,
  r.driver_strike_dispute_reason,
  case
    when r.driver_strike_disputed_at is not null then 'driver_contest'
    else 'client_reason_unproven'
  end as dispute_kind
from public.rides r
left join public.profiles cp on cp.id = r.client_id
left join public.drivers d on d.id = r.driver_id
left join public.profiles dp on dp.id = d.profile_id
where r.cancel_disputed = true
  and r.status = 'cancelled_by_client'
order by r.ended_at desc;

grant select on public.cancellations_disputed_view to authenticated;
