-- ============================================================
-- Bucket Storage pour les images de bannières (2026-07-27)
-- L'admin téléverse une image conçue à l'avance ; l'URL publique est
-- stockée dans home_banners.image_url. Bucket public (lecture par tous),
-- écriture via service_role (server action admin).
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'banners', 'banners', true, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

-- Lecture publique explicite (le bucket public l'autorise déjà, on le pose au cas où).
do $$
begin
  create policy "banners_public_read" on storage.objects
    for select using (bucket_id = 'banners');
exception when duplicate_object then null; end $$;

-- Écriture/suppression réservées aux admins (en plus du service_role qui bypasse la RLS).
do $$
begin
  create policy "banners_admin_write" on storage.objects
    for insert with check (bucket_id = 'banners' and public.is_admin());
exception when duplicate_object then null; end $$;

do $$
begin
  create policy "banners_admin_delete" on storage.objects
    for delete using (bucket_id = 'banners' and public.is_admin());
exception when duplicate_object then null; end $$;
