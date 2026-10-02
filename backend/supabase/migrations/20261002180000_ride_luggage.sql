-- ============================================================
-- Bagages : le client peut les signaler, le chauffeur le voit avant d'accepter
-- (2026-10-02)
--
-- Décisions Terence :
--   • déclaration FACULTATIVE, mise en avant automatique sur le corridor
--     Cotonou ↔ Porto-Novo et pour les départs aéroport ou gare ;
--   • message pour moto et tricycle (bagages limités) ;
--   • AUCUN supplément de prix.
--
-- La colonne est posée sur la course juste après sa création par la fonction
-- set_ride_luggage (create_ride n'est pas modifiée). Les chauffeurs lisent le
-- drapeau par leurs droits habituels sur les courses du pool et les leurs.
-- ============================================================

alter table public.rides
  add column if not exists has_luggage boolean not null default false;

create or replace function public.set_ride_luggage(p_ride_id uuid, p_has_luggage boolean)
returns void
language plpgsql security definer set search_path = public as $fn_srl$
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  update public.rides
     set has_luggage = coalesce(p_has_luggage, false),
         updated_at = now()
   where id = p_ride_id
     and client_id = auth.uid()
     and status in ('requested', 'scheduled', 'matched', 'arrived');
end;
$fn_srl$;

revoke all on function public.set_ride_luggage(uuid, boolean) from public, anon;
grant execute on function public.set_ride_luggage(uuid, boolean) to authenticated;
