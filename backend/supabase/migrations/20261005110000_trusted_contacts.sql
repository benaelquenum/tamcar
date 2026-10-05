-- Proches de confiance : jusqu'à deux personnes que le client peut prévenir en un geste, la nuit (à partir de
-- 21 h), en leur envoyant le lien de suivi de sa course. Le client accepte ou décline à chaque course ;
-- l'envoi se fait depuis son téléphone (WhatsApp), TamCar ne contacte jamais ces personnes de lui-même.

create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 40),
  phone text not null check (phone ~ '^\+229[0-9]{10}$'),
  created_at timestamptz not null default now(),
  unique (profile_id, phone)
);
create index if not exists trusted_contacts_profile_idx on public.trusted_contacts (profile_id);

alter table public.trusted_contacts enable row level security;

drop policy if exists trusted_contacts_own_select on public.trusted_contacts;
create policy trusted_contacts_own_select on public.trusted_contacts for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists trusted_contacts_own_insert on public.trusted_contacts;
create policy trusted_contacts_own_insert on public.trusted_contacts for insert to authenticated
  with check (profile_id = auth.uid());
drop policy if exists trusted_contacts_own_delete on public.trusted_contacts;
create policy trusted_contacts_own_delete on public.trusted_contacts for delete to authenticated
  using (profile_id = auth.uid());

revoke all on public.trusted_contacts from anon;
grant select, insert, delete on public.trusted_contacts to authenticated;

-- Deux proches au plus par client.
create or replace function public._trusted_contacts_limit()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if (select count(*) from public.trusted_contacts where profile_id = new.profile_id) >= 2 then
    raise exception 'Vous pouvez enregistrer deux proches au maximum.';
  end if;
  return new;
end;
$fn$;
revoke execute on function public._trusted_contacts_limit() from public, anon, authenticated;

drop trigger if exists trusted_contacts_limit on public.trusted_contacts;
create trigger trusted_contacts_limit
  before insert on public.trusted_contacts
  for each row execute function public._trusted_contacts_limit();
