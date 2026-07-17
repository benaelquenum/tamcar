-- ============================================================
-- Fixes 2026-07-17 (session ride v2) :
--
-- 1. rate_ride : passait en security invoker et faisait
--    "select profile_id from drivers where id = ride.driver_id".
--    La RLS drivers cache le row aux non-drivers → profile_id = null
--    → erreur "No target to rate" quand le client note.
--    On passe en security definer (les checks d'auth restent
--    faits dans le corps du RPC).
--
-- 2. ride_stops n'était PAS dans la publication supabase_realtime,
--    donc le chauffeur ne recevait aucun événement quand le client
--    ajoutait / retirait / réordonnait un arrêt.
-- ============================================================

-- 1. rate_ride en security definer
create or replace function public.rate_ride(
  p_ride_id uuid,
  p_stars int,
  p_comment text default null
)
returns public.ratings
language plpgsql security definer set search_path = public as $$
declare
  ride_row public.rides;
  driver_profile_id uuid;
  rated_id uuid;
  result public.ratings;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_stars < 1 or p_stars > 5 then raise exception 'Stars must be between 1 and 5'; end if;

  select * into ride_row from public.rides where id = p_ride_id;
  if ride_row is null then raise exception 'Ride not found'; end if;
  if ride_row.status <> 'completed' then
    raise exception 'Can only rate completed rides';
  end if;

  if ride_row.client_id = auth.uid() then
    -- Client note le chauffeur
    if ride_row.driver_id is null then raise exception 'No driver on this ride'; end if;
    select profile_id into driver_profile_id
      from public.drivers where id = ride_row.driver_id;
    rated_id := driver_profile_id;
  else
    -- Le chauffeur note le client
    if ride_row.driver_id is null then raise exception 'Not authorized'; end if;
    if not exists (
      select 1 from public.drivers
      where id = ride_row.driver_id and profile_id = auth.uid()
    ) then
      raise exception 'Not authorized to rate this ride';
    end if;
    rated_id := ride_row.client_id;
  end if;

  if rated_id is null then raise exception 'No target to rate'; end if;

  insert into public.ratings (ride_id, rater_id, rated_id, stars, comment)
  values (
    p_ride_id, auth.uid(), rated_id, p_stars,
    nullif(trim(coalesce(p_comment, '')), '')
  )
  on conflict (ride_id, rater_id) do update
    set stars = excluded.stars,
        comment = excluded.comment
  returning * into result;

  return result;
end;
$$;

-- 2. ride_stops dans supabase_realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.ride_stops;
  exception when duplicate_object then
    -- déjà dans la publication
    null;
  end;
end $$;
