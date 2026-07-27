-- ============================================================
-- Bannières par AUDIENCE (2026-07-26)
-- Trois cibles : client / chauffeur (driver) / partenaire véhicule (dealer).
-- Étend home_banners (créée en 20260716290000) sans casser l'existant :
-- les bannières déjà présentes restent 'client' par défaut.
-- ============================================================

alter table public.home_banners
  add column if not exists audience text not null default 'client';

do $$
begin
  alter table public.home_banners
    add constraint home_banners_audience_chk
    check (audience in ('client', 'driver', 'dealer'));
exception
  when duplicate_object then null;
end $$;

create index if not exists home_banners_audience_idx
  on public.home_banners(audience, display_order)
  where is_active = true;

-- La policy de lecture existante (active_or_admin) couvre déjà toutes les
-- audiences : chaque app filtre par audience côté requête. Rien à changer côté RLS.
