-- ============================================================
-- Flag "arrivé hors zone" pour audit admin (2026-07-16)
--
-- Si le chauffeur clique "Je suis arrivé" à plus de 100 m du point de départ,
-- on garde en trace la distance + un flag booléen que l'admin peut filtrer.
-- ============================================================

alter table public.rides
  add column if not exists arrived_at timestamptz,
  add column if not exists arrival_distance_m int,
  add column if not exists arrival_flagged boolean not null default false;

create index if not exists rides_arrival_flagged_idx
  on public.rides(arrival_flagged)
  where arrival_flagged = true;

-- ------------------------------------------------------------
-- driver_arrived enrichie : accepte distance_m optionnel
-- Set arrived_at, arrival_distance_m, arrival_flagged automatiquement
-- Drop de l'ancienne signature (1 arg) pour éviter l'ambiguïté
-- ------------------------------------------------------------
drop function if exists public.driver_arrived(uuid);

create or replace function public.driver_arrived(
  ride_id uuid,
  distance_m int default null
)
returns public.rides
language plpgsql security invoker as $$
declare
  result public.rides;
begin
  perform public._assert_ride_driver(ride_id, array['matched']::ride_status[]);
  update public.rides
  set status = 'arrived',
      arrived_at = now(),
      arrival_distance_m = distance_m,
      arrival_flagged = (distance_m is not null and distance_m > 100),
      updated_at = now()
  where id = ride_id
  returning * into result;
  return result;
end;
$$;

comment on function public.driver_arrived is
  'Chauffeur marque le point de départ atteint. Persiste distance_m ↔ pickup ; flag admin si > 100 m.';
