-- ============================================================
-- Suite de 20260717300000 : le nouveau type wallet_tx_type
-- 'dealer_share_credit' n'est utilisable qu'après COMMIT du ALTER
-- TYPE. On split en 2 migrations pour que le CREATE FUNCTION
-- utilise le type sans erreur.
--
-- 1. credit_wallets_on_ride_complete v6 : la part dealer utilise
--    'dealer_share_credit' au lieu de 'revenue_share_credit'.
-- 2. Backfill : les transactions dealer déjà présentes sont
--    retaguées 'dealer_share_credit' (celles qui sont en double
--    sur le même wallet + même ride que la part chauffeur).
-- ============================================================

-- 1. Nouveau trigger (copie de v5 avec juste la ligne dealer modifiée)
create or replace function public.credit_wallets_on_ride_complete()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  w_id uuid;
  driver_profile_id uuid;
  dealer_profile_id uuid;
  driver_app_type driver_application_type;
  driver_created_at timestamptz;
  is_senior boolean := false;
  bonus_threshold int;
  rides_before_this int := 0;
  bonus int := 0;
  total_credited_to_driver int;
  months_active numeric;
  platform_rachat_share_pct numeric;
  platform_rachat_amount int;
  driver_rachat_amount int;
  v_dealer_id uuid;
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then

    -- 1. Débit wallet client si paiement TamCar Crédit
    if new.payment_method = 'tamcar_credit' and new.price_total_fcfa > 0 then
      select id into w_id from public.wallets
        where profile_id = new.client_id and kind = 'tamcar_credit';
      if w_id is not null then
        update public.wallets
          set balance_fcfa = balance_fcfa - new.price_total_fcfa
          where id = w_id;
        insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
        values (w_id, 'payment', new.price_total_fcfa, new.id, 'success');
      end if;
    end if;

    -- 2. Crédits chauffeur + bonus
    if new.driver_id is not null then
      select application_type, profile_id, created_at
        into driver_app_type, driver_profile_id, driver_created_at
       from public.drivers where id = new.driver_id;

      if driver_app_type = 'cession' then
        select count(*)::int into rides_before_this
        from public.rides
        where driver_id = new.driver_id
          and status = 'completed'
          and id <> new.id
          and (ended_at at time zone 'Africa/Porto-Novo')::date
            = (new.ended_at at time zone 'Africa/Porto-Novo')::date;

        is_senior := (
          driver_created_at < now() - interval '6 months'
          and not exists (
            select 1 from public.driver_warnings w
            where w.driver_id = new.driver_id
              and w.issued_at > now() - interval '6 months'
          )
        );

        bonus_threshold := case when is_senior then 13 else 15 end;

        if rides_before_this >= bonus_threshold then
          bonus := floor(new.price_total_fcfa * 0.05)::int;
          bonus := least(bonus, new.platform_share_fcfa);
        end if;

      elsif driver_app_type = 'proprietaire' and new.driver_share_fcfa > 0 then
        bonus := least(floor(new.price_total_fcfa * 0.10)::int, 100);
        bonus := least(bonus, new.platform_share_fcfa);
      end if;

      total_credited_to_driver := new.driver_share_fcfa + bonus;

      if total_credited_to_driver > 0 then
        select id into w_id from public.wallets
          where profile_id = driver_profile_id and kind = 'tamcar_revenus';
        if w_id is not null then
          update public.wallets
            set balance_fcfa = balance_fcfa + total_credited_to_driver
            where id = w_id;
          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
          values (w_id, 'revenue_share_credit', total_credited_to_driver, new.id, 'success');
        end if;
      end if;

      -- Split fonds rachat (identique v5)
      if driver_app_type = 'cession' and new.driver_rachat_fcfa > 0 then
        months_active := extract(epoch from (now() - driver_created_at)) / (30.0 * 86400);
        platform_rachat_share_pct := case when months_active < 12 then 0.30 else 0.20 end;
        platform_rachat_amount := floor(new.driver_rachat_fcfa * platform_rachat_share_pct)::int;
        driver_rachat_amount := new.driver_rachat_fcfa - platform_rachat_amount;

        select id into w_id from public.wallets
          where profile_id = driver_profile_id and kind = 'tamcar_rachat';
        if w_id is not null then
          update public.wallets
            set balance_fcfa = balance_fcfa + driver_rachat_amount
            where id = w_id;
          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
          values (w_id, 'rachat_credit', driver_rachat_amount, new.id, 'success');
        end if;

        select v.dealer_partner_id into v_dealer_id
          from public.vehicles v where v.id = new.vehicle_id;

        if v_dealer_id is not null and platform_rachat_amount > 0 then
          update public.dealer_advances
          set refunded_fcfa = refunded_fcfa + platform_rachat_amount,
              updated_at = now()
          where dealer_partner_id = v_dealer_id
            and status = 'active';
        end if;

      elsif new.driver_rachat_fcfa > 0 then
        select id into w_id from public.wallets
          where profile_id = driver_profile_id and kind = 'tamcar_rachat';
        if w_id is not null then
          update public.wallets
            set balance_fcfa = balance_fcfa + new.driver_rachat_fcfa
            where id = w_id;
          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
          values (w_id, 'rachat_credit', new.driver_rachat_fcfa, new.id, 'success');
        end if;
      end if;
    end if;

    -- 3. Part dealer_partner (nouveau type 'dealer_share_credit')
    if new.dealer_partner_id is not null and new.dealer_share_fcfa > 0 then
      select profile_id into dealer_profile_id
        from public.dealer_partners where id = new.dealer_partner_id;
      select id into w_id from public.wallets
        where profile_id = dealer_profile_id and kind = 'tamcar_revenus';
      if w_id is not null then
        update public.wallets
          set balance_fcfa = balance_fcfa + new.dealer_share_fcfa
          where id = w_id;
        insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
        values (w_id, 'dealer_share_credit', new.dealer_share_fcfa, new.id, 'success');
      end if;
    end if;

  end if;
  return new;
end;
$$;

-- 2. Backfill : les transactions dealer existantes (type='revenue_share_credit'
-- avec un jumeau sur le même wallet + même ride) sont retaguées.
-- Heuristique : quand 2 lignes revenue_share_credit existent pour (wallet_id, ride_id),
-- la plus petite est la part dealer, la plus grande la part driver.
with pairs as (
  select wt.id, wt.wallet_id, wt.ride_id, wt.amount_fcfa,
         row_number() over (partition by wt.wallet_id, wt.ride_id order by wt.amount_fcfa asc) as rn,
         count(*) over (partition by wt.wallet_id, wt.ride_id) as cnt
  from public.wallet_transactions wt
  where wt.type = 'revenue_share_credit'
    and wt.ride_id is not null
)
update public.wallet_transactions wt
set type = 'dealer_share_credit'
from pairs
where wt.id = pairs.id
  and pairs.cnt = 2
  and pairs.rn = 1;
