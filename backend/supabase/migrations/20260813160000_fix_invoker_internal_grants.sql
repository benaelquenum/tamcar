-- ============================================================
-- TamCar — Réparation des droits sur les fonctions internes [URGENT]
-- 2026-08-13.
--
--   SYMPTÔME
--   « permission denied for function _assert_ride_driver » au clic sur
--   « Je suis arrivé au point de départ ».
--
--   CAUSE
--   La migration 20260806140000 révoque EXECUTE à `authenticated` sur
--   toutes les fonctions préfixées « _ ». Or une fonction publique
--   déclarée `security invoker` s'exécute avec les droits de l'APPELANT :
--   si son corps appelle une fonction interne, c'est `authenticated` qui
--   doit pouvoir l'exécuter. J'avais rendu le droit à deux d'entre elles,
--   pas à la troisième.
--
--   PORTÉE RÉELLE — _assert_ride_driver est appelée par :
--     driver_arrived, driver_start_ride, driver_complete_ride
--   soit TOUT le déroulé d'une course côté chauffeur. Une course pouvait
--   être acceptée mais plus jamais avancer ni se terminer : sans passage
--   à 'completed', aucun portefeuille n'est crédité.
--
--   PRÉVENTION
--   Le bloc final détecte et répare le cas de figure automatiquement, au
--   lieu de dépendre d'une liste tenue à la main. Il est rejouable et
--   n'accorde que le strict nécessaire : une fonction interne n'est
--   ré-autorisée que si elle est appelée depuis une fonction publique
--   `security invoker` déjà exposée à `authenticated`.
-- ============================================================

-- ---------- 1. Le cas constaté ----------
grant execute on function public._assert_ride_driver(uuid, ride_status[])
  to authenticated;

-- ---------- 2. Réparation générique, rejouable ----------
do $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select distinct interne.oid::regprocedure as sig,
                    interne.proname as nom
    from pg_proc pub
    join pg_namespace n on n.oid = pub.pronamespace
    cross join lateral (
      select p2.oid, p2.proname
      from pg_proc p2
      join pg_namespace n2 on n2.oid = p2.pronamespace
      where n2.nspname = 'public'
        and p2.proname like '\_%'
        and p2.prorettype <> 'trigger'::regtype
        -- appel explicite « public._xxx( » dans le corps
        and pub.prosrc ~ ('public\.' || p2.proname || '\s*\(')
    ) interne
    where n.nspname = 'public'
      and pub.proname not like '\_%'          -- fonction exposée
      and not pub.prosecdef                   -- security invoker
      and has_function_privilege('authenticated', pub.oid, 'execute')
      and not has_function_privilege('authenticated', interne.oid, 'execute')
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
    raise notice 'Droit rendu : % (appelée depuis une RPC security invoker)', r.nom;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise notice 'Aucune fonction interne manquante — droits cohérents.';
  else
    raise notice 'Fonctions internes ré-autorisées : %', v_count;
  end if;
end $$;
