-- ============================================================
-- Sauvegarde : comptes de connexion + fichiers stockés (2026-10-02)
-- ============================================================
-- Complète 20261002170000_daily_backup.sql :
--   1. Les comptes de connexion (schéma auth) : identifiant, e-mail, téléphone, dates,
--      métadonnées. JAMAIS les mots de passe hachés ni les jetons : après une restauration,
--      chacun redéfinit son mot de passe avec « Mot de passe oublié ».
--   2. Les fichiers stockés (photos, pièces des chauffeurs, documents comptables…) : copie
--      MIROIR dans backups/files/<bucket>/<chemin>. Un fichier n'est copié qu'une fois (ou
--      quand il change) : pas de duplication à chaque sauvegarde. Les fonds de carte (map,
--      cartes), régénérables et volumineux, et le bucket backups lui-même sont exclus.
-- Toutes ces fonctions sont réservées à la clé de service (la route serveur).

-- ------------------------------------------------------------
-- 1. Journal : résumé de la copie des fichiers
-- ------------------------------------------------------------
alter table public.backup_runs add column if not exists files jsonb;
comment on column public.backup_runs.files is
  'Résumé de la copie des fichiers : {source_files, source_bytes, copied, failed, remaining, failed_names[]}';

-- Le bucket doit accepter tout type de fichier (images, PDF…) pour le miroir.
update storage.buckets set allowed_mime_types = null where id = 'backups';

-- ------------------------------------------------------------
-- 2. Export des comptes de connexion
-- ------------------------------------------------------------
create or replace function public.backup_export_auth(p_kind text, p_offset int, p_limit int)
returns jsonb
language plpgsql stable security definer set search_path = '' as $fn_bea$
declare
  v_rows jsonb;
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_lim int := greatest(least(coalesce(p_limit, 1000), 5000), 1);
begin
  if p_kind = 'users' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select u.id, u.aud, u.role, u.email, u.phone,
               u.email_confirmed_at, u.phone_confirmed_at, u.last_sign_in_at,
               u.created_at, u.updated_at, u.banned_until, u.deleted_at,
               u.is_anonymous, u.is_sso_user,
               u.raw_app_meta_data, u.raw_user_meta_data
          from auth.users u
         order by u.created_at, u.id
        offset v_off limit v_lim
      ) t;
  elsif p_kind = 'identities' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select i.id, i.user_id, i.provider, i.provider_id, i.identity_data,
               i.last_sign_in_at, i.created_at, i.updated_at
          from auth.identities i
         order by i.created_at, i.id
        offset v_off limit v_lim
      ) t;
  else
    raise exception 'Type de compte non sauvegardable : %', p_kind;
  end if;
  return v_rows;
end;
$fn_bea$;

-- ------------------------------------------------------------
-- 3. Fichiers à copier / statistiques
-- ------------------------------------------------------------
-- Fichiers sources absents du miroir, ou modifiés depuis leur copie.
create or replace function public.backup_files_todo(p_limit int)
returns table (bucket_id text, name text, size bigint)
language sql stable security definer set search_path = '' as $fn_bft$
  select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0)
    from storage.objects o
    left join storage.objects m
           on m.bucket_id = 'backups' and m.name = 'files/' || o.bucket_id || '/' || o.name
   where o.bucket_id not in ('backups', 'map', 'cartes')
     and o.name not like '%.emptyFolderPlaceholder'
     and (m.id is null or m.updated_at < o.updated_at)
   order by o.created_at nulls last, o.name
   limit greatest(least(coalesce(p_limit, 500), 2000), 1);
$fn_bft$;

create or replace function public.backup_files_stats()
returns jsonb
language sql stable security definer set search_path = '' as $fn_bfs$
  select jsonb_build_object(
    'source_files', count(*),
    'source_bytes', coalesce(sum((o.metadata->>'size')::bigint), 0),
    'remaining',    count(*) filter (where m.id is null or m.updated_at < o.updated_at)
  )
    from storage.objects o
    left join storage.objects m
           on m.bucket_id = 'backups' and m.name = 'files/' || o.bucket_id || '/' || o.name
   where o.bucket_id not in ('backups', 'map', 'cartes')
     and o.name not like '%.emptyFolderPlaceholder';
$fn_bfs$;

revoke all on function public.backup_export_auth(text, int, int) from public, anon, authenticated;
revoke all on function public.backup_files_todo(int) from public, anon, authenticated;
revoke all on function public.backup_files_stats() from public, anon, authenticated;
grant execute on function public.backup_export_auth(text, int, int) to service_role;
grant execute on function public.backup_files_todo(int) to service_role;
grant execute on function public.backup_files_stats() to service_role;
