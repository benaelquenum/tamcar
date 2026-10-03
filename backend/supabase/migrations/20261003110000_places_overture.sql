-- ============================================================
-- Lieux : import Overture Maps (2026-10-03)
-- ============================================================
-- Overture Maps Foundation, thème « places » (release 2026-09-23.1), sous-ensemble des cinq villes.
-- Licences : CDLA-Permissive-2.0 (données Meta et Microsoft), Apache-2.0 (Foursquare), CC0 (AllThePlaces).
-- Attribution à afficher dans les mentions légales : « Contient des données © Overture Maps Foundation
-- (Meta, Microsoft, Foursquare, AllThePlaces), © contributeurs OpenStreetMap (ODbL) ».
-- Les lieux importés sont tracés par source = 'overture' et overture_id (identifiant GERS) : réimportables,
-- donc exclus de la sauvegarde, comme les lieux OpenStreetMap.

alter type place_source add value if not exists 'overture';

alter table public.places add column if not exists overture_id text;
create unique index if not exists places_overture_id_key on public.places (overture_id);

-- Sauvegarde : les lieux importés (OpenStreetMap, Overture) sont réimportables ; seuls les lieux ajoutés
-- à la main ou proposés par les utilisateurs sont sauvegardés.
create or replace function public.backup_export_table(p_table text, p_offset int, p_limit int)
returns json
language plpgsql stable security definer set search_path = public as $fn_bet$
declare
  v_rows json;
  v_where text := '';
begin
  if not exists (select 1 from public.backup_list_tables() l where l.table_name = p_table) then
    raise exception 'Table non sauvegardable : %', p_table;
  end if;
  if p_table = 'places' then
    v_where := ' where source::text not in (''osm'', ''overture'')';
  end if;

  execute format(
    'select coalesce(json_agg(to_json(t)), ''[]''::json) from (select * from public.%I%s order by ctid offset %s limit %s) t',
    p_table, v_where, greatest(coalesce(p_offset, 0), 0), greatest(least(coalesce(p_limit, 1000), 5000), 1)
  ) into v_rows;
  return v_rows;
end;
$fn_bet$;

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
    v_where := 'source::text not in (''osm'', ''overture'')';
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
