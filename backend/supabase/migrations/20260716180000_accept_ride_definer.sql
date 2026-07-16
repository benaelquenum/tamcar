-- ============================================================
-- Fix accept_ride : passer en SECURITY DEFINER (2026-07-16)
--
-- La policy rides_update exige déjà driver_id = auth.uid()'s driver, or
-- accept_ride passe précisément de driver_id=NULL à driver_id=X, donc
-- l'UPDATE renvoie 0 ligne et lève "Ride already taken" à tort.
--
-- SECURITY DEFINER bypass la RLS. On garde les checks explicites (auth.uid()
-- non NULL, driver actif+online+vehicle assigné, pas de course active).
-- ============================================================

create or replace function public.accept_ride(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  driver_row public.drivers;
  dealer_id uuid;
  result public.rides;
  total int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer_share int;
  new_platform int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into driver_row
  from public.drivers where profile_id = auth.uid();

  if driver_row is null then raise exception 'Not a driver'; end if;
  if driver_row.status <> 'active' or not driver_row.is_online then
    raise exception 'Driver not active or offline';
  end if;
  if driver_row.current_vehicle_id is null then
    raise exception 'No vehicle assigned';
  end if;

  if exists (
    select 1 from public.rides
    where driver_id = driver_row.id
      and status in ('matched', 'arrived', 'in_progress')
  ) then
    raise exception 'Course active déjà en cours — termine-la avant.';
  end if;

  select dealer_partner_id into dealer_id
   from public.vehicles where id = driver_row.current_vehicle_id;

  select price_total_fcfa into total
   from public.rides where id = ride_id;

  if total is null then raise exception 'Ride introuvable'; end if;

  if driver_row.application_type = 'proprietaire' then
    new_driver_cash := floor(total * 0.80)::int;
    new_driver_rachat := 0;
    new_dealer_share := 0;
    new_platform := total - new_driver_cash;
  else
    new_driver_cash := floor(total * 0.40)::int;
    new_driver_rachat := floor(total * 0.10)::int;
    new_dealer_share := floor(total * 0.30)::int;
    new_platform := total - new_driver_cash - new_driver_rachat - new_dealer_share;
  end if;

  update public.rides
  set driver_id = driver_row.id,
      vehicle_id = driver_row.current_vehicle_id,
      dealer_partner_id = case
        when driver_row.application_type = 'proprietaire' then null
        else dealer_id
      end,
      driver_share_fcfa = new_driver_cash,
      driver_rachat_fcfa = new_driver_rachat,
      dealer_share_fcfa = new_dealer_share,
      platform_share_fcfa = new_platform,
      status = 'matched',
      matched_at = now(),
      updated_at = now()
  where id = ride_id
    and status = 'requested'
    and driver_id is null
  returning * into result;

  if result is null then raise exception 'Ride already taken or unavailable'; end if;
  return result;
end;
$$;

comment on function public.accept_ride is
  'SECURITY DEFINER — bypass RLS pour permettre au premier chauffeur qui accepte de passer driver_id NULL → X. Checks internes garantissent que seul un driver active+online+vehicle assigné peut appeler.';
