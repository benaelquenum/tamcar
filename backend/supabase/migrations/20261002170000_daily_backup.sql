-- ============================================================
-- Sauvegarde quotidienne des données de la plateforme (2026-10-02)
--
-- Chaque jour à 05h00 (heure du Bénin = 04h00 UTC), pg_cron appelle la route
-- /api/cron/backup du site client. Elle exporte TOUTES les tables du schéma public
-- (sauf secrets et jetons d'appareils) en fichiers JSON compressés, dans le bucket
-- privé « backups », et enregistre l'exécution dans backup_runs. Les sauvegardes
-- sont conservées 30 jours. Un contrôle à 06h30 prévient les administrateurs
-- (notification) si la sauvegarde du jour manque ou a échoué.
--
-- Réglage unique à faire à la main, une fois (adresse de votre site client) :
--   insert into public._push_settings (key, value)
--   values ('backup_url', 'https://<votre-domaine-client>/api/cron/backup')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
-- La clé d'authentification est déjà en base (service_role_key, utilisée par les
-- notifications) : aucune nouvelle clé à créer.
--
-- Cette sauvegarde est LOGIQUE (les données, table par table) : elle complète les
-- sauvegardes physiques de Supabase (Database → Backups) sans les remplacer.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Journal des sauvegardes
-- ------------------------------------------------------------
create table if not exists public.backup_runs (
  id           uuid primary key default gen_random_uuid(),
  trigger      text not null default 'cron' check (trigger in ('cron', 'manual')),
  status       text not null default 'running' check (status in ('running', 'ok', 'failed')),
  folder       text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  total_rows   bigint,
  total_bytes  bigint,
  tables       jsonb not null default '[]'::jsonb,   -- [{name, rows, bytes}]
  error        text,
  started_by   uuid references public.profiles(id) on delete set null
);

create index if not exists backup_runs_started_idx on public.backup_runs (started_at desc);

alter table public.backup_runs enable row level security;
drop policy if exists backup_runs_admin_read on public.backup_runs;
create policy backup_runs_admin_read on public.backup_runs for select using (public.is_admin());
-- Aucune politique d'écriture : seule la route serveur (service_role) écrit.

-- ------------------------------------------------------------
-- 2. Bucket privé « backups » (lecture réservée aux administrateurs)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 524288000,
        array['application/gzip', 'application/json', 'application/octet-stream'])
on conflict (id) do update
  set public = false, file_size_limit = 524288000,
      allowed_mime_types = array['application/gzip', 'application/json', 'application/octet-stream'];

do $$ begin
  create policy backups_admin_read on storage.objects
    for select using (bucket_id = 'backups' and public.is_admin());
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 3. Export des tables (appelé uniquement par la route serveur)
-- ------------------------------------------------------------
-- Tables exclues : secrets (_push_settings contient la clé de service) et jetons
-- d'appareils (renouvelés à la reconnexion). Les tables « _… » sont internes.
create or replace function public.backup_list_tables()
returns table (table_name text)
language sql stable security definer set search_path = public as $fn_blt$
  select t.table_name::text
    from information_schema.tables t
   where t.table_schema = 'public'
     and t.table_type = 'BASE TABLE'
     and t.table_name not like '\_%' escape '\'
     and t.table_name not in ('push_subscriptions', 'native_push_tokens')
   order by t.table_name;
$fn_blt$;

create or replace function public.backup_export_table(p_table text, p_offset int, p_limit int)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn_bet$
declare
  v_rows jsonb;
begin
  -- Liste blanche : seulement les tables que backup_list_tables() annonce.
  if not exists (select 1 from public.backup_list_tables() l where l.table_name = p_table) then
    raise exception 'Table non sauvegardable : %', p_table;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.%I order by ctid offset %s limit %s) t',
    p_table, greatest(coalesce(p_offset, 0), 0), greatest(least(coalesce(p_limit, 1000), 5000), 1)
  ) into v_rows;
  return v_rows;
end;
$fn_bet$;

-- Réservées à la clé de service (la route serveur) : jamais appelables par un compte connecté.
revoke all on function public.backup_list_tables() from public, anon, authenticated;
revoke all on function public.backup_export_table(text, int, int) from public, anon, authenticated;
grant execute on function public.backup_list_tables() to service_role;
grant execute on function public.backup_export_table(text, int, int) to service_role;

-- ------------------------------------------------------------
-- 4. Déclenchement quotidien (05h00 Bénin) et contrôle de santé (06h30 Bénin)
-- ------------------------------------------------------------
create or replace function public._run_daily_backup()
returns void
language plpgsql security definer set search_path = public as $fn_rdb$
declare
  v_url text;
  v_key text;
begin
  select value into v_url from public._push_settings where key = 'backup_url';
  select value into v_key from public._push_settings where key = 'service_role_key';
  if v_url is null or v_url = '' or v_key is null or v_key = '' then
    raise notice 'Sauvegarde non lancée : backup_url ou service_role_key absent de _push_settings.';
    return;
  end if;

  -- Réponse attendue jusqu'à 60 s ; la route continue de toute façon côté serveur.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 60000
  );
end;
$fn_rdb$;

revoke all on function public._run_daily_backup() from public, anon, authenticated;

create or replace function public._check_backup_health()
returns void
language plpgsql security definer set search_path = public as $fn_cbh$
declare
  adm record;
  v_last public.backup_runs;
begin
  -- Une sauvegarde réussie depuis 04h00 UTC aujourd'hui ?
  if exists (
    select 1 from public.backup_runs
     where status = 'ok'
       and started_at >= date_trunc('day', now() at time zone 'UTC') + interval '3 hours 30 minutes'
  ) then
    return;
  end if;

  select * into v_last from public.backup_runs order by started_at desc limit 1;

  for adm in select id from public.profiles where role = 'admin' loop
    perform public._push_notify(
      adm.id,
      'Sauvegarde du jour manquante',
      case
        when v_last.id is null then 'Aucune sauvegarde n''a encore été enregistrée. Vérifiez le réglage backup_url.'
        when v_last.status = 'failed' then 'La dernière sauvegarde a échoué : ' || left(coalesce(v_last.error, 'erreur inconnue'), 120)
        else 'Aucune sauvegarde réussie depuis hier. Ouvrez Sauvegardes dans l''admin.'
      end,
      '/admin/sauvegardes',
      'backup-health:' || to_char(now(), 'YYYY-MM-DD'),
      true
    );
  end loop;
end;
$fn_cbh$;

revoke all on function public._check_backup_health() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('daily-backup');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('backup-health');
exception when others then null;
end $$;

-- pg_cron raisonne en UTC : 04h00 UTC = 05h00 au Bénin (UTC+1, sans heure d'été).
select cron.schedule('daily-backup', '0 4 * * *', $$select public._run_daily_backup()$$);
select cron.schedule('backup-health', '30 5 * * *', $$select public._check_backup_health()$$);
