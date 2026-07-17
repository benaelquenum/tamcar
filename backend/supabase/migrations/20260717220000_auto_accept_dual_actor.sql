-- ============================================================
-- Fix : auto_accept_completion ne pouvait être déclenchée que par
-- le client_id. Si son navigateur est fermé/en veille au moment
-- où le compteur expire, la course reste bloquée en 'in_progress'.
--
-- On autorise aussi le chauffeur assigné à appeler ce RPC : dès qu'un
-- des deux navigateurs voit le compteur atteindre 0, il peut forcer.
-- ============================================================

create or replace function public.auto_accept_completion(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  is_client boolean;
  is_driver boolean;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;

  is_client := r.client_id = auth.uid();
  is_driver := r.driver_id is not null and exists (
    select 1 from public.drivers
     where id = r.driver_id and profile_id = auth.uid()
  );

  if not (is_client or is_driver) then
    raise exception 'Not your ride';
  end if;

  if r.completion_auto_accept_at is null then
    raise exception 'Aucune demande de fin de course en attente';
  end if;
  if now() < r.completion_auto_accept_at then
    raise exception 'Délai chauffeur pas encore écoulé';
  end if;

  -- Idempotent : si déjà completed on retourne juste la ride
  if r.status = 'completed' then
    return r;
  end if;

  return public._apply_completion(ride_id);
end;
$$;

comment on function public.auto_accept_completion is
  'Force la fin de course quand le délai chauffeur a expiré. Callable par le client OU le chauffeur assigné (fallback si le navigateur du client est fermé).';
