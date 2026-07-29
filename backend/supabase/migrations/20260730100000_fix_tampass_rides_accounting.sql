-- ============================================================
-- TamCar — Fix compta courses TamPass (2026-07-30)
--
--   Les rides TamPass sont créées avec payment_method NULL (le pass est
--   PRÉPAYÉ à l'achat — cf note du scheduler). Le trigger v7 (compta
--   hybride cash) ne considérait « TamCar détient l'argent » que pour
--   payment_method = 'tamcar_credit' → une course TamPass terminée
--   passait dans la branche cash : chauffeur DÉBITÉ de la commission au
--   lieu d'être CRÉDITÉ de sa part.
--
--   v8 : TamCar détient l'argent si payment_method = 'tamcar_credit'
--   OU payment_method IS NULL (prépayé TamPass). Le débit du wallet
--   client reste strictement réservé à 'tamcar_credit' (un pass ne doit
--   pas être débité une seconde fois).
-- ============================================================

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
  v_tamcar_holds boolean;
  v_commission int;
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then

    -- TamCar détient l'argent : paiement wallet OU prépayé (TamPass, NULL)
    v_tamcar_holds := (new.payment_method = 'tamcar_credit' or new.payment_method is null);

    -- 1. Débit wallet client UNIQUEMENT si paiement TamCar Crédit
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

    -- 2. Chauffeur
    if new.driver_id is not null then
      select application_type, profile_id, created_at
        into driver_app_type, driver_profile_id, driver_created_at
       from public.drivers where id = new.driver_id;

      -- Bonus (inchangé)
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

      select id into w_id from public.wallets
        where profile_id = driver_profile_id and kind = 'tamcar_revenus';

      if w_id is not null then
        if v_tamcar_holds then
          -- Cashless / prépayé : TamCar a encaissé -> crédite part chauffeur (+ bonus)
          total_credited_to_driver := new.driver_share_fcfa + bonus;
          if total_credited_to_driver > 0 then
            update public.wallets
              set balance_fcfa = balance_fcfa + total_credited_to_driver
              where id = w_id;
            insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
            values (w_id, 'revenue_share_credit', total_credited_to_driver, new.id, 'success');
          end if;
        else
          -- Espèces / MoMo direct : le chauffeur détient tout le prix.
          v_commission := new.price_total_fcfa - new.driver_share_fcfa;
          if v_commission > 0 then
            update public.wallets
              set balance_fcfa = balance_fcfa - v_commission
              where id = w_id;
            insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
            values (w_id, 'cash_commission', v_commission, new.id, 'success');
          end if;
          if bonus > 0 then
            update public.wallets
              set balance_fcfa = balance_fcfa + bonus
              where id = w_id;
            insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
            values (w_id, 'revenue_share_credit', bonus, new.id, 'success');
          end if;
        end if;
      end if;

      -- Split fonds rachat (inchangé — s'applique dans tous les modes)
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

    -- 3. Part partenaire véhicule (inchangé)
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

-- Détection de dégâts éventuels (courses TamPass terminées depuis la v7) :
-- si ce SELECT renvoie > 0, des corrections de wallet sont nécessaires —
-- me le signaler pour générer le SQL de réparation.
-- select count(*) as tampass_rides_mal_comptees
-- from public.wallet_transactions wt
-- join public.subscription_rides sr on sr.ride_id = wt.ride_id
-- where wt.type = 'cash_commission';
