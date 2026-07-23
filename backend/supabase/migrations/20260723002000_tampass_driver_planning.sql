-- ============================================================
-- TamPass — planning chauffeur
-- RPC pour le portail chauffeur : ses trajets TamPass d'une date
-- (trajets où il est chauffeur attitré OU chauffeur verrouillé).
-- Security definer : contourne la RLS de subscription_rides qui ne
-- couvre que le final_driver_id.
-- ============================================================

create or replace function public.tampass_driver_planning(p_date date)
returns table (
  subscription_ride_id uuid,
  travel_date date,
  slot_time time,
  direction text,
  status text,
  client_first_name text,
  from_address text,
  to_address text,
  category vehicle_category,
  is_final boolean,
  ride_id uuid
)
language sql stable security definer set search_path = public as $fn_plan$
  select
    sr.id,
    sr.travel_date,
    sr.slot_time,
    sr.direction,
    sr.status,
    split_part(coalesce(p.full_name, 'Client'), ' ', 1),
    case when sr.direction = 'aller' then s.origin_address else s.dropoff_address end,
    case when sr.direction = 'aller' then s.dropoff_address else s.origin_address end,
    s.category,
    (sr.final_driver_id is not null and sr.final_driver_id = d.id),
    sr.ride_id
  from public.subscription_rides sr
  join public.subscriptions s on s.id = sr.subscription_id
  join public.profiles p on p.id = s.client_id
  join public.drivers d on d.profile_id = auth.uid()
  where sr.travel_date = p_date
    and sr.status in ('planned', 'generated')
    and (s.preferred_driver_id = d.id or sr.final_driver_id = d.id)
  order by sr.slot_time;
$fn_plan$;

grant execute on function public.tampass_driver_planning to authenticated;
