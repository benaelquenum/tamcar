-- ============================================================
-- Élargit preview_alternative_offers :
--   Moto     → tricycle, essentiel, confort
--   Tricycle → moto, essentiel, confort
--   Confort  → moto, tricycle, essentiel
--   Essentiel → moto, tricycle, confort (inchangé)
-- ============================================================

create or replace function public.preview_alternative_offers(p_ride_id uuid)
returns table (
  category vehicle_category,
  new_price_fcfa int,
  delta_fcfa int,          -- négatif = économie, positif = supplément
  drivers_online_nearby int
)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rides;
  pickup_g geography;
  cat vehicle_category;
  candidate_cats vehicle_category[];
  quote record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;

  pickup_g := r.pickup_location;

  if r.requested_category = 'essentiel' then
    candidate_cats := array['moto','tricycle','confort']::vehicle_category[];
  elsif r.requested_category = 'confort' then
    candidate_cats := array['moto','tricycle','essentiel']::vehicle_category[];
  elsif r.requested_category = 'moto' then
    candidate_cats := array['tricycle','essentiel','confort']::vehicle_category[];
  elsif r.requested_category = 'tricycle' then
    candidate_cats := array['moto','essentiel','confort']::vehicle_category[];
  else
    candidate_cats := array[]::vehicle_category[];
  end if;

  foreach cat in array candidate_cats loop
    select * into quote from public.compute_price(
      st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
      st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
      r.distance_km, r.duration_min, cat, false, false
    ) limit 1;

    return query
    select
      cat,
      quote.price_total_fcfa,
      quote.price_total_fcfa - r.price_total_fcfa,
      (
        select count(*)::int from public.drivers d
        join public.vehicles v on v.id = d.current_vehicle_id
        where d.is_online = true
          and d.status = 'active'
          and v.category = cat
          and st_dwithin(d.current_location, pickup_g, 10000)
      );
  end loop;
end;
$$;
