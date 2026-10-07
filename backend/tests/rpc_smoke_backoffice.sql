-- Test de contrat : toutes les fonctions de LECTURE exposées sont appelées pour chaque rôle avec des paramètres réalistes.
-- Une erreur de classe 42 (colonne / fonction / relation inexistante, droit manquant), XX, 0A ou 22P = BUG.
-- Les refus métier (P0001), « Auth required » et les droits refusés à un rôle non concerné sont normaux.
-- GÉNÉRÉ par scratchpad/review/gen_smoke.py ; usage : supabase db query --linked -f backend/tests/rpc_smoke.sql --workdir backend
create or replace function pg_temp.try_call(p_fn text, p_args text) returns void language plpgsql as $f$
declare
  v_sql text;
  v_state text;
  v_msg text;
begin
  v_sql := replace(replace(replace(format('select * from public.%I(%s)', p_fn, p_args), ':ride', quote_literal(current_setting('smoke.ride'))||'::uuid'),
                           ':drv', quote_literal(current_setting('smoke.drv'))||'::uuid'),
                   ':uid', quote_literal(current_setting('smoke.uid'))||'::uuid');
  begin
    execute v_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state like '42%' and v_state <> '42501' or v_state like 'XX%' or v_state like '0A%' or v_state like '22P%' or v_state like '53%' or v_state like '54%' or v_state like '58%'
       or v_state like '2F%' or v_state like '21%' or v_state = '42501' and current_setting('smoke.role') <> 'anon' and v_msg not ilike '%execute%' then
      perform set_config('smoke.bugs', current_setting('smoke.bugs') || current_setting('smoke.role') || ' ' || p_fn || ' [' || v_state || '] ' || left(v_msg, 110) || E'\n', true);
    end if;
  end;
end $f$;

do $$
declare
  c uuid; d_prof uuid; adm uuid; dealer uuid; ops uuid; ride uuid; drv uuid;
  roles uuid[]; labels text[]; i int; n int;
begin
  select r0.client_id into c from public.rides r0 group by r0.client_id order by count(*) desc limit 1;
  select dr.profile_id, dr.id into d_prof, drv from public.drivers dr where dr.status = 'active' limit 1;
  select id into adm from public.profiles where role::text = 'admin' limit 1;
  select profile_id into dealer from public.dealer_partners limit 1;
  select profile_id into ops from public.ops_city_managers limit 1;
  select r0.id into ride from public.rides r0 where r0.client_id = c order by r0.requested_at desc limit 1;
  perform set_config('smoke.ride', ride::text, true);
  perform set_config('smoke.drv', drv::text, true);
  perform set_config('smoke.bugs', '', true);
  roles := array[adm];
  labels := array['admin'];
  for i in 1 .. array_length(roles, 1) loop
    continue when roles[i] is null;
    perform set_config('smoke.uid', roles[i]::text, true);
    perform set_config('smoke.role', labels[i], true);
    perform set_config('request.jwt.claims', json_build_object('sub', roles[i], 'role', 'authenticated')::text, true);
    set local role authenticated;
      perform pg_temp.try_call('bo_account_ledger', $a$'a', current_date, current_date$a$);
      perform pg_temp.try_call('bo_cash_flow', $a$current_date, current_date$a$);
      perform pg_temp.try_call('bo_compute_its', $a$10$a$);
      perform pg_temp.try_call('bo_financial_statement', $a$'a', current_date, current_date, current_date, current_date$a$);
      perform pg_temp.try_call('bo_fs_checks', $a$current_date, current_date$a$);
      perform pg_temp.try_call('bo_hr_alerts', $a$10$a$);
      perform pg_temp.try_call('bo_leave_balances', '');
      perform pg_temp.try_call('bo_platform_float', '');
      perform pg_temp.try_call('bo_treasury_position', '');
      perform pg_temp.try_call('bo_trial_balance', $a$current_date, current_date$a$);
      perform pg_temp.try_call('bo_working_days', $a$current_date, current_date$a$);
    reset role;
  end loop;
  raise exception E'RESULTATS % fonctions x % rôles\n%', 11, array_length(labels, 1),
    case when current_setting('smoke.bugs') = '' then 'aucune erreur d''exécution' else current_setting('smoke.bugs') end;
end $$;
