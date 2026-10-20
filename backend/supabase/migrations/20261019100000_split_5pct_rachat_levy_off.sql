-- ============================================================
-- TamCar — Nouvelle clé de répartition du plan d'affaires v6 (décision du 2026-10-18, appliquée le 2026-10-19)
--
--   Sur chaque course d'un véhicule sous contrat : chauffeur 40 %, propriétaire 30 %, fonds de rachat 5 % (au lieu de 10 %), TamCar le reste
--   (25 % = 20 % de commission + 5 % de gestion du véhicule). Le chauffeur propriétaire de son véhicule reste à 80 / 20.
--   • Le fonds de rachat (5 %) est crédité EN ENTIER au portefeuille « rachat » du chauffeur : plus de prélèvement de 30 % / 20 % pour la
--     plateforme ni de cumul sur une avance de démarrage (supprimée).
--   • Le prélèvement mensuel « maintien en flotte » de 3 points du volume sur le fonds est ARRÊTÉ : TamCar finance les frais d'entrée, les
--     senteurs, les gadgets et les forfaits internet sur sa propre part. Les réglages passent à 0 et la tâche planifiée est retirée.
--   Les courses déjà terminées gardent leurs montants d'origine.
-- ============================================================

-- compute_price
CREATE OR REPLACE FUNCTION public.compute_price(pickup_lat double precision, pickup_lng double precision, dropoff_lat double precision, dropoff_lng double precision, distance_km numeric, duration_min integer, p_category vehicle_category DEFAULT 'essentiel'::vehicle_category, is_night boolean DEFAULT false, with_ac boolean DEFAULT false)
 RETURNS TABLE(price_total_fcfa integer, driver_cash_fcfa integer, driver_rachat_fcfa integer, dealer_share_fcfa integer, platform_share_fcfa integer, is_corridor boolean, corridor_detail jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  tier public.pricing_tiers%rowtype;
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
  select * into tier from public.pricing_tiers where category = p_category;
  if tier is null then raise exception 'Tarif inconnu pour catégorie %', p_category; end if;

  -- Checkpoint match : rayon en KILOMÈTRES → conversion en mètres pour st_dwithin
  select cp.* into pickup_cp
   from public.checkpoints cp
   where st_dwithin(cp.location, st_point(pickup_lng, pickup_lat)::geography, cp.radius_km * 1000)
   order by st_distance(cp.location, st_point(pickup_lng, pickup_lat)::geography) asc
   limit 1;

  select cp.* into dropoff_cp
   from public.checkpoints cp
   where st_dwithin(cp.location, st_point(dropoff_lng, dropoff_lat)::geography, cp.radius_km * 1000)
   order by st_distance(cp.location, st_point(dropoff_lng, dropoff_lat)::geography) asc
   limit 1;

  if pickup_cp.id is not null and dropoff_cp.id is not null and pickup_cp.id <> dropoff_cp.id then
    select cf.* into corridor_row
     from public.corridor_prices cf
     where cf.category = p_category
       and ((cf.from_checkpoint_id = pickup_cp.id and cf.to_checkpoint_id = dropoff_cp.id)
         or (cf.to_checkpoint_id = pickup_cp.id and cf.from_checkpoint_id = dropoff_cp.id));
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
    effective_km_price := case when distance_km > 5 then tier.km_corridor_fcfa else tier.km_city_fcfa end;
    extra_km := greatest(0, distance_km - tier.base_covers_km);
    extra_min := greatest(0, duration_min - tier.base_covers_min);
    standard_price := tier.base_fcfa + greatest(
      ceil(extra_km * effective_km_price)::int,
      extra_min * tier.min_fcfa
    );
    total := greatest(standard_price, tier.min_course_fcfa);
  end if;

  if with_ac and p_category = 'essentiel' then
    ac_fee := greatest(200, ceil(distance_km * 40)::int);
    total := total + ac_fee;
  end if;

  -- Arrondi au 50 F par excès
  total := public.ceil_to_50(total);

  v_driver_cash   := floor(total * 0.40)::int;
  v_driver_rachat := floor(total * 0.05)::int;
  v_dealer        := floor(total * 0.30)::int;
  v_platform      := total - v_driver_cash - v_driver_rachat - v_dealer;

  return query select
    total, v_driver_cash, v_driver_rachat, v_dealer, v_platform, is_c, corridor_json;
end;
$function$;

-- _apply_completion
CREATE OR REPLACE FUNCTION public._apply_completion(ride_id uuid)
 RETURNS rides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.rides;
  result public.rides;
  driver_app_type driver_application_type;
  dealer_id uuid;
  new_price int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer_share int;
  new_platform int;
begin
  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.status <> 'in_progress' then raise exception 'Statut invalide'; end if;
  if r.completion_requested_at is null then raise exception 'Aucune demande de fin en cours'; end if;

  -- Si un prix recomputé existe, on recalcule les shares selon la formule du driver
  if r.completion_recomputed_price_fcfa is not null then
    new_price := r.completion_recomputed_price_fcfa;

    if r.driver_id is not null then
      select application_type into driver_app_type from public.drivers where id = r.driver_id;
    end if;

    select dealer_partner_id into dealer_id
     from public.vehicles v join public.drivers d on d.current_vehicle_id = v.id
     where d.id = r.driver_id;

    if driver_app_type = 'proprietaire' then
      new_driver_cash := floor(new_price * 0.80)::int;
      new_driver_rachat := 0;
      new_dealer_share := 0;
      new_platform := new_price - new_driver_cash;
    else
      new_driver_cash := floor(new_price * 0.40)::int;
      new_driver_rachat := floor(new_price * 0.05)::int;
      new_dealer_share := floor(new_price * 0.30)::int;
      new_platform := new_price - new_driver_cash - new_driver_rachat - new_dealer_share;
    end if;

    update public.rides
    set price_total_fcfa = new_price,
        driver_share_fcfa = new_driver_cash,
        driver_rachat_fcfa = new_driver_rachat,
        dealer_share_fcfa = new_dealer_share,
        platform_share_fcfa = new_platform,
        status = 'completed',
        ended_at = now(),
        updated_at = now()
    where id = ride_id
    returning * into result;
  else
    update public.rides
    set status = 'completed',
        ended_at = now(),
        updated_at = now()
    where id = ride_id
    returning * into result;
  end if;

  return result;
end;
$function$;

-- _create_rental_ride
CREATE OR REPLACE FUNCTION public._create_rental_ride(p_rental_id uuid, p_amount integer, p_label text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  r public.vehicle_rentals;

  drv public.drivers;

  v_dealer uuid;

  v_ride uuid;

  v_cash int;

  v_rachat int;

  v_dealer_share int;

  v_platform int;

begin

  select * into r from public.vehicle_rentals where id = p_rental_id;

  if r.id is null then raise exception 'Location introuvable.'; end if;

  select * into drv from public.drivers where id = r.driver_id;

  select dealer_partner_id into v_dealer from public.vehicles where id = r.vehicle_id;



  -- Partage identique à accept_ride.

  if drv.application_type = 'proprietaire' then

    v_cash := floor(p_amount * 0.80)::int;

    v_rachat := 0;

    v_dealer_share := 0;

    v_platform := p_amount - v_cash;

    v_dealer := null;

  else

    v_cash := floor(p_amount * 0.40)::int;

    v_rachat := floor(p_amount * 0.05)::int;

    v_dealer_share := floor(p_amount * 0.30)::int;

    v_platform := p_amount - v_cash - v_rachat - v_dealer_share;

  end if;



  -- Prépayé : payment_method NULL = TamCar détient l'argent (le chauffeur est crédité de sa part).

  insert into public.rides (

    client_id, driver_id, vehicle_id, dealer_partner_id,

    pickup_location, pickup_address, dropoff_location, dropoff_address,

    distance_km, duration_min,

    price_total_fcfa, driver_share_fcfa, driver_rachat_fcfa, dealer_share_fcfa, platform_share_fcfa,

    status, payment_method, requested_category,

    requested_at, matched_at, started_at, with_ac

  ) values (

    r.client_id, r.driver_id, r.vehicle_id, v_dealer,

    r.pickup_location, r.pickup_address, r.pickup_location, p_label,

    0, r.hours * 60,

    p_amount, v_cash, v_rachat, v_dealer_share, v_platform,

    'in_progress', null, r.category,

    coalesce(r.confirmed_at, r.created_at), coalesce(r.confirmed_at, r.created_at),

    coalesce(r.started_at, now()), true

  ) returning id into v_ride;



  update public.rides

     set status = 'completed', ended_at = now(), updated_at = now()

   where id = v_ride;



  return v_ride;

end;

$function$;

-- _ride_shares
CREATE OR REPLACE FUNCTION public._ride_shares(p_total integer, p_driver_id uuid)
 RETURNS TABLE(driver_cash integer, rachat integer, dealer integer, platform integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_type driver_application_type;

begin

  if p_driver_id is not null then

    select application_type into v_type from public.drivers where id = p_driver_id;

  end if;

  if v_type = 'proprietaire' then

    driver_cash := floor(p_total * 0.80)::int;

    rachat := 0;

    dealer := 0;

    platform := p_total - driver_cash;

  else

    driver_cash := floor(p_total * 0.40)::int;

    rachat := floor(p_total * 0.05)::int;

    dealer := floor(p_total * 0.30)::int;

    platform := p_total - driver_cash - rachat - dealer;

  end if;

  return next;

end;

$function$;

-- accept_ride
CREATE OR REPLACE FUNCTION public.accept_ride(ride_id uuid)
 RETURNS rides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  driver_row public.drivers;

  dealer_id uuid;

  result public.rides;

  total int;

  new_driver_cash int;

  new_driver_rachat int;

  new_dealer_share int;

  new_platform int;

  v_pickup geography;

  v_dist_m int;

  v_target uuid;

  v_req_cat vehicle_category;

  v_req_at timestamptz;

  v_drv_cat vehicle_category;

  v_dur int;

begin

  if auth.uid() is null then raise exception 'Auth required'; end if;



  select * into driver_row

  from public.drivers where profile_id = auth.uid();



  if driver_row is null then raise exception 'Not a driver'; end if;

  if driver_row.status <> 'active' or not driver_row.is_online then

    raise exception 'Driver not active or offline';

  end if;

  if driver_row.current_vehicle_id is null then

    raise exception 'No vehicle assigned';

  end if;



  if exists (

    select 1 from public.rides

    where driver_id = driver_row.id

      and status in ('matched', 'arrived', 'in_progress')

  ) then

    raise exception 'Course active déjà en cours — termine-la avant.';

  end if;



  select dealer_partner_id, category into dealer_id, v_drv_cat

   from public.vehicles where id = driver_row.current_vehicle_id;



  select price_total_fcfa, pickup_location, requested_driver_id, requested_category, requested_at, duration_min

    into total, v_pickup, v_target, v_req_cat, v_req_at, v_dur

   from public.rides where id = ride_id;



  if total is null then raise exception 'Ride introuvable'; end if;



  -- Course directe : réservée au chauffeur visé tant qu'elle est directe.

  if v_target is not null and v_target <> driver_row.id then

    raise exception 'Cette course est réservée à un autre chauffeur.';

  end if;



  -- Calendrier : un véhicule réservé (location VIP) n'accepte pas une course qui

  -- chevaucherait sa réservation ou le tampon qui la précède.

  if public._my_rental_conflict(now(), now() + make_interval(mins => coalesce(v_dur, 15) + 10)) then

    raise exception 'Ton véhicule est réservé (location VIP) : cette course chevaucherait ta réservation.';

  end if;



  -- Cascade de catégories (course ordinaire uniquement) : le VIP ne prend jamais

  -- une demande Essentiel ; le VIP ne prend une demande Confort, et le Confort

  -- une demande Essentiel, qu'après 30 s sans preneur.

  if v_target is null and v_drv_cat is not null and v_req_cat is not null then

    if (v_drv_cat = 'premium' and v_req_cat = 'essentiel')

       or (v_drv_cat = 'premium' and v_req_cat = 'confort'

           and v_req_at > now() - interval '30 seconds')

       or (v_drv_cat = 'confort' and v_req_cat = 'essentiel'

           and v_req_at > now() - interval '30 seconds') then

      raise exception 'Cette course n''est pas encore ouverte à ta catégorie.';

    end if;

  end if;



  -- Priorité de proximité (course ordinaire uniquement) : les cercles s'ouvrent avec le temps.

  if v_target is null and v_req_at is not null and driver_row.current_location is not null

     and public._program_rule('prio_enabled') = 1 then

    if st_distance(driver_row.current_location, v_pickup)

       > public._ride_visible_radius_m(extract(epoch from (now() - v_req_at))) then

      raise exception 'Cette course n''est pas encore ouverte à votre distance.';

    end if;

  end if;



  v_dist_m := coalesce(

    st_distance(driver_row.current_location, v_pickup)::int,

    0

  );



  if driver_row.application_type = 'proprietaire' then

    new_driver_cash := floor(total * 0.80)::int;

    new_driver_rachat := 0;

    new_dealer_share := 0;

    new_platform := total - new_driver_cash;

  else

    new_driver_cash := floor(total * 0.40)::int;

    new_driver_rachat := floor(total * 0.05)::int;

    new_dealer_share := floor(total * 0.30)::int;

    new_platform := total - new_driver_cash - new_driver_rachat - new_dealer_share;

  end if;



  update public.rides

  set driver_id = driver_row.id,

      vehicle_id = driver_row.current_vehicle_id,

      dealer_partner_id = case

        when driver_row.application_type = 'proprietaire' then null

        else dealer_id

      end,

      driver_share_fcfa = new_driver_cash,

      driver_rachat_fcfa = new_driver_rachat,

      dealer_share_fcfa = new_dealer_share,

      platform_share_fcfa = new_platform,

      driver_location_at_match = driver_row.current_location,

      driver_distance_at_match_m = v_dist_m,

      status = 'matched',

      matched_at = now(),

      updated_at = now()

  where id = ride_id

    and status = 'requested'

    and driver_id is null

  returning * into result;



  if result is null then raise exception 'Ride already taken or unavailable'; end if;

  return result;

end;

$function$;

-- driver_depart_from_stop
CREATE OR REPLACE FUNCTION public.driver_depart_from_stop(p_stop_id uuid)
 RETURNS ride_stops
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.ride_stops;
  waiting_s int;
  extra_min int;
  fee int := 0;
  new_total int;
  result public.ride_stops;
  driver_app_type driver_application_type;
  ride_row public.rides;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer int;
  new_platform int;
begin
  s := public._assert_stop_driver(p_stop_id);
  if s.status <> 'arrived' then raise exception 'Chauffeur pas encore arrivé'; end if;

  waiting_s := extract(epoch from (now() - s.arrived_at))::int;
  if waiting_s > 180 then
    extra_min := ceil((waiting_s - 180) / 60.0)::int;
    fee := extra_min * 40;
  end if;

  update public.ride_stops
  set status = 'departed', departed_at = now(),
      waiting_seconds = waiting_s, waiting_extra_fee_fcfa = fee
  where id = p_stop_id
  returning * into result;

  if fee > 0 then
    select * into ride_row from public.rides where id = s.ride_id;
    if ride_row.driver_id is not null then
      select application_type into driver_app_type from public.drivers where id = ride_row.driver_id;
    end if;
    new_total := public.ceil_to_50(ride_row.price_total_fcfa + fee);
    if driver_app_type = 'proprietaire' then
      new_driver_cash := floor(new_total * 0.80)::int;
      new_driver_rachat := 0;
      new_dealer := 0;
      new_platform := new_total - new_driver_cash;
    else
      new_driver_cash := floor(new_total * 0.40)::int;
      new_driver_rachat := floor(new_total * 0.05)::int;
      new_dealer := floor(new_total * 0.30)::int;
      new_platform := new_total - new_driver_cash - new_driver_rachat - new_dealer;
    end if;
    update public.rides
    set price_total_fcfa = new_total,
        stops_waiting_fee_fcfa = stops_waiting_fee_fcfa + fee,
        driver_share_fcfa = new_driver_cash,
        driver_rachat_fcfa = new_driver_rachat,
        dealer_share_fcfa = new_dealer,
        platform_share_fcfa = new_platform,
        updated_at = now()
    where id = s.ride_id;
  end if;

  return result;
end;
$function$;

-- credit_wallets_on_ride_complete
CREATE OR REPLACE FUNCTION public.credit_wallets_on_ride_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        if rides_before_this >= bonus_threshold and public._legacy_ride_bonus_on() then
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
      -- Split fonds rachat (inchangé)
      if driver_app_type = 'cession' and new.driver_rachat_fcfa > 0 then
        months_active := extract(epoch from (now() - driver_created_at)) / (30.0 * 86400);
        platform_rachat_share_pct := 0;   -- plan v6 : tout le fonds de rachat (5 %) reste au nom du chauffeur, sans prélèvement ni avance de démarrage
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
$function$;

-- Prélèvement « maintien en flotte » arrêté ----------------------------------------------------------------------------------------
update public.program_rules set value = 0 where key like 'upkeep\_permille\_%';
update public.program_rules
   set label = replace(label, 'Maintien en flotte :', 'ABANDONNÉ (clé du plan v6, mettre à 0) — maintien en flotte :')
 where key like 'upkeep\_permille\_%' and label not like 'ABANDONNÉ%';

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'upkeep-monthly') then perform cron.unschedule('upkeep-monthly'); end if;
end
$do$;

comment on function public._charge_upkeep(date) is
  'Abandonné le 2026-10-19 (clé 30 / 5 / solde du plan v6) : la tâche planifiée est retirée et tous les réglages upkeep_permille_* valent 0.';

-- Part de TamCar sur le volume des voitures : 25 % (20 % de commission + 5 % de gestion), au lieu de 23 % (utilisée pour plafonner les primes d'approche) --
update public.program_rules set value = 25 where key in ('share_essentiel', 'share_confort');
update public.program_rules set label = 'Part de TamCar sur le volume : voiture Essentiel (%) — 25 % depuis la clé du plan v6' where key = 'share_essentiel';
update public.program_rules set label = 'Part de TamCar sur le volume : voiture Confort (%) — 25 % depuis la clé du plan v6' where key = 'share_confort';
