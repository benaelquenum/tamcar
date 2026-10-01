-- ============================================================
-- TamCar — Durcissement : ce qu'un compte connecté pouvait écrire lui-même
-- (2026-10-01, audit)
--
-- Constat : les politiques RLS d'écriture sont TROP LARGES et aucune colonne
-- n'est protégée. Avec la clé publique du site (anon) et sa propre session,
-- n'importe quel compte pouvait, par un simple appel REST :
--   • profiles  : passer son propre `role` à 'admin' (is_admin() lit cette
--                 colonne) — prise de contrôle complète ;
--   • rides     : insérer / modifier une course (prix, parts, statut
--                 'completed', mode de paiement) — client comme chauffeur ;
--                 le trigger de fin de course crédite alors les portefeuilles
--                 à partir de ces montants ;
--   • drivers   : changer son statut, sa formule (cession → propriétaire =
--                 80 % au lieu de 40 %), sa note, son véhicule, et se mettre
--                 « en ligne » en contournant le blocage de dette ;
--   • ratings   : noter n'importe quelle course (fausser la note d'un chauffeur).
--
-- Correctif : des triggers « garde » refusent ces écritures quand elles
-- viennent directement d'un compte connecté (rôle SQL `authenticated` ou
-- `anon`). Le chemin normal ne change pas :
--   • les fonctions SECURITY DEFINER (create_ride, accept_ride, les
--     transitions de course…) s'exécutent avec les droits de leur
--     propriétaire : elles passent ;
--   • le service_role du back-office et les administrateurs passent ;
--   • les colonnes que l'application écrit légitimement (nom, avatar,
--     position du chauffeur, bascule hors ligne…) ne sont pas gardées.
-- Les quatre fonctions de transition de course qui écrivaient `rides` avec
-- les droits du chauffeur deviennent SECURITY DEFINER (mêmes contrôles
-- d'appartenance qu'avant).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Qui écrit ? un appel direct d'un compte connecté, ni admin ni fonction
-- ------------------------------------------------------------
create or replace function public._is_direct_user_write()
returns boolean
language sql stable set search_path = public as $$
  select current_user in ('authenticated', 'anon') and not public.is_admin();
$$;

grant execute on function public._is_direct_user_write() to authenticated, anon;

-- ------------------------------------------------------------
-- 2. profiles : le rôle ne se change pas soi-même
-- ------------------------------------------------------------
create or replace function public._guard_profile_update()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role and public._is_direct_user_write() then
    raise exception 'Le rôle d''un compte ne peut pas être modifié depuis l''application.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_update on public.profiles;
create trigger trg_guard_profile_update
  before update on public.profiles
  for each row execute function public._guard_profile_update();

-- ------------------------------------------------------------
-- 3. drivers : statut, formule, note, véhicule et mise en ligne sont réservés
--    (driver_go_online devient SECURITY DEFINER : le blocage de dette s'y
--     applique, une écriture directe de is_online ne le contourne plus)
-- ------------------------------------------------------------
create or replace function public._guard_driver_update()
returns trigger
language plpgsql set search_path = public as $$
begin
  if public._is_direct_user_write() and (
       new.status is distinct from old.status
    or new.kyc_status is distinct from old.kyc_status
    or new.application_type is distinct from old.application_type
    or new.rating_avg is distinct from old.rating_avg
    or new.rating_count is distinct from old.rating_count
    or new.profile_id is distinct from old.profile_id
    or new.current_vehicle_id is distinct from old.current_vehicle_id
    or new.archived_at is distinct from old.archived_at
    or new.cancellations_driver_fault_count is distinct from old.cancellations_driver_fault_count
    or (new.is_online and not old.is_online)
  ) then
    raise exception 'Cette information du profil chauffeur ne peut pas être modifiée depuis l''application.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_driver_update on public.drivers;
create trigger trg_guard_driver_update
  before update on public.drivers
  for each row execute function public._guard_driver_update();

create or replace function public.driver_go_online(
  current_lng double precision,
  current_lat double precision
)
returns public.drivers
language plpgsql security definer set search_path = public as $$
declare
  result public.drivers;
  v_balance int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  -- Blocage dette : tolérance de découvert de 5 000 F.
  -- Revenus < −5 000 => recharger le wallet avant de repasser en ligne.
  select balance_fcfa into v_balance from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus';
  if coalesce(v_balance, 0) < -5000 then
    raise exception 'Dette de % F (tolérance 5 000 F dépassée). Rechargez au moins % F pour repasser en ligne.',
      (-v_balance), (-v_balance - 5000)
      using errcode = 'P0001';
  end if;

  update public.drivers
  set is_online = true,
      current_location = st_setsrid(st_makepoint(current_lng, current_lat), 4326)::geography,
      last_seen_at = now(),
      updated_at = now()
  where profile_id = auth.uid()
  returning * into result;

  if result is null then
    raise exception 'Not a driver';
  end if;
  return result;
end;
$$;

grant execute on function public.driver_go_online(double precision, double precision) to authenticated;

-- ------------------------------------------------------------
-- 4. rides : plus d'écriture directe ; les transitions chauffeur passent
--    par des fonctions qui contrôlent l'appartenance de la course
-- ------------------------------------------------------------
create or replace function public.driver_arrived(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  result public.rides;
begin
  perform public._assert_ride_driver(ride_id, array['matched']::ride_status[]);
  update public.rides
  set status = 'arrived', updated_at = now()
  where id = ride_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.driver_arrived(
  ride_id uuid,
  distance_m int default null
)
returns public.rides
language plpgsql security definer set search_path = public as $$
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

create or replace function public.driver_start_ride(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  result public.rides;
begin
  perform public._assert_ride_driver(ride_id, array['arrived', 'matched']::ride_status[]);
  update public.rides
  set status = 'in_progress', started_at = now(), updated_at = now()
  where id = ride_id
  returning * into result;
  return result;
end;
$$;

create or replace function public.driver_complete_ride(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  result public.rides;
begin
  perform public._assert_ride_driver(ride_id, array['in_progress']::ride_status[]);
  update public.rides
  set status = 'completed', ended_at = now(), updated_at = now()
  where id = ride_id
  returning * into result;
  return result;
end;
$$;

grant execute on function public.driver_arrived(uuid) to authenticated;
grant execute on function public.driver_arrived(uuid, int) to authenticated;
grant execute on function public.driver_start_ride(uuid) to authenticated;
grant execute on function public.driver_complete_ride(uuid) to authenticated;

create or replace function public._guard_ride_write()
returns trigger
language plpgsql set search_path = public as $$
begin
  if public._is_direct_user_write() then
    raise exception 'Une course ne peut être créée ou modifiée que par les fonctions de l''application.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_ride_write on public.rides;
create trigger trg_guard_ride_write
  before insert or update or delete on public.rides
  for each row execute function public._guard_ride_write();

-- Une course directe n'est lisible que de son chauffeur visé (le pool
-- ordinaire reste ouvert aux chauffeurs en ligne).
drop policy if exists rides_driver_pool_read on public.rides;

create policy rides_driver_pool_read on public.rides for select
  using (
    status in ('requested', 'scheduled')
    and driver_id is null
    and (
      requested_driver_id is null
      or requested_driver_id in (select id from public.drivers where profile_id = auth.uid())
    )
    and exists (
      select 1 from public.drivers
      where profile_id = auth.uid()
        and is_online = true
        and status = 'active'
    )
  );

-- ------------------------------------------------------------
-- 5. ratings : la note passe par rate_ride (contrôle de la course)
-- ------------------------------------------------------------
create or replace function public._guard_rating_insert()
returns trigger
language plpgsql set search_path = public as $$
begin
  if public._is_direct_user_write() then
    raise exception 'Une note s''enregistre depuis l''écran de fin de course.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_rating_insert on public.ratings;
create trigger trg_guard_rating_insert
  before insert on public.ratings
  for each row execute function public._guard_rating_insert();
