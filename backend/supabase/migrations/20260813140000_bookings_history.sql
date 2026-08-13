-- ============================================================
-- TamCar — Consulter ses réservations, à venir comme passées
-- Décision Terence 2026-08-13.
--
--   Jusqu'ici, une réservation n'était consultable que tant qu'elle était
--   à venir : my_scheduled_rides et my_accepted_scheduled_rides filtrent
--   toutes deux sur `scheduled_at > now()`. Passé l'heure de départ, elle
--   disparaissait de l'écran des deux parties. Elle restait bien dans
--   l'historique — mais confondue avec une course ordinaire, sans son
--   heure de départ ni la moindre marque la distinguant.
--
--   Deux fonctions symétriques, une par côté, avec une portée :
--     'upcoming' = la réservation n'est pas encore soldée
--     'past'     = terminée, annulée ou expirée
--     'all'      = les deux, à venir d'abord
--
--   Le partage se fait sur le STATUT et non sur l'heure : une réservation
--   dont l'heure est passée mais qui roule encore reste « à venir ». Se
--   fier à scheduled_at > now() est précisément ce qui faisait disparaître
--   les courses en silence.
--
--   security definer avec filtre explicite sur auth.uid() : même logique
--   que my_accepted_scheduled_rides, et aucune dépendance aux politiques
--   RLS de `profiles` pour lire le nom de la contrepartie.
-- ============================================================

-- Statuts considérés comme « non soldés ».
create or replace function public._booking_is_live(p_status ride_status)
returns boolean
language sql immutable as $$
  select p_status in ('scheduled', 'requested', 'matched', 'arrived', 'in_progress');
$$;

revoke all on function public._booking_is_live(ride_status) from public, anon;
grant execute on function public._booking_is_live(ride_status) to authenticated;

-- ------------------------------------------------------------
-- 1. Côté client
-- ------------------------------------------------------------
create or replace function public.my_bookings(p_scope text default 'all')
returns table (
  id uuid,
  status ride_status,
  scheduled_at timestamptz,
  pickup_address text,
  dropoff_address text,
  price_total_fcfa int,
  requested_category vehicle_category,
  payment_method payment_method,
  driver_full_name text,
  driver_phone text,
  driver_confirmed boolean,
  is_upcoming boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  return query
  select
    r.id, r.status, r.scheduled_at, r.pickup_address, r.dropoff_address,
    r.price_total_fcfa, r.requested_category, r.payment_method,
    dp.full_name,
    -- Le numéro n'est utile qu'une fois le chauffeur engagé, et seulement
    -- tant que la course n'est pas soldée.
    case when r.driver_id is not null and public._booking_is_live(r.status)
         then dp.phone end,
    (r.driver_id is not null),
    public._booking_is_live(r.status)
  from public.rides r
  left join public.drivers d on d.id = r.driver_id
  left join public.profiles dp on dp.id = d.profile_id
  where r.client_id = auth.uid()
    and r.scheduled_at is not null
    and (
      p_scope = 'all'
      or (p_scope = 'upcoming' and public._booking_is_live(r.status))
      or (p_scope = 'past' and not public._booking_is_live(r.status))
    )
  order by
    public._booking_is_live(r.status) desc,
    case when public._booking_is_live(r.status) then r.scheduled_at end asc,
    r.scheduled_at desc
  limit 100;
end;
$$;
grant execute on function public.my_bookings(text) to authenticated;

comment on function public.my_bookings is
  'Réservations du client connecté. p_scope : upcoming | past | all. Le partage se fait sur le statut, pas sur l''heure — une réservation en retard mais en cours reste « à venir ».';

-- ------------------------------------------------------------
-- 2. Côté chauffeur
-- ------------------------------------------------------------
create or replace function public.driver_bookings(p_scope text default 'all')
returns table (
  id uuid,
  status ride_status,
  scheduled_at timestamptz,
  pickup_address text,
  dropoff_address text,
  price_total_fcfa int,
  driver_share_fcfa int,
  requested_category vehicle_category,
  client_first_name text,
  client_phone text,
  is_upcoming boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_drv_id uuid;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select id into v_drv_id from public.drivers where profile_id = auth.uid() limit 1;
  if v_drv_id is null then return; end if;

  return query
  select
    r.id, r.status, r.scheduled_at, r.pickup_address, r.dropoff_address,
    r.price_total_fcfa, r.driver_share_fcfa, r.requested_category,
    -- Le passager prime : c'est lui que le chauffeur va chercher.
    split_part(
      coalesce(nullif(trim(r.passenger_name), ''), cp.full_name, 'Client'), ' ', 1
    ),
    case when public._booking_is_live(r.status)
         then coalesce(nullif(trim(r.passenger_phone), ''), cp.phone) end,
    public._booking_is_live(r.status)
  from public.rides r
  left join public.profiles cp on cp.id = r.client_id
  where r.driver_id = v_drv_id
    and r.scheduled_at is not null
    and (
      p_scope = 'all'
      or (p_scope = 'upcoming' and public._booking_is_live(r.status))
      or (p_scope = 'past' and not public._booking_is_live(r.status))
    )
  order by
    public._booking_is_live(r.status) desc,
    case when public._booking_is_live(r.status) then r.scheduled_at end asc,
    r.scheduled_at desc
  limit 100;
end;
$$;
grant execute on function public.driver_bookings(text) to authenticated;

comment on function public.driver_bookings is
  'Réservations acceptées par le chauffeur connecté, à venir comme passées. p_scope : upcoming | past | all.';
