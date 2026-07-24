-- ============================================================
-- TamCar — Compteur global de messages non lus (2026-07-24)
--   Pour afficher une bulle sur l'accueil (client + chauffeur),
--   pas seulement sur l'écran de la course.
-- ============================================================

create or replace function public.my_unread_messages_count()
returns table (unread_count int, ride_id uuid)
language sql stable security definer set search_path = public as $fn_unread$
  with mine as (
    select m.id, m.ride_id, m.created_at
    from public.ride_messages m
    join public.rides r on r.id = m.ride_id
    left join public.drivers d on d.id = r.driver_id
    where m.read_at is null
      and m.sender_id <> auth.uid()
      and (r.client_id = auth.uid() or d.profile_id = auth.uid())
      -- La bulle disparaît dès que la course est terminée ou annulée.
      and r.status in ('requested', 'matched', 'arrived', 'in_progress')
  )
  select
    (select count(*)::int from mine) as unread_count,
    (select ride_id from mine order by created_at desc limit 1) as ride_id;
$fn_unread$;

grant execute on function public.my_unread_messages_count to authenticated;
