-- Date de démarrage des forfaits internet, lisible par l'équipe (la valeur vit dans _push_settings, non lisible depuis l'application).
create or replace function public.data_bundle_start()
returns date
language sql stable security definer set search_path = public as $fn$
  select public._data_bundle_start();
$fn$;
revoke execute on function public.data_bundle_start() from public, anon;
grant execute on function public.data_bundle_start() to authenticated;
