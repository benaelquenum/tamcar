-- Suivi des lignes NSIA (TamCar Office) : création d'une ligne avec son plan (rachats aux mois 24/48/72, chaîne de conducteurs 12 ou 24 mois),
-- droits par rôle (secrétariat écrit, expert-comptable lit seulement, autres rien, suppression réservée au fondateur). Rôles réels, tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/bo_nsia_lines.sql --workdir backend
do $$
declare
  adm uuid; stf uuid; acc uuid; usr uuid;
  out text := ''; moto public.bo_nsia_lines; car public.bo_nsia_lines;
  n int; n2 int; gap int;
begin
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select id into usr from public.profiles where role::text = 'client' limit 1;
  select id into stf from public.profiles where role::text = 'staff' limit 1;
  select id into acc from public.profiles where role::text = 'accountant' limit 1;
  -- s'il n'existe pas de secrétaire ou d'expert-comptable, on en fabrique dans la transaction (annulée)
  if stf is null then
    select id into stf from public.profiles where role::text = 'client' and id <> usr limit 1;
    update public.profiles set role = 'staff' where id = stf;
  end if;
  if acc is null then
    select id into acc from public.profiles where role::text = 'client' and id not in (usr, stf) limit 1;
    update public.profiles set role = 'accountant' where id = acc;
  end if;

  -- 1. le secrétariat crée une ligne moto et une ligne voiture avec leur plan
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  moto := public.bo_nsia_create_line('Ligne test moto', 'moto', date '2027-01-04');
  car := public.bo_nsia_create_line('Ligne test voiture', 'voiture', date '2027-01-04');
  reset role;
  select count(*) into n from public.bo_nsia_redemptions where line_id = moto.id;
  select count(*) into n2 from public.bo_nsia_periods where line_id = moto.id;
  out := out || '1a. ligne moto : durée conducteur=' || moto.contract_months || ' mois, rachats=' || n || ', périodes=' || n2
         || case when moto.contract_months = 12 and n = 3 and n2 = 6 then ' OK' else ' *** KO' end || E'\n';
  select count(*) into n from public.bo_nsia_redemptions where line_id = car.id;
  select count(*) into n2 from public.bo_nsia_periods where line_id = car.id;
  out := out || '1b. ligne voiture : durée conducteur=' || car.contract_months || ' mois, rachats=' || n || ', périodes=' || n2
         || case when car.contract_months = 24 and n = 3 and n2 = 3 then ' OK' else ' *** KO' end || E'\n';
  select count(*) into gap from (
    select starts_on - lag(planned_end_on) over (order by starts_on) as d from public.bo_nsia_periods where line_id = moto.id
  ) q where d is not null and d <> 1;
  out := out || '1c. chaîne moto continue (chaque période commence le lendemain de la précédente) : trous=' || gap || case when gap = 0 then ' OK' else ' *** KO' end || E'\n';

  -- 2. l'expert-comptable lit mais n'écrit pas
  perform set_config('request.jwt.claims', json_build_object('sub', acc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.bo_nsia_lines where id = moto.id;
  out := out || '2a. expert-comptable lit la ligne : ' || n || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  begin insert into public.bo_nsia_lines (label, vehicle_kind, opened_on) values ('intrus', 'moto', current_date); out := out || E'2b. expert-comptable crée une ligne *** KO\n';
  exception when others then out := out || '2b. expert-comptable ne peut pas créer une ligne OK' || E'\n'; end;
  begin perform public.bo_nsia_create_line('intrus', 'moto', current_date); out := out || E'2c. expert-comptable appelle la création *** KO\n';
  exception when others then out := out || '2c. expert-comptable ne peut pas utiliser la création OK' || E'\n'; end;
  reset role;

  -- 3. un client (hors back-office) ne voit rien et ne crée rien ; un anonyme non plus
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.bo_nsia_lines;
  out := out || '3a. client voit les lignes : ' || n || case when n = 0 then ' OK' else ' *** FUITE' end || E'\n';
  select count(*) into n from public.bo_nsia_periods;
  out := out || '3b. client voit les périodes : ' || n || case when n = 0 then ' OK' else ' *** FUITE' end || E'\n';
  begin perform public.bo_nsia_create_line('intrus', 'moto', current_date); out := out || E'3c. client appelle la création *** KO\n';
  exception when others then out := out || '3c. client ne peut pas utiliser la création OK' || E'\n'; end;
  reset role;
  set local role anon;
  begin select count(*) into n from public.bo_nsia_lines; out := out || '3d. anonyme lit les lignes : ' || n || ' *** KO' || E'\n';
  exception when others then out := out || '3d. anonyme refusé OK' || E'\n'; end;
  begin perform public.bo_nsia_create_line('intrus', 'moto', current_date); out := out || E'3e. anonyme appelle la création *** KO\n';
  exception when others then out := out || '3e. anonyme refusé OK' || E'\n'; end;
  reset role;

  -- 4. le secrétariat peut modifier mais pas supprimer ; le fondateur supprime
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.bo_nsia_periods set label = 'Conducteur 1 (Kokou)' where line_id = moto.id and starts_on = date '2027-01-04';
  get diagnostics n = row_count;
  out := out || '4a. secrétariat renomme une période : ' || n || ' ligne(s)' || case when n = 1 then ' OK' else ' *** KO' end || E'\n';
  delete from public.bo_nsia_lines where id = moto.id;
  get diagnostics n = row_count;
  out := out || '4b. secrétariat supprime la ligne : ' || n || ' ligne(s)' || case when n = 0 then ' OK (refusé)' else ' *** KO' end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.bo_nsia_lines where id = moto.id;
  get diagnostics n = row_count;
  reset role;
  select count(*) into n2 from public.bo_nsia_periods where line_id = moto.id;
  out := out || '4c. fondateur supprime la ligne : ' || n || ' ligne(s), périodes restantes=' || n2 || case when n = 1 and n2 = 0 then ' OK (suppression en cascade)' else ' *** KO' end || E'\n';

  raise exception E'RESULTATS\n%', out;
end $$;
