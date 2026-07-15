-- ============================================================
-- TamCar — Housekeeping (2026-07-15)
--
-- 1. RLS sur pricing_tiers / checkpoints / corridor_prices
--    (SELECT public, WRITE admin only)
-- 2. profiles.phone → nullable (permet signup email sans téléphone)
-- 3. Trigger handle_new_user → auto-create profile à l'inscription auth
-- 4. compute_price v2 : prend MIN(standard, corridor+rabattement)
-- ============================================================

-- ------------------------------------------------------------
-- 1. RLS sur les tables de configuration tarifaire
-- ------------------------------------------------------------

alter table public.pricing_tiers   enable row level security;
alter table public.checkpoints     enable row level security;
alter table public.corridor_prices enable row level security;

-- SELECT public : nécessaire pour compute_price côté client + affichage catégories
create policy pricing_tiers_public_read on public.pricing_tiers
  for select using (true);
create policy checkpoints_public_read on public.checkpoints
  for select using (true);
create policy corridor_prices_public_read on public.corridor_prices
  for select using (true);

-- WRITE réservé aux admins (INSERT / UPDATE / DELETE)
create policy pricing_tiers_admin_write on public.pricing_tiers
  for insert with check (public.is_admin());
create policy pricing_tiers_admin_update on public.pricing_tiers
  for update using (public.is_admin()) with check (public.is_admin());
create policy pricing_tiers_admin_delete on public.pricing_tiers
  for delete using (public.is_admin());

create policy checkpoints_admin_write on public.checkpoints
  for insert with check (public.is_admin());
create policy checkpoints_admin_update on public.checkpoints
  for update using (public.is_admin()) with check (public.is_admin());
create policy checkpoints_admin_delete on public.checkpoints
  for delete using (public.is_admin());

create policy corridor_prices_admin_write on public.corridor_prices
  for insert with check (public.is_admin());
create policy corridor_prices_admin_update on public.corridor_prices
  for update using (public.is_admin()) with check (public.is_admin());
create policy corridor_prices_admin_delete on public.corridor_prices
  for delete using (public.is_admin());

-- ------------------------------------------------------------
-- 2. profiles.phone nullable (permet signup email-only)
-- ------------------------------------------------------------

alter table public.profiles alter column phone drop not null;

-- ------------------------------------------------------------
-- 3. Trigger handle_new_user : auto-create profile à l'inscription auth
--
-- Fire sur INSERT dans auth.users (schema auth, géré par Supabase Auth).
-- Puis create_wallets_for_profile fire à son tour sur INSERT dans profiles.
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, phone, full_name, role)
  values (
    new.id,
    new.phone,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email, 'utilisateur'), '@', 1)
    ),
    'client'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 4. compute_price v2 : MIN(standard, corridor+rabattement)
--
-- Fix anomalie détectée le 2026-07-15 : sur trajets longs hors rayon
-- checkpoints, tarif standard peut être moins cher que corridor+rabattement.
-- v2 calcule TOUJOURS le standard + calcule le corridor si disponible,
-- puis retient le moins cher (client-friendly).
-- ------------------------------------------------------------

create or replace function public.compute_price(
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  distance_km numeric,
  duration_min int,
  p_category vehicle_category default 'essentiel',
  is_night boolean default false,
  with_ac boolean default false
)
returns table (
  price_total_fcfa int,
  driver_cash_fcfa int,
  driver_rachat_fcfa int,
  dealer_share_fcfa int,
  platform_share_fcfa int,
  is_corridor boolean,
  corridor_detail jsonb
)
language plpgsql stable as $$
declare
  tier public.pricing_tiers%rowtype;
  c1 record;
  c2 record;
  corridor_row record;
  pickup_point geography;
  dropoff_point geography;
  pre_km numeric := 0;
  post_km numeric := 0;
  pre_price int := 0;
  post_price int := 0;
  fixed_price int := 0;
  corridor_total int := 0;
  extra_km numeric;
  extra_min int;
  standard_price int;
  ac_fee int := 0;
  total int;
  v_driver_cash int;
  v_driver_rachat int;
  v_dealer int;
  v_platform int;
  is_c boolean := false;
  corridor_json jsonb := null;
begin
  select * into tier from public.pricing_tiers where category = p_category;
  if not found then
    raise exception 'Unknown vehicle_category: %', p_category;
  end if;

  pickup_point  := st_setsrid(st_makepoint(pickup_lng, pickup_lat), 4326)::geography;
  dropoff_point := st_setsrid(st_makepoint(dropoff_lng, dropoff_lat), 4326)::geography;

  -- Toujours calculer le tarif standard (base de comparaison)
  extra_km  := greatest(0, distance_km - tier.base_covers_km);
  extra_min := greatest(0, duration_min - tier.base_covers_min);
  standard_price := tier.base_fcfa + greatest(
    ceil(extra_km * tier.km_city_fcfa)::int,
    extra_min * tier.min_fcfa
  );
  standard_price := greatest(standard_price, tier.min_course_fcfa);

  -- Chercher checkpoints proches
  select id, code, name, location, radius_km into c1
  from public.checkpoints
  where st_dwithin(location, pickup_point, radius_km * 1000)
  order by st_distance(location, pickup_point)
  limit 1;

  select id, code, name, location, radius_km into c2
  from public.checkpoints
  where st_dwithin(location, dropoff_point, radius_km * 1000)
  order by st_distance(location, dropoff_point)
  limit 1;

  -- Corridor tarifé disponible pour cette catégorie ?
  if c1.id is not null and c2.id is not null and c1.id <> c2.id then
    select from_checkpoint_id, to_checkpoint_id, price_day_fcfa, price_night_fcfa
      into corridor_row
    from public.corridor_prices
    where from_checkpoint_id = c1.id
      and to_checkpoint_id   = c2.id
      and category           = p_category;

    if corridor_row.from_checkpoint_id is not null then
      fixed_price := case when is_night
                          then corridor_row.price_night_fcfa
                          else corridor_row.price_day_fcfa end;

      pre_km := round((st_distance(pickup_point, c1.location) / 1000.0)::numeric, 2);
      if pre_km > 0.1 then
        pre_price := ceil(pre_km * tier.km_city_fcfa)::int;
      end if;

      post_km := round((st_distance(dropoff_point, c2.location) / 1000.0)::numeric, 2);
      if post_km > 0.1 then
        post_price := ceil(post_km * tier.km_city_fcfa)::int;
      end if;

      corridor_total := pre_price + fixed_price + post_price;

      -- MIN : le client paie toujours le meilleur prix
      if corridor_total <= standard_price then
        is_c := true;
        total := corridor_total;
        corridor_json := jsonb_build_object(
          'from_checkpoint',   c1.name,
          'to_checkpoint',     c2.name,
          'pre_km',            pre_km,
          'pre_price_fcfa',    pre_price,
          'fixed_price_fcfa',  fixed_price,
          'post_km',           post_km,
          'post_price_fcfa',   post_price,
          'is_night',          is_night
        );
      end if;
    end if;
  end if;

  -- Fallback tarif standard si pas de corridor OU corridor plus cher
  if not is_c then
    total := standard_price;
  end if;

  -- Climatisation optionnelle (Essentiel uniquement)
  if with_ac and p_category = 'essentiel' then
    ac_fee := tier.ac_extra_fcfa;
    total  := total + ac_fee;
  end if;

  -- Split revenue-share avec cession (52/5/28/15)
  v_driver_cash   := floor(total * 0.52)::int;
  v_driver_rachat := floor(total * 0.05)::int;
  v_dealer        := floor(total * 0.28)::int;
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
