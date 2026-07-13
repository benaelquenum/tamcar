-- ============================================================
-- TamCar — Initial schema
-- Extensions, enums, tables, indexes, triggers
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "postgis";
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
create type user_role as enum ('client', 'driver', 'dealer', 'admin');
create type driver_status as enum ('pending', 'active', 'suspended');
create type vehicle_status as enum ('active', 'maintenance', 'retired');
create type kyc_status as enum ('pending', 'submitted', 'approved', 'rejected');
create type ride_status as enum (
  'requested',           -- client a posté, en attente d'un chauffeur
  'matched',             -- chauffeur a accepté, en route vers pickup
  'arrived',             -- chauffeur au point de prise en charge
  'in_progress',         -- client à bord
  'completed',           -- terminée, paiement effectué
  'cancelled_by_client',
  'cancelled_by_driver',
  'expired'              -- aucun chauffeur trouvé
);
create type payment_method as enum ('cash', 'mobile_money_mtn', 'mobile_money_moov', 'tamcar_credit');
create type wallet_kind as enum ('tamcar_credit', 'tamcar_revenus');
create type wallet_tx_type as enum (
  'topup',                 -- rechargement TamCar Crédit
  'payment',               -- paiement d'une course depuis TamCar Crédit
  'withdrawal',            -- retrait TamCar Revenus vers Mobile Money
  'refund',                -- remboursement client
  'revenue_share_credit',  -- crédit part chauffeur/concessionnaire fin de course
  'adjustment'             -- ajustement manuel admin
);
create type wallet_tx_status as enum ('pending', 'success', 'failed');
create type mobile_money_provider as enum ('mtn', 'moov', 'internal');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique not null,
  full_name text not null,
  role user_role not null default 'client',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- dealer_partners ----------
create table public.dealer_partners (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  company_name text not null,
  rccm text,                                        -- numéro RCCM béninois
  dealer_share_pct numeric(5,2) not null default 25.0
    check (dealer_share_pct >= 0 and dealer_share_pct <= 100),
  is_shareholder boolean not null default false,    -- true = actionnaire SARL
  shareholder_pct numeric(5,2)
    check (shareholder_pct is null or (shareholder_pct >= 0 and shareholder_pct <= 100)),
  created_at timestamptz not null default now()
);

-- ---------- drivers ----------
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  status driver_status not null default 'pending',
  license_number text,
  id_card_number text,
  kyc_status kyc_status not null default 'pending',
  is_online boolean not null default false,
  current_location geography(point, 4326),
  current_vehicle_id uuid,                          -- FK ajoutée après création de vehicles
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- vehicles ----------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  dealer_partner_id uuid not null references public.dealer_partners(id) on delete restrict,
  plate_number text not null unique,
  brand text not null,
  model text not null,
  year int,
  color text,
  seats int not null default 4 check (seats > 0),
  status vehicle_status not null default 'active',
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drivers
  add constraint drivers_current_vehicle_fk
  foreign key (current_vehicle_id)
  references public.vehicles(id)
  on delete set null;

-- ---------- rides ----------
create table public.rides (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  dealer_partner_id uuid references public.dealer_partners(id) on delete set null,

  pickup_location geography(point, 4326) not null,
  pickup_address text not null,
  dropoff_location geography(point, 4326) not null,
  dropoff_address text not null,
  distance_km numeric(6,2),
  duration_min int,

  -- Prix figé au moment de la commande
  price_total_fcfa int not null check (price_total_fcfa >= 0),
  driver_share_fcfa int not null default 0 check (driver_share_fcfa >= 0),
  dealer_share_fcfa int not null default 0 check (dealer_share_fcfa >= 0),
  platform_share_fcfa int not null default 0 check (platform_share_fcfa >= 0),

  status ride_status not null default 'requested',
  payment_method payment_method,

  -- Non-null pour réservation à l'avance (corridor Cotonou-Porto-Novo)
  scheduled_at timestamptz,

  requested_at timestamptz not null default now(),
  matched_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rides_shares_sum
    check (driver_share_fcfa + dealer_share_fcfa + platform_share_fcfa = price_total_fcfa)
);

-- ---------- wallets ----------
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind wallet_kind not null,
  balance_fcfa int not null default 0 check (balance_fcfa >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, kind)
);

-- ---------- wallet_transactions ----------
create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  type wallet_tx_type not null,
  -- Positif pour crédits (topup, revenue_share_credit, refund)
  -- Négatif pour débits (payment, withdrawal)
  amount_fcfa int not null,
  ride_id uuid references public.rides(id) on delete set null,
  provider mobile_money_provider not null default 'internal',
  external_ref text,                       -- ID transaction MTN / Moov côté opérateur
  status wallet_tx_status not null default 'pending',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- ratings ----------
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  rated_id uuid not null references public.profiles(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (ride_id, rater_id)
);

-- ---------- Indexes ----------
create index profiles_phone_idx on public.profiles(phone);
create index profiles_role_idx on public.profiles(role);

create index drivers_status_idx on public.drivers(status);
create index drivers_online_idx on public.drivers(is_online) where is_online = true;
create index drivers_location_gix on public.drivers using gist(current_location)
  where is_online = true and current_location is not null;

create index vehicles_dealer_idx on public.vehicles(dealer_partner_id);
create index vehicles_status_idx on public.vehicles(status);

create index rides_client_idx on public.rides(client_id, created_at desc);
create index rides_driver_idx on public.rides(driver_id, created_at desc);
create index rides_dealer_idx on public.rides(dealer_partner_id, created_at desc);
create index rides_status_idx on public.rides(status);
create index rides_scheduled_idx on public.rides(scheduled_at)
  where scheduled_at is not null and status = 'requested';

create index wallets_profile_idx on public.wallets(profile_id);
create index wallet_tx_wallet_idx on public.wallet_transactions(wallet_id, created_at desc);
create index wallet_tx_ride_idx on public.wallet_transactions(ride_id);

create index ratings_rated_idx on public.ratings(rated_id);

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger drivers_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

create trigger vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

create trigger rides_updated_at
  before update on public.rides
  for each row execute function public.set_updated_at();

create trigger wallets_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();
