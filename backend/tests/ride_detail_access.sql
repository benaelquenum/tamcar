-- Accès au détail d'une course par un tiers : un partenaire véhicule, un autre client, un autre chauffeur et un visiteur ne doivent
-- rien obtenir des fonctions de détail (adresses, prix, messages, arrêts) d'une course qui n'est pas la leur.
-- Usage : supabase db query --linked -f backend/tests/ride_detail_access.sql --workdir backend  (résultat dans « RESULTATS »)
do $$
declare
  dealer_prof uuid; c uuid; other uuid; other_drv uuid; ride uuid;
  out text := '';
  n int;
  role_name text;
  uid uuid;
  roles text[] := array['partenaire', 'autre client', 'autre chauffeur', 'anonyme'];
  i int;
begin
  select dp.profile_id into dealer_prof
    from public.dealer_partners dp join public.rides r on r.dealer_partner_id = dp.id group by dp.profile_id order by count(*) desc limit 1;
  select r.id, r.client_id into ride, c from public.rides r where r.dealer_partner_id is not null order by r.requested_at desc limit 1;
  select p.id into other from public.profiles p where p.role::text = 'client' and p.id <> c and p.id <> coalesce(dealer_prof, c) limit 1;
  select dr.profile_id into other_drv from public.drivers dr
   where dr.id not in (select driver_id from public.rides where id = ride and driver_id is not null) limit 1;

  for i in 1 .. 4 loop
    role_name := roles[i];
    uid := case i when 1 then dealer_prof when 2 then other when 3 then other_drv else null end;
    if i < 4 and uid is null then continue; end if;
    if i = 4 then
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      set local role anon;
    else
      perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
      set local role authenticated;
    end if;
    begin
      select count(*) into n from public.ride_with_driver_details(ride);
      out := out || rpad(role_name, 16) || ' ride_with_driver_details : ' || n || ' ligne(s) ' || case when n = 0 then 'OK' else '*** FUITE' end || E'\n';
    exception when others then out := out || rpad(role_name, 16) || ' ride_with_driver_details : refusé (' || left(sqlerrm, 40) || E') OK\n'; end;
    begin
      select count(*) into n from public.ride_messages_history(ride);
      out := out || rpad(role_name, 16) || ' ride_messages_history : ' || n || ' ligne(s) ' || case when n = 0 then 'OK' else '*** FUITE' end || E'\n';
    exception when others then out := out || rpad(role_name, 16) || ' ride_messages_history : refusé (' || left(sqlerrm, 40) || E') OK\n'; end;
    begin
      select count(*) into n from public.ride_stops_of(ride);
      out := out || rpad(role_name, 16) || ' ride_stops_of : ' || n || ' ligne(s) ' || case when n = 0 then 'OK' else '*** FUITE' end || E'\n';
    exception when others then out := out || rpad(role_name, 16) || ' ride_stops_of : refusé (' || left(sqlerrm, 40) || E') OK\n'; end;
    begin
      select count(*) into n from public.rides where id = ride;
      out := out || rpad(role_name, 16) || ' table rides : ' || n || ' ligne(s) ' || case when n = 0 then 'OK' else '*** FUITE' end || E'\n';
    exception when others then out := out || rpad(role_name, 16) || ' table rides : refusé OK' || E'\n'; end;
    reset role;
  end loop;

  raise exception E'RESULTATS\n%', out;
end $$;
