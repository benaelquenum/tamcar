-- ============================================================
-- TamCar — Position live du CLIENT, même modèle que le chauffeur
-- (2026-07-30)
--
--   Miroir du pipeline chauffeur : le client remonte sa position en BDD
--   pendant la course active (heartbeat ~15 s, foreground + suivi natif
--   arrière-plan). Le chauffeur l'utilise en REPLI quand le broadcast
--   live s'arrête (app client en arrière-plan) : broadcast d'abord,
--   BDD ensuite — exactement comme côté client pour le chauffeur.
--   Stockée sur la course (seule fenêtre où elle est pertinente).
-- ============================================================

-- 1. Colonnes position live client sur rides ---------------------------
alter table public.rides add column if not exists client_live_lat double precision;
alter table public.rides add column if not exists client_live_lng double precision;
alter table public.rides add column if not exists client_live_at timestamptz;

-- 2. RPC : le client (payeur) remonte sa position pendant SA course ----
create or replace function public.client_update_location(
  p_ride_id uuid,
  p_lng double precision,
  p_lat double precision
)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  update public.rides
     set client_live_lat = p_lat,
         client_live_lng = p_lng,
         client_live_at = now()
   where id = p_ride_id
     and client_id = auth.uid()
     and status in ('matched', 'arrived', 'in_progress');
end;
$fn$;

revoke execute on function public.client_update_location(uuid, double precision, double precision) from public, anon;
grant execute on function public.client_update_location(uuid, double precision, double precision) to authenticated;

-- 3. rides_view : expose la position live client (ajout EN FIN de vue) --
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
  r.arrived_at,
  r.arrival_distance_m,
  r.arrival_flagged,
  r.completion_requested_at,
  r.completion_requested_lat,
  r.completion_requested_lng,
  r.completion_distance_from_dropoff_m,
  r.completion_recomputed_price_fcfa,
  r.completion_auto_accept_at,
  r.stops_count,
  r.stops_extra_price_fcfa,
  r.stops_waiting_fee_fcfa,
  r.created_at,
  r.updated_at,
  r.passenger_name,
  r.passenger_phone,
  r.client_live_lat,
  r.client_live_lng,
  r.client_live_at
from public.rides r;

grant select on public.rides_view to authenticated, anon;
