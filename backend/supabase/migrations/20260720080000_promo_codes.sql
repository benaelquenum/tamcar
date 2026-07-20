-- ============================================================
-- Codes promo TamCar.
--
-- Un code peut être :
--   - percent  : réduction en % (ex 20 → -20%)
--   - fixed    : réduction en F (ex 500 → -500 F)
--
-- Limites :
--   - max_uses_total : plafond global (ex 1000 utilisations max)
--   - max_uses_per_user : plafond par user (ex 1 = usage unique)
--   - valid_from / valid_until : fenêtre de validité
--   - active : kill switch admin
--
-- Prix plancher : la course finale ne peut pas descendre sous 200 F
-- (évite les courses gratuites accidentelles à cause d'un cumul).
-- ============================================================

do $$ begin
  create type promo_discount_type as enum ('percent', 'fixed');
exception when duplicate_object then null; end $$;

create table if not exists public.promo_codes (
  code text primary key,
  discount_type promo_discount_type not null,
  discount_value int not null check (discount_value > 0),
  max_uses_total int,
  max_uses_per_user int not null default 1,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table if not exists public.promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.promo_codes(code) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  ride_id uuid not null references public.rides(id) on delete cascade,
  discount_applied_fcfa int not null,
  created_at timestamptz not null default now()
);

create index if not exists promo_redemptions_code_idx on public.promo_code_redemptions(code);
create index if not exists promo_redemptions_profile_idx on public.promo_code_redemptions(profile_id);

alter table public.promo_codes enable row level security;
alter table public.promo_code_redemptions enable row level security;

-- Lecture des codes : ouvert (l'user doit pouvoir tester un code avant confirm)
drop policy if exists promo_codes_read on public.promo_codes;
create policy promo_codes_read on public.promo_codes for select using (true);

-- Écriture des codes : admin uniquement
drop policy if exists promo_codes_admin on public.promo_codes;
create policy promo_codes_admin on public.promo_codes for all
  using (public.is_admin()) with check (public.is_admin());

-- Redemptions : le user voit ses propres, admin voit tout
drop policy if exists promo_redemptions_read on public.promo_code_redemptions;
create policy promo_redemptions_read on public.promo_code_redemptions for select
  using (profile_id = auth.uid() or public.is_admin());

-- Colonne promo sur rides
alter table public.rides
  add column if not exists promo_code text references public.promo_codes(code) on delete set null,
  add column if not exists promo_discount_fcfa int not null default 0;
