-- Montant de la pénalité de réservation lisible par les applications (affiché dans les messages d'annulation et de désistement).
create or replace function public.booking_config()
returns table (penalty_fcfa int)
language sql stable security definer set search_path = public as $fn$
  select public._booking_penalty_amount();
$fn$;
revoke execute on function public.booking_config() from public, anon;
grant execute on function public.booking_config() to authenticated;
