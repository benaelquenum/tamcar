-- ============================================================
-- Ajoute rides.cancel_reason_user pour stocker la raison d'annulation
-- saisie par le client (menu à 5 options + Autre) — utile analytics.
-- Extend cancel_ride_by_client pour accepter le param.
-- ============================================================

alter table public.rides
  add column if not exists cancel_reason_user text;

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

  select p.fee_fcfa, p.reason_code, p.driver_share_fcfa, p.platform_share_fcfa
    into v_fee, v_reason, v_driver_share, v_platform_share
  from public.cancellation_fee_preview(ride_id) p;

  update public.rides
  set status = 'cancelled_by_client',
      ended_at = now(),
      cancel_reason = v_reason,
      cancel_reason_user = p_user_reason,
      updated_at = now()
  where id = ride_id
  returning * into result;

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
