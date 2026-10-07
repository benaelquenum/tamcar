-- ============================================================
-- TamCar — Traces des paiements Mobile Money (2026-10-07)
--
--   Chaque appel du webhook FedaPay et chaque vérification demandée par l'application laisse une ligne : on peut voir
--   si FedaPay a appelé, ce que TamCar a répondu et pourquoi (signature invalide, montant incohérent, déjà crédité...).
--   Écriture réservée aux fonctions serveur (service_role) ; lecture réservée aux administrateurs.
-- ============================================================
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  source text not null check (source in ('webhook', 'verify')),
  provider text not null default 'fedapay',
  event text,
  reference text,
  provider_tx_id text,
  amount_fcfa int,
  outcome text not null,   -- applied | declined | already | pending | ignored | bad_signature | no_reference | error
  detail text
);
create index if not exists payment_events_received_idx on public.payment_events (received_at desc);
create index if not exists payment_events_reference_idx on public.payment_events (reference) where reference is not null;

alter table public.payment_events enable row level security;
drop policy if exists payment_events_admin_select on public.payment_events;
create policy payment_events_admin_select on public.payment_events
  for select using ((select public.is_admin()));
revoke all on public.payment_events from anon, authenticated;
grant select on public.payment_events to authenticated;
