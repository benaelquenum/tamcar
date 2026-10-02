-- ============================================================
-- Sauvegarde : traces explorables + copie hors Supabase (2026-10-02)
-- ============================================================
-- Décision Terence : des traces durables qu'il peut explorer plus tard, et une copie hors
-- Supabase (compte Google Drive dédié, reçu par un script Apps Script).
--
--   Secours  : sauvegarde quotidienne gardée 14 jours dans Supabase ; chaque dimanche, un
--              fichier unique envoyé sur Drive (gardé 12 semaines).
--   Mémoire  : une archive Excel par mois (un onglet par table), lisible sans outil, gardée
--              pour toujours sur Drive. Tables d'historique = lignes du mois ; tables d'état
--              (chauffeurs, véhicules, tarifs…) = état complet au moment de l'archivage.
--   Fichiers : photos et pièces copiées sur Drive une seule fois (suivi dans backup_drive_files).
--
-- Les lieux importés d'OpenStreetMap (places.source = 'osm', 10 469 lignes, réimportables)
-- ne sont plus sauvegardés : seuls les lieux ajoutés à la main le sont.
-- Toutes les fonctions sont réservées à la clé de service (la route serveur).

-- ------------------------------------------------------------
-- 1. Journal : envoi hebdomadaire sur Drive
-- ------------------------------------------------------------
alter table public.backup_runs add column if not exists drive jsonb;
comment on column public.backup_runs.drive is
  'Envoi du fichier de secours sur Drive : {path, bytes, purged} ou {error}';

-- ------------------------------------------------------------
-- 2. Suivi des archives mensuelles et des fichiers envoyés sur Drive
-- ------------------------------------------------------------
create table if not exists public.backup_archives (
  month        text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  status       text not null default 'ok' check (status in ('ok', 'failed')),
  rows         bigint not null default 0,
  bytes        bigint not null default 0,
  tables       jsonb not null default '[]'::jsonb,   -- [{name, mode, rows}]
  error        text,
  generated_at timestamptz not null default now()
);
alter table public.backup_archives enable row level security;
drop policy if exists backup_archives_admin_read on public.backup_archives;
create policy backup_archives_admin_read on public.backup_archives for select using (public.is_admin());

create table if not exists public.backup_drive_files (
  bucket_id         text not null,
  name              text not null,
  size              bigint not null default 0,
  source_updated_at timestamptz,
  synced_at         timestamptz not null default now(),
  primary key (bucket_id, name)
);
alter table public.backup_drive_files enable row level security;
drop policy if exists backup_drive_files_admin_read on public.backup_drive_files;
create policy backup_drive_files_admin_read on public.backup_drive_files for select using (public.is_admin());
-- Aucune politique d'écriture : seule la route serveur (service_role) écrit.

-- ------------------------------------------------------------
-- 3. Export de secours : ordre des colonnes conservé, lieux OSM exclus
-- ------------------------------------------------------------
drop function if exists public.backup_export_table(text, int, int);
create function public.backup_export_table(p_table text, p_offset int, p_limit int)
returns json
language plpgsql stable security definer set search_path = public as $fn_bet$
declare
  v_rows json;
  v_where text := '';
begin
  -- Liste blanche : seulement les tables que backup_list_tables() annonce.
  if not exists (select 1 from public.backup_list_tables() l where l.table_name = p_table) then
    raise exception 'Table non sauvegardable : %', p_table;
  end if;
  -- Lieux importés d'OpenStreetMap : réimportables, donc non sauvegardés.
  if p_table = 'places' then
    v_where := ' where source is distinct from ''osm''';
  end if;

  execute format(
    'select coalesce(json_agg(to_json(t)), ''[]''::json) from (select * from public.%I%s order by ctid offset %s limit %s) t',
    p_table, v_where, greatest(coalesce(p_offset, 0), 0), greatest(least(coalesce(p_limit, 1000), 5000), 1)
  ) into v_rows;
  return v_rows;
end;
$fn_bet$;

-- ------------------------------------------------------------
-- 4. Export lisible (archives Excel) : positions en latitude/longitude, filtre par période
-- ------------------------------------------------------------
-- Colonne de date servant à découper un historique par mois (null = table d'état, exportée en entier).
create or replace function public._backup_date_column(p_table text)
returns table (col text, typ text)
language sql stable security definer set search_path = public as $fn_bdc$
  select c.column_name::text, c.data_type::text
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = p_table
     and c.column_name in ('created_at', 'at', 'issued_at', 'requested_at', 'accepted_at', 'added_at', 'day')
     and (c.data_type like 'timestamp%' or c.data_type = 'date')
   order by array_position(
              array['created_at', 'at', 'issued_at', 'requested_at', 'accepted_at', 'added_at', 'day'],
              c.column_name::text)
   limit 1;
$fn_bdc$;

create or replace function public.backup_tables_info()
returns table (table_name text, date_column text)
language sql stable security definer set search_path = public as $fn_bti$
  select l.table_name, (select d.col from public._backup_date_column(l.table_name) d)
    from public.backup_list_tables() l
   order by l.table_name;
$fn_bti$;

create or replace function public.backup_export_readable(
  p_table text, p_from timestamptz, p_to timestamptz, p_offset int, p_limit int
)
returns json
language plpgsql stable security definer set search_path = public as $fn_ber$
declare
  v_cols text;
  v_datecol text;
  v_dtype text;
  v_where text := 'true';
  v_rows json;
begin
  if not exists (select 1 from public.backup_list_tables() l where l.table_name = p_table) then
    raise exception 'Table non sauvegardable : %', p_table;
  end if;

  -- Colonnes dans l'ordre de la table ; geography/geometry -> <col>_lat et <col>_lng lisibles.
  select string_agg(
           case when c.udt_name in ('geography', 'geometry')
                then format('st_y(%1$I::geometry) as %2$I, st_x(%1$I::geometry) as %3$I',
                            c.column_name, c.column_name || '_lat', c.column_name || '_lng')
                else format('%I', c.column_name) end,
           ', ' order by c.ordinal_position)
    into v_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_table;

  if p_table = 'places' then
    v_where := 'source is distinct from ''osm''';
  end if;

  if p_from is not null and p_to is not null then
    select d.col, d.typ into v_datecol, v_dtype from public._backup_date_column(p_table) d;
    if v_datecol is not null then
      if v_dtype = 'date' then
        v_where := v_where || format(' and %1$I >= %2$L::date and %1$I < %3$L::date', v_datecol,
                     (p_from at time zone 'Africa/Porto-Novo')::date, (p_to at time zone 'Africa/Porto-Novo')::date);
      else
        v_where := v_where || format(' and %1$I >= %2$L and %1$I < %3$L', v_datecol, p_from, p_to);
      end if;
    end if;
  end if;

  execute format(
    'select coalesce(json_agg(to_json(t)), ''[]''::json) from (select %s from public.%I where %s order by ctid offset %s limit %s) t',
    v_cols, p_table, v_where,
    greatest(coalesce(p_offset, 0), 0), greatest(least(coalesce(p_limit, 1000), 5000), 1)
  ) into v_rows;
  return v_rows;
end;
$fn_ber$;

-- ------------------------------------------------------------
-- 5. Fichiers à envoyer sur Drive
-- ------------------------------------------------------------
create or replace function public.backup_drive_files_todo(p_limit int)
returns table (bucket_id text, name text, size bigint, updated_at timestamptz)
language sql stable security definer set search_path = '' as $fn_bdt$
  select o.bucket_id::text, o.name::text, coalesce((o.metadata->>'size')::bigint, 0), o.updated_at
    from storage.objects o
    left join public.backup_drive_files d on d.bucket_id = o.bucket_id and d.name = o.name
   where o.bucket_id not in ('backups', 'map', 'cartes')
     and o.name not like '%.emptyFolderPlaceholder'
     and (d.name is null or d.source_updated_at < o.updated_at)
   order by o.created_at nulls last, o.name
   limit greatest(least(coalesce(p_limit, 100), 1000), 1);
$fn_bdt$;

create or replace function public.backup_drive_files_stats()
returns jsonb
language sql stable security definer set search_path = '' as $fn_bds$
  select jsonb_build_object(
    'source_files', count(*),
    'source_bytes', coalesce(sum((o.metadata->>'size')::bigint), 0),
    'remaining',    count(*) filter (where d.name is null or d.source_updated_at < o.updated_at)
  )
    from storage.objects o
    left join public.backup_drive_files d on d.bucket_id = o.bucket_id and d.name = o.name
   where o.bucket_id not in ('backups', 'map', 'cartes')
     and o.name not like '%.emptyFolderPlaceholder';
$fn_bds$;

-- ------------------------------------------------------------
-- 6. Droits : service_role uniquement
-- ------------------------------------------------------------
revoke all on function public.backup_export_table(text, int, int) from public, anon, authenticated;
revoke all on function public._backup_date_column(text) from public, anon, authenticated;
revoke all on function public.backup_tables_info() from public, anon, authenticated;
revoke all on function public.backup_export_readable(text, timestamptz, timestamptz, int, int) from public, anon, authenticated;
revoke all on function public.backup_drive_files_todo(int) from public, anon, authenticated;
revoke all on function public.backup_drive_files_stats() from public, anon, authenticated;
grant execute on function public.backup_export_table(text, int, int) to service_role;
grant execute on function public.backup_tables_info() to service_role;
grant execute on function public.backup_export_readable(text, timestamptz, timestamptz, int, int) to service_role;
grant execute on function public.backup_drive_files_todo(int) to service_role;
grant execute on function public.backup_drive_files_stats() to service_role;

-- ------------------------------------------------------------
-- 7. Envoi quotidien vers Drive (archives mensuelles + fichiers), 05h20 heure du Bénin
-- ------------------------------------------------------------
-- Même adresse que la sauvegarde (backup_url), route /api/cron/drive. Sans Drive configuré
-- côté Vercel, la route répond « non configuré » et ne fait rien.
create or replace function public._run_drive_sync()
returns void
language plpgsql security definer set search_path = public as $fn_rds$
declare
  v_url text;
  v_key text;
begin
  select value into v_url from public._push_settings where key = 'backup_url';
  select value into v_key from public._push_settings where key = 'service_role_key';
  if v_url is null or v_url = '' or v_key is null or v_key = '' then
    return;
  end if;
  perform net.http_post(
    url := replace(v_url, '/api/cron/backup', '/api/cron/drive'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 60000
  );
end;
$fn_rds$;

revoke all on function public._run_drive_sync() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('drive-sync');
exception when others then null;
end $$;
select cron.schedule('drive-sync', '20 4 * * *', $$select public._run_drive_sync()$$);
