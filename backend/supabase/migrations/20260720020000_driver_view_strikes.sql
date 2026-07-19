-- ============================================================
-- Étend driver_admin_view pour exposer le compteur de strikes
-- (annulations attribuées faute chauffeur, prouvées ou tranchées admin).
-- ============================================================

drop view if exists public.driver_admin_view cascade;
create or replace view public.driver_admin_view
with (security_invoker = true)
as
select
  d.id as driver_id,
  d.profile_id,
  p.full_name,
  p.phone,
  p.avatar_url,
  d.application_type,
  d.status,
  d.kyc_status,
  d.is_online,
  d.license_number,
  d.id_card_number,
  d.rating_avg,
  d.rating_count,
  d.current_vehicle_id,
  d.created_at as registered_at,
  d.archived_at,
  d.archive_reason,
  coalesce((
    select sum(r.driver_share_fcfa) from public.rides r
    where r.driver_id = d.id and r.status = 'completed'
  ), 0)::bigint as total_cash_fcfa,
  coalesce((
    select sum(r.driver_rachat_fcfa) from public.rides r
    where r.driver_id = d.id and r.status = 'completed'
  ), 0)::bigint as total_rachat_fcfa,
  coalesce((
    select count(*) from public.rides r
    where r.driver_id = d.id and r.status = 'completed'
  ), 0)::int as completed_rides_count,
  coalesce((
    select count(*) from public.rides r
    where r.driver_id = d.id and r.status = 'cancelled_by_driver'
  ), 0)::int as cancelled_by_driver_count,
  d.cancellations_driver_fault_count as driver_fault_strikes,
  coalesce((
    select count(*) from public.rides r
    where r.driver_id = d.id and r.cancel_disputed = true
  ), 0)::int as pending_disputes_count
from public.drivers d
join public.profiles p on p.id = d.profile_id;

grant select on public.driver_admin_view to authenticated;
