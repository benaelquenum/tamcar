-- ============================================================
-- TamCar — Bucket driver-photos (2026-07-15)
--
-- Photos de profil chauffeurs, visibles publiquement (client, driver, admin).
-- L'upload/update/delete est réservé à l'admin (via RLS is_admin()).
-- Les photos sont stockées à la racine du bucket avec le format {profile_id}.{ext}.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-photos',
  'driver-photos',
  true,   -- public : URLs directement lisibles sans signed URL
  5242880,  -- 5 MB max
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Nettoyage éventuel de policies existantes
drop policy if exists "driver_photos_public_read" on storage.objects;
drop policy if exists "driver_photos_admin_insert" on storage.objects;
drop policy if exists "driver_photos_admin_update" on storage.objects;
drop policy if exists "driver_photos_admin_delete" on storage.objects;

-- Lecture publique (tous authentifiés + anon)
create policy "driver_photos_public_read"
on storage.objects for select
using (bucket_id = 'driver-photos');

-- Admin uniquement pour insert/update/delete
create policy "driver_photos_admin_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'driver-photos' and public.is_admin());

create policy "driver_photos_admin_update"
on storage.objects for update to authenticated
using (bucket_id = 'driver-photos' and public.is_admin())
with check (bucket_id = 'driver-photos' and public.is_admin());

create policy "driver_photos_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'driver-photos' and public.is_admin());
