-- ============================================================
-- Fin de course avant la destination : le prix au prorata ne dépasse JAMAIS
-- le prix initial (2026-10-02)
--
-- Bug : client_request_completion appliquait un plancher de 700 F écrit en dur
-- (« minimum de course » de l'ancienne grille) et un arrondi au 50 F supérieur,
-- sans jamais comparer au prix de départ. Une course à 450 F (moto), 500 F
-- (Essentiel) ou 600 F terminée trop tôt était donc recalculée à 700 F :
-- le client payait PLUS pour un trajet plus court.
--
-- Correctif :
--   • le plancher est le minimum de course de la CATÉGORIE (table pricing_tiers),
--     ou 30 % du prix, le plus grand des deux ;
--   • le résultat est plafonné au prix initial : une course écourtée ne coûte
--     jamais plus cher que la course complète.
-- Le reste de la fonction est inchangé (fin directe à moins de 500 m, délai de
-- 10 s laissé au chauffeur pour refuser). Les droits d'exécution sont conservés.
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
  v_min int;
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

  -- Minimum de course de la catégorie demandée (500 si inconnue).
  select t.min_course_fcfa into v_min
    from public.pricing_tiers t
   where t.category = coalesce(r.requested_category, 'essentiel'::vehicle_category);
  v_min := coalesce(v_min, 500);

  price_floor := public.ceil_to_50(greatest(v_min, floor(r.price_total_fcfa * 0.30)::int));
  recomputed := public.ceil_to_50(greatest(price_floor, floor(r.price_total_fcfa * ratio)::int));
  -- Jamais plus que le prix initial.
  recomputed := least(recomputed, r.price_total_fcfa);

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

comment on function public.client_request_completion(uuid, double precision, double precision) is
  'Le client demande la fin de course. Fin directe à ≤ 500 m de la destination, sinon prix recalculé au prorata de la distance parcourue : plancher = max(minimum de course de la catégorie, 30 % du prix), plafond = prix initial. Le chauffeur a 10 s pour refuser.';
