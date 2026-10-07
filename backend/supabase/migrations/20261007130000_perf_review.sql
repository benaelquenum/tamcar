-- ============================================================
-- Revue de performance (2026-10-07)
--
-- 1. L'historique des tâches planifiées (cron.job_run_details) représentait la moitié de la base (44 Mo, 270 000 lignes,
--    ~30 000 de plus par jour avec les tâches toutes les 5 s et 15 s) : au rythme actuel il aurait saturé les 500 Mo
--    du plan gratuit en quelques mois. Purge horaire (1 jour conservé).
-- 2. Index sur les clés étrangères fonctionnelles (jointures, suppressions en cascade) ; les simples colonnes « auteur de
--    l'action » (created_by, decided_by, ...) ne sont volontairement pas indexées.
-- 3. Politiques RLS : auth.uid() / is_admin() sont enveloppés dans (select ...) pour n'être évalués qu'UNE fois par
--    requête (sinon une fois par ligne lue) — recommandation Supabase, sémantique inchangée.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Purge de l'historique des tâches planifiées
-- ------------------------------------------------------------
select cron.schedule(
  'purge-cron-history',
  '17 * * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '1 day'$$
);
delete from cron.job_run_details where end_time < now() - interval '1 day';

-- ------------------------------------------------------------
-- 2. Index des clés étrangères fonctionnelles
-- ------------------------------------------------------------
do $do$
declare
  r record;
  idx text;
begin
  for r in
    select c.conrelid,
           c.conrelid::regclass as tbl,
           (select relname from pg_class where oid = c.conrelid) as relname,
           (select string_agg(quote_ident(a.attname), ', ' order by array_position(c.conkey, a.attnum))
              from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any(c.conkey)) as cols,
           (select string_agg(a.attname, '_' order by array_position(c.conkey, a.attnum))
              from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any(c.conkey)) as colnames
      from pg_constraint c
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid and i.indisvalid
            and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] = c.conkey)
  loop
    -- colonnes « auteur de l'action » : pas d'index
    continue when r.colnames ~ '^(created_by|decided_by|approved_by|archived_by|verified_by|activated_by|started_by|km_validated_by|updated_by|resolved_by|processed_by|reverses|reversed_by)$';
    idx := left('idx_' || r.relname || '_' || r.colnames, 63);
    execute format('create index if not exists %I on %s (%s)', idx, r.tbl, r.cols);
  end loop;
end
$do$;

-- ------------------------------------------------------------
-- 3. Politiques RLS : évaluation unique des fonctions d'identité
-- ------------------------------------------------------------
do $do$
declare
  r record;
  q text;
  w text;
  sql text;
  -- (select ...) autour de auth.uid(), auth.jwt(), auth.role() et des gardes sans argument, sauf s'ils le sont déjà
  re_auth constant text := '(?<!select )(?<![\w.])auth\.(uid|jwt|role)\(\)';
  re_fn   constant text := '(?<!select )(?<![\w.])(public\.)?(is_admin|is_backoffice|is_backoffice_reader)\(\)';
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~* re_auth or coalesce(with_check, '') ~* re_auth
            or coalesce(qual, '') ~* re_fn or coalesce(with_check, '') ~* re_fn)
  loop
    q := r.qual;
    w := r.with_check;
    if q is not null then
      q := regexp_replace(q, re_auth, '(select auth.\1())', 'gi');
      q := regexp_replace(q, re_fn, '(select \2())', 'gi');
    end if;
    if w is not null then
      w := regexp_replace(w, re_auth, '(select auth.\1())', 'gi');
      w := regexp_replace(w, re_fn, '(select \2())', 'gi');
    end if;
    sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if q is not null then sql := sql || ' using (' || q || ')'; end if;
    if w is not null then sql := sql || ' with check (' || w || ')'; end if;
    execute sql;
  end loop;
end
$do$;
