-- ============================================================
-- RPC cancel_ride_by_client (2026-07-16)
--
-- Le client peut annuler tant que la course n'est pas 'in_progress' ou 'completed'.
-- SECURITY DEFINER pour bypass RLS (le check auth.uid() = client_id reste explicite).
-- Barème d'annulation (facturation frais) : à implémenter dans une itération suivante
-- (voir mémoire projet section 8) — pour l'instant, annulation gratuite MVP.
-- ============================================================

create or replace function public.cancel_ride_by_client(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  update public.rides
  set status = 'cancelled_by_client',
      ended_at = now(),
      updated_at = now()
  where id = ride_id
    and client_id = auth.uid()
    and status in ('requested', 'matched', 'arrived')
  returning * into result;

  if result is null then
    raise exception 'Impossible d''annuler : course inexistante, pas la tienne, ou déjà en cours/terminée.';
  end if;

  return result;
end;
$$;

comment on function public.cancel_ride_by_client is
  'Client annule sa course tant que status ∈ (requested, matched, arrived). Gratuit MVP, barème à activer plus tard.';

-- ------------------------------------------------------------
-- my_active_ride : renvoie la course active du user courant, s'il en a une.
-- Utilisé par la home client pour afficher un onglet notification.
-- ------------------------------------------------------------
create or replace function public.my_active_ride()
returns table (
  id uuid,
  status ride_status,
  pickup_address text,
  dropoff_address text,
  price_total_fcfa int,
  requested_at timestamptz,
  matched_at timestamptz,
  driver_full_name text
)
language sql stable security invoker as $$
  select
    r.id,
    r.status,
    r.pickup_address,
    r.dropoff_address,
    r.price_total_fcfa,
    r.requested_at,
    r.matched_at,
    p.full_name as driver_full_name
  from public.rides r
  left join public.drivers d on d.id = r.driver_id
  left join public.profiles p on p.id = d.profile_id
  where r.client_id = auth.uid()
    and r.status in ('requested', 'matched', 'arrived', 'in_progress')
  order by r.requested_at desc
  limit 1;
$$;
