-- ============================================================
-- TamPass — détail d'un pass côté client (tous trajets + identité
-- des chauffeurs ayant assuré le transport).
-- Security definer : contourne la RLS sur drivers/profiles/vehicles
-- pour exposer l'identité du chauffeur au client — garde stricte :
-- le client ne voit QUE les trajets de SES pass (s.client_id = auth.uid()).
-- ============================================================

create or replace function public.tampass_pass_detail(p_subscription_id uuid)
returns table (
  subscription_ride_id uuid,
  travel_date date,
  direction text,
  slot_time time,
  status text,
  driver_name text,
  driver_rating numeric,
  vehicle_label text,
  ride_status text,
  price_total_fcfa int,
  started_at timestamptz,
  ended_at timestamptz
)
language sql stable security definer set search_path = public as $fn_detail$
  select
    sr.id,
    sr.travel_date,
    sr.direction,
    sr.slot_time,
    sr.status,
    pr.full_name,
    d.rating_avg,
    case when v.id is not null
         then v.brand || ' ' || v.model
              || coalesce(' · ' || v.color, '')
              || ' · ' || v.plate_number
         else null end,
    r.status::text,
    r.price_total_fcfa,
    r.started_at,
    r.ended_at
  from public.subscription_rides sr
  join public.subscriptions s on s.id = sr.subscription_id
  left join public.rides r on r.id = sr.ride_id
  left join public.drivers d on d.id = coalesce(sr.final_driver_id, r.driver_id)
  left join public.profiles pr on pr.id = d.profile_id
  left join public.vehicles v on v.id = r.vehicle_id
  where sr.subscription_id = p_subscription_id
    and s.client_id = auth.uid()
  order by sr.travel_date desc, sr.slot_time;
$fn_detail$;

grant execute on function public.tampass_pass_detail to authenticated;
