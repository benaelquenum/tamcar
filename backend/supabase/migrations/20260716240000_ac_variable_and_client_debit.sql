-- ============================================================
-- Clim variable au km + débit wallet client au completed (2026-07-16)
--
-- 1. compute_price : ac_fee proportionnel à distance_km (40 F/km au lieu de 200 F flat)
-- 2. credit_wallets_on_ride_complete : débite le client de price_total_fcfa
--    depuis son wallet tamcar_credit si payment_method='tamcar_credit'
-- ============================================================

-- ------------------------------------------------------------
-- 1. compute_price v4 — clim proportionnelle aux km
-- Drop les anciennes signatures pour éviter l'ambiguïté du COMMENT
-- ------------------------------------------------------------
drop function if exists public.compute_price(
  vehicle_category, double precision, double precision, double precision, double precision,
  numeric, int, boolean, boolean
);
drop function if exists public.compute_price(
  vehicle_category, double precision, double precision, double precision, double precision,
  numeric, int, boolean
);
drop function if exists public.compute_price(
  vehicle_category, double precision, double precision, double precision, double precision,
  numeric, int
);

create or replace function public.compute_price(
  p_category vehicle_category,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  distance_km numeric,
  duration_min int,
  is_night boolean default false,
  with_ac boolean default false
)
returns table (
  price_total_fcfa int,
  driver_share_fcfa int,
  driver_rachat_fcfa int,
  dealer_share_fcfa int,
  platform_share_fcfa int,
  is_corridor boolean,
  corridor_info jsonb
)
language plpgsql stable security invoker as $$
declare
  tier record;
  is_c boolean := false;
  corridor_json jsonb := null;
  total int;
  standard_price int;
  effective_km_price int;
  extra_km numeric;
  extra_min int;
  ac_fee int := 0;
  v_driver_cash int;
  v_driver_rachat int;
  v_dealer int;
  v_platform int;
  corridor_row record;
  pickup_cp record;
  dropoff_cp record;
begin
  select * into tier from public.category_pricing_tiers where category = p_category;
  if tier is null then raise exception 'Tarif inconnu pour catégorie %', p_category; end if;

  -- Corridor check via checkpoints
  select cp.* into pickup_cp
   from public.corridor_checkpoints cp
   where st_dwithin(cp.center, st_point(pickup_lng, pickup_lat)::geography, cp.radius_m)
   order by st_distance(cp.center, st_point(pickup_lng, pickup_lat)::geography) asc
   limit 1;

  select cp.* into dropoff_cp
   from public.corridor_checkpoints cp
   where st_dwithin(cp.center, st_point(dropoff_lng, dropoff_lat)::geography, cp.radius_m)
   order by st_distance(cp.center, st_point(dropoff_lng, dropoff_lat)::geography) asc
   limit 1;

  if pickup_cp.id is not null and dropoff_cp.id is not null and pickup_cp.id <> dropoff_cp.id then
    select cf.* into corridor_row
     from public.corridor_fixed_prices cf
     where cf.category = p_category
       and ((cf.checkpoint_a_id = pickup_cp.id and cf.checkpoint_b_id = dropoff_cp.id)
         or (cf.checkpoint_b_id = pickup_cp.id and cf.checkpoint_a_id = dropoff_cp.id));
    if corridor_row.id is not null then
      is_c := true;
      total := case when is_night then corridor_row.price_night_fcfa else corridor_row.price_day_fcfa end;
      corridor_json := jsonb_build_object(
        'checkpoint_a', pickup_cp.name,
        'checkpoint_b', dropoff_cp.name,
        'day_price', corridor_row.price_day_fcfa,
        'night_price', corridor_row.price_night_fcfa
      );
    end if;
  end if;

  if not is_c then
    effective_km_price := case
      when distance_km > 5 then tier.km_corridor_fcfa
      else tier.km_city_fcfa
    end;

    extra_km  := greatest(0, distance_km - tier.base_covers_km);
    extra_min := greatest(0, duration_min - tier.base_covers_min);
    standard_price := tier.base_fcfa + greatest(
      ceil(extra_km * effective_km_price)::int,
      extra_min * tier.min_fcfa
    );
    total := greatest(standard_price, tier.min_course_fcfa);
  end if;

  -- Climatisation optionnelle Essentiel : 40 F/km avec plancher 200 F
  if with_ac and p_category = 'essentiel' then
    ac_fee := greatest(200, ceil(distance_km * 40)::int);
    total  := total + ac_fee;
  end if;

  -- Split cession v3 : 40/10/30/20 (info seulement — le vrai split est appliqué à accept_ride)
  v_driver_cash   := floor(total * 0.40)::int;
  v_driver_rachat := floor(total * 0.10)::int;
  v_dealer        := floor(total * 0.30)::int;
  v_platform      := total - v_driver_cash - v_driver_rachat - v_dealer;

  return query select
    total,
    v_driver_cash,
    v_driver_rachat,
    v_dealer,
    v_platform,
    is_c,
    corridor_json;
end;
$$;

comment on function public.compute_price(
  vehicle_category, double precision, double precision, double precision, double precision,
  numeric, int, boolean, boolean
) is 'Calcul prix v4 : ajoute ac_fee variable (40 F/km min 200 F) sur Essentiel + split indicatif 40/10/30/20.';

-- ------------------------------------------------------------
-- 2. credit_wallets_on_ride_complete v4 : débite le client si tamcar_credit
-- ------------------------------------------------------------
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

    -- 2. Crédits chauffeur / rachat / dealer / bonus (identique v3)
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

      if new.driver_rachat_fcfa > 0 then
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
        values (w_id, 'revenue_share_credit', new.dealer_share_fcfa, new.id, 'success');
      end if;
    end if;

  end if;
  return new;
end;
$$;
