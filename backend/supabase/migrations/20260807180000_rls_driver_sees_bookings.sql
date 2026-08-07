-- ============================================================
-- TamCar — RLS : le chauffeur ne pouvait PAS lire les réservations
-- 2026-08-07. Cause racine du « Courses autour 0 » malgré le push.
--
--   La politique rides_select ne laisse un chauffeur voir une course que
--   si elle lui est DÉJÀ attribuée (driver_id). Le pool ouvert passe par
--   une seconde politique, rides_driver_pool_read (20260715200000) :
--
--     status = 'requested' and driver_id is null and <chauffeur en ligne>
--
--   Elle ne couvre que 'requested'. Une réservation est en 'scheduled'
--   avec driver_id null : elle est donc INVISIBLE au chauffeur.
--
--   Pourquoi le push partait quand même : _notify_scheduled_booking est
--   `security definer`, elle ignore RLS. Alors que
--   pending_scheduled_rides_for_driver est `security invoker` — elle
--   s'exécute avec les droits du chauffeur et ne remontait donc jamais
--   la moindre ligne. La fonction est correcte, c'est la politique qui
--   ne suit pas.
--
--   Conséquence : l'offre de réservation aux chauffeurs n'a jamais
--   fonctionné depuis sa création (20260728020000), ni dans l'ancienne
--   section dédiée, ni dans le fil unifié.
--
--   L'exposition ajoutée est exactement celle du pool immédiat : une
--   course sans chauffeur, visible des seuls chauffeurs en ligne et
--   actifs. Le filtrage fin (distance, catégorie) reste dans la RPC.
-- ============================================================

drop policy if exists rides_driver_pool_read on public.rides;

create policy rides_driver_pool_read on public.rides for select
  using (
    status in ('requested', 'scheduled')
    and driver_id is null
    and exists (
      select 1 from public.drivers
      where profile_id = auth.uid()
        and is_online = true
        and status = 'active'
    )
  );

comment on policy rides_driver_pool_read on public.rides is
  'Pool ouvert : courses immédiates ET réservations sans chauffeur, lisibles par tout chauffeur en ligne et actif. Sans le statut scheduled, pending_scheduled_rides_for_driver (security invoker) ne renvoyait jamais rien.';
