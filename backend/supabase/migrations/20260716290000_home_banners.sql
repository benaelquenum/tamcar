-- ============================================================
-- Bannières de communication sur la home client (2026-07-16)
-- Admin crée/modifie/désactive, lecture publique restreinte aux bannières actives.
-- ============================================================

create table public.home_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text,
  link_url text,
  cta_text text,
  gradient text default 'from-primary-500 to-primary-700',
  display_order int not null default 0,
  is_active boolean not null default true,
  active_from timestamptz,
  active_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index home_banners_active_idx on public.home_banners(display_order)
  where is_active = true;

create trigger home_banners_updated_at
  before update on public.home_banners
  for each row execute function public.set_updated_at();

alter table public.home_banners enable row level security;

create policy home_banners_read_active_or_admin on public.home_banners for select
  using (
    public.is_admin()
    or (
      is_active = true
      and (active_from is null or active_from <= now())
      and (active_until is null or active_until >= now())
    )
  );

create policy home_banners_admin_write on public.home_banners for all
  using (public.is_admin())
  with check (public.is_admin());
