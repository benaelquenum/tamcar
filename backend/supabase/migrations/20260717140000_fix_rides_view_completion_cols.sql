-- ============================================================
-- Fix : rides_view manque les colonnes completion_* ajoutées en Vague A
-- (et aussi arrival_* de la Vague admin flag + stops_*).
-- On recrée la vue avec toutes les colonnes de la table rides.
-- ============================================================

drop view if exists public.rides_view cascade;

create or replace view public.rides_view
with (security_invoker = true)
as
select
  r.id,
  r.client_id,
  r.driver_id,
  r.vehicle_id,
  r.dealer_partner_id,
  r.pickup_address,
  st_x(r.pickup_location::geometry) as pickup_lng,
  st_y(r.pickup_location::geometry) as pickup_lat,
  r.dropoff_address,
  st_x(r.dropoff_location::geometry) as dropoff_lng,
  st_y(r.dropoff_location::geometry) as dropoff_lat,
  r.distance_km,
  r.duration_min,
  r.price_total_fcfa,
  r.driver_share_fcfa,
  r.driver_rachat_fcfa,
  r.dealer_share_fcfa,
  r.platform_share_fcfa,
  r.status,
  r.payment_method,
  r.scheduled_at,
  r.requested_at,
  r.matched_at,
  r.started_at,
  r.ended_at,
  r.cancelled_at,
  r.cancel_reason,
  -- Colonnes ajoutées en Vague admin flag
  r.arrived_at,
  r.arrival_distance_m,
  r.arrival_flagged,
  -- Colonnes ajoutées en Vague A (fin de course en 2 étapes)
  r.completion_requested_at,
  r.completion_requested_lat,
  r.completion_requested_lng,
  r.completion_distance_from_dropoff_m,
  r.completion_recomputed_price_fcfa,
  r.completion_auto_accept_at,
  -- Colonnes ajoutées en Vague B (arrêts intermédiaires)
  r.stops_count,
  r.stops_extra_price_fcfa,
  r.stops_waiting_fee_fcfa,
  r.created_at,
  r.updated_at
from public.rides r;

comment on view public.rides_view is
  'Vue rides complète avec pickup/dropoff lat/lng séparés + toutes colonnes des vagues successives.';

grant select on public.rides_view to authenticated, anon;
