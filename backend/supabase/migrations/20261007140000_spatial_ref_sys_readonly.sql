-- ============================================================
-- Table de référence PostGIS en lecture seule pour l'API (2026-10-07)
--
-- public.spatial_ref_sys appartient à supabase_admin et ses droits d'écriture (insert/update/delete/truncate) sont
-- accordés à anon et authenticated par supabase_admin : le rôle postgres ne peut ni les révoquer ni activer la RLS.
-- Constat (test en rôle anon) : un visiteur muni de la clé publique pouvait SUPPRIMER la ligne srid 4326, ce qui
-- casse tous les calculs géographiques (distance, prix, proximité des chauffeurs).
-- Parade : déclencheurs qui refusent toute écriture venant de anon / authenticated. Les rôles d'administration
-- (postgres, supabase_admin : mises à jour de PostGIS) ne sont pas concernés.
-- ============================================================

create or replace function public._spatial_ref_sys_readonly()
returns trigger
language plpgsql set search_path = public as $fn$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'Table de référence en lecture seule.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$fn$;

drop trigger if exists spatial_ref_sys_readonly_row on public.spatial_ref_sys;
create trigger spatial_ref_sys_readonly_row
  before insert or update or delete on public.spatial_ref_sys
  for each row execute function public._spatial_ref_sys_readonly();

drop trigger if exists spatial_ref_sys_readonly_stmt on public.spatial_ref_sys;
create trigger spatial_ref_sys_readonly_stmt
  before truncate on public.spatial_ref_sys
  for each statement execute function public._spatial_ref_sys_readonly();
