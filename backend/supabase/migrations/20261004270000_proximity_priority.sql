-- Priorité de proximité : une course s'ouvre par cercles successifs autour du client.
--
-- Avant : tous les chauffeurs en ligne à moins de 10 km voyaient la course en même temps et le plus
-- rapide la prenait — un chauffeur à 8 km pouvait passer devant un chauffeur à 400 m, avec une prime
-- d'approche à la clé. Maintenant (réglable dans « Bonus et cotisations » du back-office) :
--     0 s  : chauffeurs à moins de 2 km
--    10 s  : jusqu'à 5 km
--    20 s  : jusqu'à 10 km
--    40 s  : jusqu'à 15 km (ceux-là touchent la prime d'approche)
-- Le délai part de `requested_at` (remis à zéro à la relance du client, comme la cascade de catégories).
-- Le même calendrier gouverne : le pool affiché au chauffeur, la notification push, et un garde-fou
-- à l'acceptation (une application contournée ne passe pas devant). Les courses directes (chauffeur
-- visé) ne sont pas concernées. `prio_enabled = 0` rétablit l'ancien comportement (10 km pour tous).

insert into public.program_rules (key, value, label) values
  ('prio_enabled', 1,     'Priorité de proximité : 1 = active, 0 = désactivée (tous les chauffeurs à moins de 10 km voient la course tout de suite)'),
  ('prio_r1_m',    2000,  'Priorité de proximité : rayon des chauffeurs qui voient la course tout de suite (m)'),
  ('prio_r2_m',    5000,  'Priorité de proximité : 2e cercle (m)'),
  ('prio_d2_s',    10,    'Priorité de proximité : délai avant l''ouverture du 2e cercle (s)'),
  ('prio_r3_m',    10000, 'Priorité de proximité : 3e cercle (m)'),
  ('prio_d3_s',    20,    'Priorité de proximité : délai avant l''ouverture du 3e cercle (s)'),
  ('prio_r4_m',    15000, 'Priorité de proximité : dernier cercle (m)'),
  ('prio_d4_s',    40,    'Priorité de proximité : délai avant l''ouverture du dernier cercle (s)')
on conflict (key) do nothing;

-- Contrôles à la saisie dans le back-office.
create or replace function public.admin_set_program_rule(p_key text, p_value int)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_value is null or p_value < 0 then raise exception 'Valeur invalide'; end if;
  if (p_key like 'share_%' or p_key in ('surplus_cede_pct', 'tamassur_fund_pct')) and p_value > 100 then
    raise exception 'Un pourcentage ne peut pas dépasser 100.';
  end if;
  if p_key like 'tamassur_%' and p_key <> 'tamassur_fund_pct' and p_value < 100 then
    raise exception 'Une cotisation quotidienne doit être d''au moins 100 F.';
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

-- Rayon visible (m) pour une course demandée depuis p_elapsed_s secondes : le plus grand des cercles ouverts.
create or replace function public._ride_visible_radius_m(p_elapsed_s double precision)
returns int language sql stable security definer set search_path = public as $fn$
  select case when public._program_rule('prio_enabled') = 1 then
    greatest(
      public._program_rule('prio_r1_m'),
      case when p_elapsed_s >= public._program_rule('prio_d2_s') then public._program_rule('prio_r2_m') else 0 end,
      case when p_elapsed_s >= public._program_rule('prio_d3_s') then public._program_rule('prio_r3_m') else 0 end,
      case when p_elapsed_s >= public._program_rule('prio_d4_s') then public._program_rule('prio_r4_m') else 0 end)
  else 10000 end;
$fn$;
revoke execute on function public._ride_visible_radius_m(double precision) from public, anon, authenticated;

-- Calendrier lu par l'application chauffeur (relecture du pool à chaque ouverture de cercle).
create or replace function public.ride_ring_plan()
returns table (enabled boolean, d2_s int, d3_s int, d4_s int)
language sql stable security definer set search_path = public as $fn$
  select public._program_rule('prio_enabled') = 1,
         public._program_rule('prio_d2_s'), public._program_rule('prio_d3_s'), public._program_rule('prio_d4_s');
$fn$;
revoke execute on function public.ride_ring_plan() from public, anon;
grant execute on function public.ride_ring_plan() to authenticated;

-- Rayon déjà notifié par push pour cette course (évite les doublons à l'ouverture des cercles).
alter table public.rides add column if not exists notified_radius_m int;


-- Pool des chauffeurs -----------------------------------------------------
create or replace function public.pending_rides_for_driver(
  radius_km double precision default 10.0
)
returns table (
  id uuid,
  pickup_address text,
  dropoff_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  distance_from_driver_m double precision,
  distance_km numeric,
  duration_min int,
  price_total_fcfa int,
  driver_share_fcfa int,
  requested_at timestamptz,
  requested_category vehicle_category,
  downgrade_accepted_at timestamptz,
  is_below_driver_category boolean
)
language plpgsql security invoker as $fn_pending$
#variable_conflict use_column
declare
  v_drv_id uuid;
  v_drv_loc geography;
  v_drv_category vehicle_category;
  v_active_dropoff geography;
  v_active_count int;
  v_search_origin geography;
  v_effective_radius double precision;
begin
  -- Piggy-back : libère les scheduled dues
  perform public._release_due_scheduled_rides();

  select d.id, d.current_location, v.category
    into v_drv_id, v_drv_loc, v_drv_category
  from public.drivers d
  left join public.vehicles v on v.id = d.current_vehicle_id
  where d.profile_id = auth.uid()
    and d.is_online = true
    and d.status = 'active'
  limit 1;

  if v_drv_id is null or v_drv_loc is null or v_drv_category is null then
    return;
  end if;

  select count(*)::int into v_active_count
   from public.rides r
   where r.driver_id = v_drv_id
     and r.status in ('matched', 'arrived', 'in_progress');
  if v_active_count >= 2 then return; end if;

  if v_active_count = 1 then
    select r.dropoff_location into v_active_dropoff
     from public.rides r
     where r.driver_id = v_drv_id
       and r.status in ('matched', 'arrived', 'in_progress')
     order by r.matched_at asc limit 1;
  end if;

  if v_active_dropoff is not null then
    v_search_origin := v_active_dropoff;
    v_effective_radius := 3.0;
  else
    v_search_origin := v_drv_loc;
    v_effective_radius := radius_km;
  end if;

  return query
  select
    r.id, r.pickup_address, r.dropoff_address,
    st_y(r.pickup_location::geometry) as pickup_lat,
    st_x(r.pickup_location::geometry) as pickup_lng,
    st_y(r.dropoff_location::geometry) as dropoff_lat,
    st_x(r.dropoff_location::geometry) as dropoff_lng,
    st_distance(r.pickup_location, v_search_origin) as distance_from_driver_m,
    r.distance_km, r.duration_min,
    r.price_total_fcfa, r.driver_share_fcfa,
    r.requested_at,
    r.requested_category, r.downgrade_accepted_at,
    (
      (v_drv_category = 'confort' and r.requested_category = 'essentiel')
      or (v_drv_category = 'premium' and r.requested_category = 'confort')
    ) as is_below_driver_category
  from public.rides r
  where r.status = 'requested'
    and r.driver_id is null
    and r.requested_driver_id is null
    -- Priorité de proximité : le rayon visible grandit avec l'ancienneté de la demande.
    and st_dwithin(
          r.pickup_location, v_search_origin,
          case
            when v_active_dropoff is not null then v_effective_radius * 1000
            when public._program_rule('prio_enabled') = 1
              then public._ride_visible_radius_m(extract(epoch from (now() - r.requested_at)))
            else v_effective_radius * 1000
          end)
    and (
      v_drv_category = r.requested_category
      -- Catégorie inférieure : seulement après 30 s sans preneur.
      or (
        r.requested_at <= now() - interval '30 seconds'
        and (
          (v_drv_category = 'confort' and r.requested_category = 'essentiel')
          or (v_drv_category = 'premium' and r.requested_category = 'confort')
        )
      )
    )
    -- Calendrier : la course (approche ~10 min + durée) ne doit pas toucher une location.
    and not public._my_rental_conflict(
      now(), now() + make_interval(mins => coalesce(r.duration_min, 15) + 10)
    )
  order by st_distance(r.pickup_location, v_search_origin) asc
  limit 20;
end;
$fn_pending$;

-- Garde-fou à l'acceptation ---------------------------------------------------
create or replace function public.accept_ride(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
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
    new_driver_rachat := floor(total * 0.10)::int;
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
$$;

-- Notification à la création -------------------------------------------------
create or replace function public._notify_matching_drivers(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn_nmd$
declare
  r public.rides;
  drv record;
  category_label text;
  v_radius int;
begin
  select * into r from public.rides where id = p_ride_id;
  if r is null or r.status <> 'requested' then return; end if;
  -- Course directe : jamais en alerte générale.
  if r.requested_driver_id is not null then return; end if;

  category_label := case r.requested_category
    when 'moto'      then 'Moto'
    when 'tricycle'  then 'Tricycle'
    when 'essentiel' then 'Essentiel'
    when 'confort'   then 'Confort'
    when 'premium'   then 'VIP'
    else initcap(r.requested_category::text)
  end;

  -- Priorité de proximité : seul le premier cercle est alerté d'emblée ; les cercles suivants le
  -- sont à leur ouverture (_push_ring_openings).
  v_radius := public._ride_visible_radius_m(0);
  update public.rides set notified_radius_m = v_radius where id = p_ride_id;

  -- Seuls les chauffeurs de la catégorie demandée sont alertés d'emblée. Les
  -- catégories supérieures voient la demande dans leur pool après 30 s.
  for drv in
    select d.profile_id
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.is_online = true
      and d.status = 'active'
      and v.category = r.requested_category
      -- Position inconnue = notifié quand même (il jugera lui-même)
      and (d.current_location is null
           or st_dwithin(d.current_location, r.pickup_location, v_radius))
  loop
    perform public._push_notify(
      drv.profile_id,
      '🚗 Nouvelle course ' || category_label,
      'Un client attend près de vous. Ouvrez TamCar pour accepter.',
      '/',
      'new-ride:' || p_ride_id::text,
      true
    );
  end loop;
end;
$fn_nmd$;
revoke all on function public._notify_matching_drivers(uuid) from public, anon, authenticated;


-- Notification des cercles suivants : toutes les 5 s, les chauffeurs qui entrent dans le rayon visible
-- (et pas dans le précédent) reçoivent l'alerte.
create or replace function public._push_ring_openings()
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
  drv record;
  v_new int;
  v_label text;
  v_pushed int := 0;
begin
  if public._program_rule('prio_enabled') <> 1 then return 0; end if;

  for r in
    select id, pickup_location, requested_category, requested_at, coalesce(notified_radius_m, 0) as done
      from public.rides
     where status = 'requested' and driver_id is null and requested_driver_id is null
       and requested_at > now() - interval '5 minutes'
  loop
    v_new := public._ride_visible_radius_m(extract(epoch from (now() - r.requested_at)));
    if v_new <= r.done then continue; end if;

    v_label := case r.requested_category
      when 'moto' then 'Moto' when 'tricycle' then 'Tricycle' when 'essentiel' then 'Essentiel'
      when 'confort' then 'Confort' when 'premium' then 'VIP'
      else initcap(r.requested_category::text) end;

    for drv in
      select d.profile_id
        from public.drivers d
        join public.vehicles v on v.id = d.current_vehicle_id
       where d.is_online = true and d.status = 'active'
         and v.category = r.requested_category
         and d.current_location is not null
         and st_dwithin(d.current_location, r.pickup_location, v_new)
         and not st_dwithin(d.current_location, r.pickup_location, r.done)
    loop
      perform public._push_notify(
        drv.profile_id,
        '🚗 Nouvelle course ' || v_label,
        'Un client attend. Ouvrez TamCar pour accepter.',
        '/',
        'new-ride:' || r.id::text,
        true
      );
      v_pushed := v_pushed + 1;
    end loop;

    update public.rides set notified_radius_m = v_new where id = r.id;
  end loop;
  return v_pushed;
end;
$fn$;
revoke execute on function public._push_ring_openings() from public, anon, authenticated;

select cron.schedule('ride-ring-push', '5 seconds', $$select public._push_ring_openings()$$);
