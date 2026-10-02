-- ============================================================
-- Sauvegarde : exclure les tables système PostGIS
-- ============================================================
-- spatial_ref_sys (8 500 lignes) est le référentiel de projections fourni par l'extension
-- PostGIS : identique sur toute installation, il n'a pas sa place dans une sauvegarde des
-- données TamCar (et la restaurer à la main serait une source d'erreurs).
create or replace function public.backup_list_tables()
returns table (table_name text)
language sql stable security definer set search_path = public as $fn_blt$
  select t.table_name::text
    from information_schema.tables t
   where t.table_schema = 'public'
     and t.table_type = 'BASE TABLE'
     and t.table_name not like '\_%' escape '\'
     and t.table_name not in ('push_subscriptions', 'native_push_tokens', 'spatial_ref_sys')
   order by t.table_name;
$fn_blt$;
