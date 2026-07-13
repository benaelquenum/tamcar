-- ============================================================
-- TamCar — Fonctions métier
-- Dispatch chauffeur, revenue-share, wallets automatiques
-- ============================================================

-- ---------- find_nearby_drivers ----------
-- Retourne les chauffeurs en ligne + actifs + avec véhicule assigné,
-- dans un rayon donné autour du point de prise en charge,
-- triés par distance croissante.
create or replace function public.find_nearby_drivers(
  pickup_lat double precision,
  pickup_lng double precision,
  radius_km double precision default 3.0,
  limit_count int default 10
)
returns table (
  driver_id uuid,
  profile_id uuid,
  distance_m double precision,
  rating_avg numeric,
  vehicle_id uuid
)
language sql stable as $$
  select
    d.id as driver_id,
    d.profile_id,
    st_distance(
      d.current_location,
      st_makepoint(pickup_lng, pickup_lat)::geography
    ) as distance_m,
    d.rating_avg,
    d.current_vehicle_id as vehicle_id
  from public.drivers d
  where d.is_online = true
    and d.status = 'active'
    and d.current_vehicle_id is not null
    and d.current_location is not null
    and st_dwithin(
      d.current_location,
      st_makepoint(pickup_lng, pickup_lat)::geography,
      radius_km * 1000
    )
  order by distance_m asc
  limit limit_count;
$$;

-- ---------- compute_revenue_share ----------
-- Split Option A : chauffeur 57% / concessionnaire 25% / plateforme 18%
-- La plateforme absorbe le résidu d'arrondi.
create or replace function public.compute_revenue_share(
  price_total_fcfa int,
  driver_pct numeric default 57.0,
  dealer_pct numeric default 25.0
)
returns table (
  driver_share int,
  dealer_share int,
  platform_share int
)
language plpgsql immutable as $$
declare
  driver_amt int;
  dealer_amt int;
  platform_amt int;
begin
  driver_amt   := floor(price_total_fcfa * driver_pct / 100.0)::int;
  dealer_amt   := floor(price_total_fcfa * dealer_pct / 100.0)::int;
  platform_amt := price_total_fcfa - driver_amt - dealer_amt;
  return query select driver_amt, dealer_amt, platform_amt;
end;
$$;

-- ---------- create_wallets_for_profile ----------
-- Trigger : à l'insert d'un profil, crée automatiquement les wallets adéquats.
create or replace function public.create_wallets_for_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Tout le monde a un TamCar Crédit (peut payer une course)
  insert into public.wallets (profile_id, kind, balance_fcfa)
    values (new.id, 'tamcar_credit', 0)
    on conflict (profile_id, kind) do nothing;

  -- Chauffeurs et concessionnaires ont aussi un TamCar Revenus
  if new.role in ('driver', 'dealer') then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (new.id, 'tamcar_revenus', 0)
      on conflict (profile_id, kind) do nothing;
  end if;

  return new;
end;
$$;

create trigger profiles_create_wallets
  after insert on public.profiles
  for each row execute function public.create_wallets_for_profile();

-- ---------- update_driver_rating ----------
-- Recalcule rating_avg + rating_count du chauffeur à chaque notation
-- reçue (rated est un chauffeur).
create or replace function public.update_driver_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_driver_id uuid;
  v_avg numeric;
  v_count int;
begin
  select id into v_driver_id
    from public.drivers
    where profile_id = new.rated_id;

  if v_driver_id is null then
    return new;  -- rated_id n'est pas un chauffeur (client noté par chauffeur)
  end if;

  select coalesce(avg(stars), 0)::numeric(3,2), count(*)
    into v_avg, v_count
    from public.ratings r
    join public.rides ri on ri.id = r.ride_id
    where ri.driver_id = v_driver_id;

  update public.drivers
    set rating_avg = v_avg, rating_count = v_count, updated_at = now()
    where id = v_driver_id;

  return new;
end;
$$;

create trigger ratings_update_driver
  after insert on public.ratings
  for each row execute function public.update_driver_rating();
