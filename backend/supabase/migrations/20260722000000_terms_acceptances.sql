-- Consentement CGU + Politique de confidentialité (preuve horodatée et versionnée)
-- Chaque acceptation = 1 ligne par document (cgu / privacy), par version, par app.

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  doc text not null check (doc in ('cgu', 'privacy')),
  version text not null,
  app text not null check (app in ('client', 'driver')),
  accepted_at timestamptz not null default now(),
  unique (profile_id, doc, version, app)
);

create index if not exists terms_acceptances_profile_version_idx
  on public.terms_acceptances (profile_id, version);

alter table public.terms_acceptances enable row level security;

create policy terms_select_own on public.terms_acceptances
  for select to authenticated
  using (profile_id = auth.uid());

create policy terms_insert_own on public.terms_acceptances
  for insert to authenticated
  with check (profile_id = auth.uid());

-- Pas d'update/delete : une acceptation est immuable (valeur de preuve).
