-- ============================================================
-- RLS : le client et le chauffeur d'une même ride peuvent voir
-- le profil de l'autre (nom, phone, avatar) pendant / après la course.
--
-- Sans ça :
--   - ride_with_driver_details renvoie driver_full_name = null (car RLS
--     bloque le join sur profiles), donc la modal notation ne s'ouvre pas
--   - le driver-portal SELECT direct sur profiles renvoie null pour le
--     client, d'où l'affichage "Client" au lieu du vrai nom.
-- ============================================================

create policy profiles_select_ride_counterpart on public.profiles for select
using (
  -- Le chauffeur voit le profil du client de sa ride
  exists (
    select 1
    from public.rides r
    join public.drivers d on d.id = r.driver_id
    where d.profile_id = auth.uid()
      and r.client_id = profiles.id
      and r.status in (
        'matched','arrived','in_progress',
        'completed','cancelled_by_client','cancelled_by_driver'
      )
  )
  or
  -- Le client voit le profil du chauffeur de sa ride
  exists (
    select 1
    from public.rides r
    join public.drivers d on d.id = r.driver_id
    where r.client_id = auth.uid()
      and d.profile_id = profiles.id
      and r.status in (
        'matched','arrived','in_progress',
        'completed','cancelled_by_client','cancelled_by_driver'
      )
  )
);

comment on policy profiles_select_ride_counterpart on public.profiles is
  'Autorise le client et le chauffeur d''une ride à voir le profil de l''autre partie (nom/phone/avatar).';
