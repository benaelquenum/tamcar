-- ============================================================
-- TamPass — abonnés d'un chauffeur (les pass dont il est l'attitré).
-- Security definer : la RLS de subscriptions ne laisse voir que le
-- client ; ici on expose au chauffeur les pass ACTIFS où il est
-- preferred_driver_id — garde : d.profile_id = auth.uid().
-- ============================================================

create or replace function public.tampass_driver_subscriptions()
returns table (
  subscription_id uuid,
  client_first_name text,
  category vehicle_category,
  origin_address text,
  dropoff_address text,
  days_of_week int[],
  slot_out time,
  slot_return time,
  status text,
  rides_total int,
  rides_remaining int,
  starts_on date,
  expires_on date
)
language sql stable security definer set search_path = public as $fn_drvsub$
  select
    s.id,
    split_part(coalesce(p.full_name, 'Client'), ' ', 1),
    s.category,
    s.origin_address,
    s.dropoff_address,
    s.days_of_week,
    s.slot_out,
    s.slot_return,
    s.status,
    s.rides_total,
    s.rides_remaining,
    s.starts_on,
    s.expires_on
  from public.subscriptions s
  join public.drivers d on d.id = s.preferred_driver_id
  join public.profiles p on p.id = s.client_id
  where d.profile_id = auth.uid()
    and s.status in ('active', 'paused')
  order by s.created_at desc;
$fn_drvsub$;

grant execute on function public.tampass_driver_subscriptions to authenticated;
