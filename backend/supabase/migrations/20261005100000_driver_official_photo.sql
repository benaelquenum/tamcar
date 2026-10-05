-- Photo officielle des chauffeurs.
--
--  1. profiles.avatar_verified_at : la photo a été prise/contrôlée par TamCar (outil admin). Elle est remise à
--     zéro dès que la photo change par un autre chemin.
--  2. Un chauffeur ne peut plus remplacer sa photo : ni dans le stockage (bucket client-avatars), ni en
--     modifiant profiles.avatar_url. Les clients, partenaires et candidats (pas encore chauffeurs) ne sont pas
--     touchés ; l'admin et les actions serveur (clé de service) non plus.
--  3. driver_photo_verified(ride) : permet à l'écran de course du client d'afficher le badge
--     « Photo vérifiée par TamCar ».

alter table public.profiles add column if not exists avatar_verified_at timestamptz;

-- Le compte connecté est-il un compte chauffeur ? (fonction de garde, sans fuite : ne parle que de soi)
create or replace function public._is_driver_account()
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.drivers d where d.profile_id = auth.uid());
$fn$;
revoke execute on function public._is_driver_account() from public, anon;
grant execute on function public._is_driver_account() to authenticated;

-- Garde sur profiles.avatar_url
create or replace function public._profiles_avatar_guard()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.avatar_url is distinct from old.avatar_url then
    -- Session d'un utilisateur (pas la clé de service) qui modifie SON profil alors qu'il est chauffeur.
    if auth.uid() is not null and auth.uid() = old.id
       and exists (select 1 from public.drivers d where d.profile_id = old.id)
       and not public.is_admin() then
      raise exception 'Votre photo est gérée par TamCar : elle ne peut pas être modifiée depuis l''application.';
    end if;
    -- Changement par un autre chemin que l'outil officiel : la photo n'est plus « vérifiée ».
    if new.avatar_verified_at is not distinct from old.avatar_verified_at then
      new.avatar_verified_at := null;
    end if;
  end if;
  return new;
end;
$fn$;
revoke execute on function public._profiles_avatar_guard() from public, anon, authenticated;

drop trigger if exists profiles_avatar_guard on public.profiles;
create trigger profiles_avatar_guard
  before update of avatar_url on public.profiles
  for each row execute function public._profiles_avatar_guard();

-- Stockage : le propriétaire d'un fichier n'écrit plus s'il est chauffeur.
drop policy if exists "client_avatars_owner_insert" on storage.objects;
drop policy if exists "client_avatars_owner_update" on storage.objects;
drop policy if exists "client_avatars_owner_delete" on storage.objects;

create policy "client_avatars_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'client-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
  and not public._is_driver_account()
);

create policy "client_avatars_owner_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'client-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
  and not public._is_driver_account()
)
with check (
  bucket_id = 'client-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
  and not public._is_driver_account()
);

create policy "client_avatars_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'client-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
  and not public._is_driver_account()
);

-- Badge côté client : la photo du chauffeur de cette course est-elle vérifiée par TamCar ?
create or replace function public.driver_photo_verified(p_ride_id uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((
    select pr.avatar_verified_at is not null
      from public.rides r
      join public.drivers d on d.id = r.driver_id
      join public.profiles pr on pr.id = d.profile_id
     where r.id = p_ride_id
       and (r.client_id = auth.uid() or d.profile_id = auth.uid() or public.is_admin())
  ), false);
$fn$;
revoke execute on function public.driver_photo_verified(uuid) from public, anon;
grant execute on function public.driver_photo_verified(uuid) to authenticated;
