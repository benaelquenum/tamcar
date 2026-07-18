-- ============================================================
-- Bucket client-avatars : chaque client gère sa propre photo de profil.
-- Le chauffeur assigné à une ride voit la photo via profiles.avatar_url
-- (la RLS counterpart de la migration 20260717180000 autorise déjà le read).
--
-- Convention de nommage : {profile_id}.{ext} à la racine du bucket.
-- L'ancienne photo est overwritten par upsert:true côté client.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-avatars',
  'client-avatars',
  true,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "client_avatars_public_read" on storage.objects;
drop policy if exists "client_avatars_owner_insert" on storage.objects;
drop policy if exists "client_avatars_owner_update" on storage.objects;
drop policy if exists "client_avatars_owner_delete" on storage.objects;

-- Lecture publique : n'importe qui peut afficher l'avatar (le chauffeur
-- ne connait de toute façon que les profil-ids liés à ses rides).
create policy "client_avatars_public_read"
on storage.objects for select
using (bucket_id = 'client-avatars');

-- Le user peut uploader/écraser sa propre photo :
-- convention : nom du fichier = {profile_id}.{ext} → on vérifie que
-- name commence par auth.uid()::text
create policy "client_avatars_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'client-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
);

create policy "client_avatars_owner_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'client-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
)
with check (
  bucket_id = 'client-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
);

create policy "client_avatars_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'client-avatars'
  and split_part(name, '.', 1) = auth.uid()::text
);
