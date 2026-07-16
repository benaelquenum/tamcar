-- ============================================================
-- RPC client_complete_ride (2026-07-16)
--
-- C'est désormais le CLIENT qui termine la course quand il estime être arrivé
-- (règle produit Terence). Le chauffeur peut toujours cliquer "démarrer" mais
-- ne peut plus terminer. Le trigger credit_wallets_on_ride_complete continue
-- de fonctionner à l'identique.
-- ============================================================

create or replace function public.client_complete_ride(ride_id uuid)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  update public.rides
  set status = 'completed',
      ended_at = now(),
      updated_at = now()
  where id = ride_id
    and client_id = auth.uid()
    and status = 'in_progress'
  returning * into result;

  if result is null then
    raise exception 'Course non terminable : inexistante, pas la tienne, ou pas encore démarrée.';
  end if;

  return result;
end;
$$;

comment on function public.client_complete_ride is
  'Le client termine sa course quand il est à destination. Passe status in_progress → completed, déclenche le trigger de crédit des wallets.';
