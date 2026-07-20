-- ============================================================
-- Chat in-app entre client et chauffeur pendant une course active.
--
-- Ouvert pour les status : matched, arrived, in_progress
-- Fermé (lecture seule) pour : completed, cancelled_*
--
-- Realtime : les 2 côtés reçoivent les nouveaux messages via
-- Supabase Realtime (INSERT sur public.ride_messages).
--
-- Push notification déclenchée automatiquement à chaque nouveau
-- message vers l'autre partie.
-- ============================================================

create table if not exists public.ride_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (length(trim(content)) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists ride_messages_ride_id_idx on public.ride_messages(ride_id, created_at desc);

alter table public.ride_messages enable row level security;

drop policy if exists ride_messages_read on public.ride_messages;
create policy ride_messages_read on public.ride_messages
  for select using (
    exists (
      select 1 from public.rides r
      left join public.drivers d on d.id = r.driver_id
      where r.id = ride_messages.ride_id
        and (r.client_id = auth.uid() or d.profile_id = auth.uid())
    )
  );

drop policy if exists ride_messages_insert on public.ride_messages;
create policy ride_messages_insert on public.ride_messages
  for insert with check (false);

drop policy if exists ride_messages_update on public.ride_messages;
create policy ride_messages_update on public.ride_messages
  for update using (false);

-- Enable realtime (safe si déjà ajouté)
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.ride_messages';
  exception
    when duplicate_object then null;
    when others then null;
  end;
end $$;
