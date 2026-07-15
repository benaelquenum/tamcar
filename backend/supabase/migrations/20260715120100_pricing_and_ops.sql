-- ============================================================
-- TamCar — Pricing engine + checkpoints + revenue-share v2
--
-- Implémente les décisions produit du 2026-07-15 (voir memory
-- project_tamcar_pricing_and_ops.md) :
--   1. Catégories véhicules (essentiel / confort / premium)
--   2. Grille tarifaire par catégorie (pricing_tiers)
--   3. Checkpoints corridor + prix fixes
--   4. Fonction compute_price(...) qui gère rabattements + corridor fixe
--   5. Split revenue-share 52% cash + 5% rachat + 28% concess. + 15% plateforme
--   6. Trigger create_wallets_for_profile étendu pour le fonds rachat
-- ============================================================

-- ------------------------------------------------------------
-- 1. Catégorie sur vehicles
-- ------------------------------------------------------------

alter table public.vehicles
  add column category vehicle_category not null default 'essentiel';

create index vehicles_category_idx on public.vehicles(category);

-- ------------------------------------------------------------
-- 2. pricing_tiers — grille tarifaire par catégorie
-- ------------------------------------------------------------

create table public.pricing_tiers (
  category vehicle_category primary key,
  base_fcfa int not null check (base_fcfa > 0),
  base_covers_km numeric(3,1) not null default 3.0,
  base_covers_min int not null default 5,
  km_city_fcfa int not null check (km_city_fcfa > 0),
  km_corridor_fcfa int not null check (km_corridor_fcfa > 0),
  min_fcfa int not null check (min_fcfa >= 0),
  min_course_fcfa int not null check (min_course_fcfa > 0),
  ac_extra_fcfa int not null default 0 check (ac_extra_fcfa >= 0),
  km_daily_limit int not null default 200 check (km_daily_limit > 0),
  updated_at timestamptz not null default now()
);

insert into public.pricing_tiers
  (category,    base_fcfa, base_covers_km, base_covers_min, km_city_fcfa, km_corridor_fcfa, min_fcfa, min_course_fcfa, ac_extra_fcfa, km_daily_limit)
values
  ('essentiel',       700,            3.0,               5,           90,              160,       40,             700,           200,            200),
  ('confort',         900,            3.0,               5,          120,              210,       50,             900,             0,            200),
  ('premium',        1500,            3.0,               5,          180,              350,       80,            1500,             0,            150);

create trigger pricing_tiers_updated_at
  before update on public.pricing_tiers
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. checkpoints — points de rabattement corridor
-- ------------------------------------------------------------

create table public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  city text not null,
  location geography(point, 4326) not null,
  radius_km numeric(4,2) not null default 3.0 check (radius_km > 0),
  created_at timestamptz not null default now()
);

create index checkpoints_location_gix on public.checkpoints using gist(location);

-- Seed checkpoints v1
-- Tokpa (Dantokpa, Cotonou) — approx 6.3654°N, 2.4258°E
-- Assemblée nationale ancien siège (Porto-Novo) — Plus Code FJ99+RP, approx à
-- affiner via décodeur (~6.497°N, 2.603°E). Terence à confirmer avec Google Maps.
insert into public.checkpoints (code, name, city, location, radius_km) values
  ('TOKPA',  'Marché Dantokpa (Tokpa)',
             'Cotonou',
             st_setsrid(st_makepoint(2.4258, 6.3654), 4326)::geography,
             3.0),
  ('ASS_PN', 'Ancien siège Assemblée nationale (FJ99+RP)',
             'Porto-Novo',
             st_setsrid(st_makepoint(2.6030, 6.4970), 4326)::geography,
             3.0);

-- ------------------------------------------------------------
-- 4. corridor_prices — prix fixe entre 2 checkpoints par catégorie
-- ------------------------------------------------------------

create table public.corridor_prices (
  id uuid primary key default gen_random_uuid(),
  from_checkpoint_id uuid not null references public.checkpoints(id) on delete cascade,
  to_checkpoint_id uuid not null references public.checkpoints(id) on delete cascade,
  category vehicle_category not null,
  price_day_fcfa int not null check (price_day_fcfa > 0),
  price_night_fcfa int not null check (price_night_fcfa > 0),
  round_trip_price_day_fcfa int check (round_trip_price_day_fcfa is null or round_trip_price_day_fcfa > 0),
  round_trip_price_night_fcfa int check (round_trip_price_night_fcfa is null or round_trip_price_night_fcfa > 0),
  created_at timestamptz not null default now(),
  unique (from_checkpoint_id, to_checkpoint_id, category),
  check (from_checkpoint_id <> to_checkpoint_id)
);

create index corridor_prices_from_to_idx
  on public.corridor_prices(from_checkpoint_id, to_checkpoint_id);

-- Seed corridor Tokpa <-> Ass. PN, 2 directions x 3 catégories = 6 lignes
-- Package aller-retour uniquement en Essentiel pour l'instant.
with tokpa  as (select id from public.checkpoints where code = 'TOKPA'),
     ass_pn as (select id from public.checkpoints where code = 'ASS_PN')
insert into public.corridor_prices
  (from_checkpoint_id, to_checkpoint_id, category, price_day_fcfa, price_night_fcfa, round_trip_price_day_fcfa)
select tokpa.id,  ass_pn.id, 'essentiel'::vehicle_category, 4500,  6000,  8000 from tokpa, ass_pn union all
select tokpa.id,  ass_pn.id, 'confort'::vehicle_category,   6000,  7500,  null from tokpa, ass_pn union all
select tokpa.id,  ass_pn.id, 'premium'::vehicle_category,   9000, 12000,  null from tokpa, ass_pn union all
select ass_pn.id, tokpa.id,  'essentiel'::vehicle_category, 4500,  6000,  8000 from tokpa, ass_pn union all
select ass_pn.id, tokpa.id,  'confort'::vehicle_category,   6000,  7500,  null from tokpa, ass_pn union all
select ass_pn.id, tokpa.id,  'premium'::vehicle_category,   9000, 12000,  null from tokpa, ass_pn;

-- ------------------------------------------------------------
-- 5. rides — ajouter driver_rachat_fcfa et mettre à jour la contrainte
-- ------------------------------------------------------------

alter table public.rides
  add column driver_rachat_fcfa int not null default 0 check (driver_rachat_fcfa >= 0);

alter table public.rides
  drop constraint if exists rides_shares_sum;

alter table public.rides
  add constraint rides_shares_sum check (
    driver_share_fcfa + driver_rachat_fcfa + dealer_share_fcfa + platform_share_fcfa
      = price_total_fcfa
  );

-- Rename sémantique (optionnel, on garde driver_share pour compat mais on documente)
comment on column public.rides.driver_share_fcfa
  is 'Part CASH du chauffeur (52%), débitée sur TamCar Revenus';
comment on column public.rides.driver_rachat_fcfa
  is 'Part RACHAT du chauffeur (5%), séquestrée pour cession échelonnée voiture';

-- ------------------------------------------------------------
-- 6. Fonction compute_price
-- ------------------------------------------------------------
--
-- Retourne le prix total + la ventilation revenue-share + un flag corridor
-- avec détail JSON si le trajet emprunte un corridor tarifé.
--
-- Logique :
--   1. Trouver checkpoint C1 proche du pickup (≤ radius_km)
--   2. Trouver checkpoint C2 proche du dropoff (≤ radius_km)
--   3. Si (C1, C2) forme un corridor tarifé pour la catégorie :
--        prix = rabattement(A→C1) + prix_fixe(C1→C2) + rabattement(C2→B)
--   4. Sinon : prix = base + max(extra_km × km_city, extra_min × min_fcfa)
--      avec plancher à min_course_fcfa
--   5. Clim (+ac_extra_fcfa) si demandée ET catégorie essentiel
--   6. Split : 52% cash / 5% rachat / 28% concess / 15% plateforme
--      (plateforme absorbe le résidu d'arrondi)

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

  -- Checkpoint proche du pickup
  select id, code, name, location, radius_km into c1
  from public.checkpoints
  where st_dwithin(location, pickup_point, radius_km * 1000)
  order by st_distance(location, pickup_point)
  limit 1;

  -- Checkpoint proche du dropoff
  select id, code, name, location, radius_km into c2
  from public.checkpoints
  where st_dwithin(location, dropoff_point, radius_km * 1000)
  order by st_distance(location, dropoff_point)
  limit 1;

  -- Corridor valide ?
  if c1.id is not null and c2.id is not null and c1.id <> c2.id then
    select from_checkpoint_id, to_checkpoint_id, price_day_fcfa, price_night_fcfa
      into corridor_row
    from public.corridor_prices
    where from_checkpoint_id = c1.id
      and to_checkpoint_id   = c2.id
      and category           = p_category;

    if corridor_row.from_checkpoint_id is not null then
      is_c := true;
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

      total := pre_price + fixed_price + post_price;

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

  -- Fallback tarif standard si pas corridor
  if not is_c then
    extra_km  := greatest(0, distance_km - tier.base_covers_km);
    extra_min := greatest(0, duration_min - tier.base_covers_min);
    standard_price := tier.base_fcfa + greatest(
      ceil(extra_km * tier.km_city_fcfa)::int,
      extra_min * tier.min_fcfa
    );
    total := greatest(standard_price, tier.min_course_fcfa);
  end if;

  -- Climatisation optionnelle (Essentiel uniquement ; Confort/Premium incluent la clim)
  if with_ac and p_category = 'essentiel' then
    ac_fee := tier.ac_extra_fcfa;
    total  := total + ac_fee;
  end if;

  -- Split revenue-share avec cession
  --   Chauffeur cash    : 52%
  --   Chauffeur rachat  :  5%
  --   Concessionnaire   : 28%
  --   Plateforme        : 15%  (absorbe le résidu d'arrondi pour équilibrer la contrainte rides_shares_sum)
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

comment on function public.compute_price is
  'Calcule le prix d''une course + ventilation revenue-share (52/5/28/15). '
  'Gère automatiquement le tarif corridor (prix fixe checkpoint→checkpoint + rabattements) '
  'ou le tarif standard (base + max(km, min)). Voir memory tamcar-pricing-and-ops.';

-- ------------------------------------------------------------
-- 7. compute_revenue_share v2 (split 52/5/28/15)
-- ------------------------------------------------------------

drop function if exists public.compute_revenue_share(int, numeric, numeric);

create or replace function public.compute_revenue_share(
  price_total_fcfa int
)
returns table (
  driver_cash_fcfa int,
  driver_rachat_fcfa int,
  dealer_share_fcfa int,
  platform_share_fcfa int
)
language plpgsql immutable as $$
declare
  v_driver_cash int;
  v_driver_rachat int;
  v_dealer int;
  v_platform int;
begin
  v_driver_cash   := floor(price_total_fcfa * 0.52)::int;
  v_driver_rachat := floor(price_total_fcfa * 0.05)::int;
  v_dealer        := floor(price_total_fcfa * 0.28)::int;
  v_platform      := price_total_fcfa - v_driver_cash - v_driver_rachat - v_dealer;
  return query select v_driver_cash, v_driver_rachat, v_dealer, v_platform;
end;
$$;

comment on function public.compute_revenue_share is
  'Split revenue-share TamCar : 52% chauffeur cash + 5% chauffeur rachat + 28% concessionnaire + 15% plateforme. '
  'Plateforme absorbe le résidu d''arrondi.';

-- ------------------------------------------------------------
-- 8. Trigger create_wallets_for_profile étendu (fonds rachat pour drivers)
-- ------------------------------------------------------------

create or replace function public.create_wallets_for_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Tout le monde : TamCar Crédit (client peut payer une course)
  insert into public.wallets (profile_id, kind, balance_fcfa)
    values (new.id, 'tamcar_credit', 0)
    on conflict (profile_id, kind) do nothing;

  -- Chauffeurs + concessionnaires : TamCar Revenus
  if new.role in ('driver', 'dealer') then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (new.id, 'tamcar_revenus', 0)
      on conflict (profile_id, kind) do nothing;
  end if;

  -- Chauffeurs uniquement : TamCar Rachat (séquestre pour cession échelonnée)
  if new.role = 'driver' then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (new.id, 'tamcar_rachat', 0)
      on conflict (profile_id, kind) do nothing;
  end if;

  return new;
end;
$$;
