-- ============================================================
-- TamCar — Notation mutuelle post-course (2026-07-15)
--
-- rate_ride(ride_id, stars, comment) : le user connecté (client ou
-- chauffeur) note l'autre partie. Sur conflit (ride+rater), UPDATE.
-- Le trigger update_driver_rating (créé initial_schema) recalcule
-- rating_avg + rating_count sur drivers automatiquement.
-- ============================================================

create or replace function public.rate_ride(
  p_ride_id uuid,
  p_stars int,
  p_comment text default null
)
returns public.ratings
language plpgsql security invoker as $$
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

  -- Détermine rated_id selon qui note
  if ride_row.client_id = auth.uid() then
    -- Client note le chauffeur → besoin du profile_id du driver
    if ride_row.driver_id is null then raise exception 'No driver on this ride'; end if;
    select profile_id into driver_profile_id
    from public.drivers where id = ride_row.driver_id;
    rated_id := driver_profile_id;
  else
    -- Le rater est peut-être le chauffeur ?
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

comment on function public.rate_ride is
  'Le user connecté (client OU chauffeur) note l''autre partie de la ride. Insert ou update (unique ride+rater). Recalcule rating_avg driver via trigger update_driver_rating.';

-- ------------------------------------------------------------
-- has_rated_ride : shortcut pour l'UI (afficher modal ou pas)
-- ------------------------------------------------------------
create or replace function public.has_rated_ride(p_ride_id uuid)
returns boolean
language sql stable security invoker as $$
  select exists (
    select 1 from public.ratings
    where ride_id = p_ride_id and rater_id = auth.uid()
  );
$$;
