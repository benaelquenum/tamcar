-- ============================================================
-- Admin : trancher un litige d'annulation.
--
-- Si 'client' est déclaré fautif → statu quo (frais gardés)
-- Si 'driver' est déclaré fautif → rembourse le client + retire la part
--   du chauffeur qui lui avait été créditée + strike chauffeur
-- ============================================================

create or replace function public.admin_resolve_cancellation_dispute(
  p_ride_id uuid,
  p_verdict text,        -- 'client' | 'driver'
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
    -- Faute chauffeur confirmée : remboursement complet du client
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
    -- Faute client : statu quo, on retire juste le drapeau litige
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

comment on function public.admin_resolve_cancellation_dispute is
  'Admin tranche un litige : verdict=driver → remboursement client + reprise part chauffeur + strike ; verdict=client → statu quo, drapeau retiré.';

-- Grant RLS sur la vue pour admin uniquement (via is_admin check dans policy)
grant select on public.cancellations_disputed_view to authenticated;
