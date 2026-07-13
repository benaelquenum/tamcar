-- ============================================================
-- TamCar — Row Level Security
-- Activation + policies pour chaque table
-- ============================================================

-- ---------- Enable RLS ----------
alter table public.profiles          enable row level security;
alter table public.dealer_partners   enable row level security;
alter table public.drivers           enable row level security;
alter table public.vehicles          enable row level security;
alter table public.rides             enable row level security;
alter table public.wallets           enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.ratings           enable row level security;

-- ---------- Helper ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- profiles ----------
-- Un user voit son profil + admin voit tout
create policy profiles_select on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- Un user peut créer son propre profil (post-signup)
create policy profiles_insert on public.profiles for insert
  with check (auth.uid() = id);

-- Un user peut modifier son propre profil (mais pas changer son rôle sans admin)
create policy profiles_update on public.profiles for update
  using (auth.uid() = id or public.is_admin());

-- ---------- dealer_partners ----------
-- Un concessionnaire voit ses propres infos + admin voit tout
create policy dealer_partners_select on public.dealer_partners for select
  using (profile_id = auth.uid() or public.is_admin());

-- ---------- drivers ----------
-- Un chauffeur voit ses propres infos + admin voit tout
-- (le client voit le nom du chauffeur via jointure sur rides — pas ici)
create policy drivers_select on public.drivers for select
  using (profile_id = auth.uid() or public.is_admin());

create policy drivers_update on public.drivers for update
  using (profile_id = auth.uid() or public.is_admin());

-- ---------- vehicles ----------
-- Un concessionnaire voit ses voitures ; un chauffeur voit sa voiture assignée ; admin tout
create policy vehicles_select on public.vehicles for select
  using (
    dealer_partner_id in (
      select id from public.dealer_partners where profile_id = auth.uid()
    )
    or id in (
      select current_vehicle_id from public.drivers
      where profile_id = auth.uid() and current_vehicle_id is not null
    )
    or public.is_admin()
  );

-- ---------- rides ----------
-- Le client, le chauffeur assigné, le concessionnaire propriétaire, et admin
create policy rides_select on public.rides for select
  using (
    client_id = auth.uid()
    or driver_id in (
      select id from public.drivers where profile_id = auth.uid()
    )
    or dealer_partner_id in (
      select id from public.dealer_partners where profile_id = auth.uid()
    )
    or public.is_admin()
  );

-- Le client peut créer une course pour lui-même
create policy rides_insert on public.rides for insert
  with check (client_id = auth.uid());

-- Update autorisé au client (pour annulation) et chauffeur (pour statut) et admin
create policy rides_update on public.rides for update
  using (
    client_id = auth.uid()
    or driver_id in (
      select id from public.drivers where profile_id = auth.uid()
    )
    or public.is_admin()
  );

-- ---------- wallets ----------
create policy wallets_select on public.wallets for select
  using (profile_id = auth.uid() or public.is_admin());

-- ---------- wallet_transactions ----------
create policy wallet_transactions_select on public.wallet_transactions for select
  using (
    wallet_id in (select id from public.wallets where profile_id = auth.uid())
    or public.is_admin()
  );

-- ---------- ratings ----------
-- Toute personne impliquée dans la course peut voir la notation
create policy ratings_select on public.ratings for select
  using (
    ride_id in (
      select id from public.rides
      where client_id = auth.uid()
        or driver_id in (select id from public.drivers where profile_id = auth.uid())
    )
    or public.is_admin()
  );

-- Le rater peut poster sa note
create policy ratings_insert on public.ratings for insert
  with check (rater_id = auth.uid());
