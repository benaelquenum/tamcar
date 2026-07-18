-- ============================================================
-- Vue admin pour places : expose lat/lng à partir de location (PostGIS).
-- Utilisée par /admin/places pour afficher un bouton "Localiser".
-- ============================================================

drop view if exists public.places_admin_view cascade;

create or replace view public.places_admin_view
with (security_invoker = true)
as
select
  p.id,
  p.name,
  p.category,
  p.category_group,
  p.city,
  p.district,
  p.address,
  p.source,
  p.verified,
  p.submitted_by,
  p.created_at,
  st_y(p.location::geometry) as lat,
  st_x(p.location::geometry) as lng
from public.places p;

grant select on public.places_admin_view to authenticated;

comment on view public.places_admin_view is
  'Vue admin de places avec lat/lng extraits de la geography.';
