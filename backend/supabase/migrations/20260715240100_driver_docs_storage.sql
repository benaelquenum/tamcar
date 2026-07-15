-- ============================================================
-- TamCar — Bucket Storage driver-docs (2026-07-15)
--
-- Bucket privé pour KYC chauffeur (CNI, permis, carte grise).
-- Path convention : {profile_id}/{doc_type}_{timestamp}.{ext}
-- Le user ne voit que ses propres docs, admin voit tout.
-- ============================================================

-- Crée le bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-docs',
  'driver-docs',
  false,
  10485760, -- 10 MB max
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Policy INSERT : user peut uploader dans son propre dossier
drop policy if exists "driver_docs_upload_own" on storage.objects;
create policy "driver_docs_upload_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'driver-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy SELECT : user voit ses docs, admin voit tout
drop policy if exists "driver_docs_read_own_or_admin" on storage.objects;
create policy "driver_docs_read_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'driver-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- Policy UPDATE : user peut remplacer ses docs (avant candidature validée)
drop policy if exists "driver_docs_update_own" on storage.objects;
create policy "driver_docs_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'driver-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy DELETE : user peut supprimer ses docs
drop policy if exists "driver_docs_delete_own" on storage.objects;
create policy "driver_docs_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'driver-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
