-- ============================================================
-- Auto-accept de la fin de course : 20 s → 10 s (décision Terence 2026-07-27)
-- Redéfinit client_request_completion (dernière version = 20260717250000,
-- avec ceil_to_50) en changeant uniquement le délai d'attente chauffeur.
-- Le frontend affiche déjà 10 s ; on aligne le backend.
-- ============================================================

create or replace function public.client_request_completion(
  ride_id uuid,
  actual_lat double precision,
  actual_lng double precision
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  result public.rides;
  dist_to_dropoff_m double precision;
  original_distance_km numeric;
  travelled_km numeric;
  ratio numeric;
  recomputed int;
  price_floor int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status <> 'in_progress' then raise exception 'Course pas encore démarrée'; end if;

  dist_to_dropoff_m := st_distance(
    st_makepoint(actual_lng, actual_lat)::geography,
    r.dropoff_location
  );

  if dist_to_dropoff_m <= 500 then
    update public.rides
    set status = 'completed', ended_at = now(), updated_at = now()
    where id = ride_id returning * into result;
    return result;
  end if;

  original_distance_km := r.distance_km;
  travelled_km := greatest(0, original_distance_km - (dist_to_dropoff_m / 1000.0));
  ratio := case when original_distance_km > 0 then travelled_km / original_distance_km else 0 end;
  price_floor := public.ceil_to_50(greatest(700, floor(r.price_total_fcfa * 0.30)::int));
  recomputed := public.ceil_to_50(greatest(price_floor, floor(r.price_total_fcfa * ratio)::int));

  update public.rides
  set completion_requested_at = now(),
      completion_requested_lat = actual_lat,
      completion_requested_lng = actual_lng,
      completion_distance_from_dropoff_m = round(dist_to_dropoff_m)::int,
      completion_recomputed_price_fcfa = recomputed,
      completion_auto_accept_at = now() + interval '10 seconds',
      updated_at = now()
  where id = ride_id
  returning * into result;

  return result;
end;
$$;
