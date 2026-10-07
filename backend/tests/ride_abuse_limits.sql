-- Limites anti-abus : un client peut-il empiler des demandes de course simultanées (chaque demande déclenche une alerte sonore chez les
-- chauffeurs proches) ? Rôles réels, tout est annulé. Usage : supabase db query --linked -f backend/tests/ride_abuse_limits.sql --workdir backend
do $$
declare
  c uuid; r public.rides; out text := ''; i int; ok int := 0; last_err text;
  plat double precision := 6.4969; plng double precision := 2.6283;
begin
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1 .. 8 loop
    begin
      r := public.create_ride('moto', plat + i * 0.0001, plng, 'Départ ' || i, 6.5100, 2.6000, 'Arrivée', 3.2, 12);
      ok := ok + 1;
    exception when others then last_err := sqlerrm; exit; end;
  end loop;
  out := out || 'demandes simultanées acceptées pour un même client : ' || ok || ' sur 8 tentatives' ||
         case when ok >= 8 then ' *** AUCUNE LIMITE (un client peut inonder les chauffeurs d''alertes)' else ' (limite atteinte : ' || coalesce(last_err, '?') || ')' end || E'\n';
  reset role;
  raise exception E'RESULTATS\n%', out;
end $$;
