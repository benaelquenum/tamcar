-- ============================================================
-- TamCar — Verrouillage des fonctions internes (2026-08-06)  [SÉCURITÉ]
--
--   PROBLÈME
--   PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction nouvellement
--   créée, et PostgREST expose l'intégralité du schéma `public`. Une
--   fonction `security definer` sans contrôle d'accès en tête est donc
--   appelable par n'importe quel compte connecté via /rest/v1/rpc/<nom>,
--   et s'exécute avec les droits de son propriétaire.
--
--   Deux cas confirmés dans le dépôt :
--
--   1. public._admin_upsert_profile(text, text, user_role)
--      — ÉLÉVATION DE PRIVILÈGE. Aucun contrôle d'accès, et la fonction
--      exécute `update public.profiles set role = p_role where ...`.
--      Un client de l'application pouvait appeler la fonction avec son
--      propre numéro et p_role => 'admin' pour devenir administrateur.
--      La fonction est par ailleurs CASSÉE depuis sa création : elle
--      insère dans public.profiles un identifiant tiré au hasard alors
--      que profiles.id référence auth.users(id) — toute création d'une
--      personne inconnue échoue en violation de clé étrangère.
--      Elle n'est appelée par AUCUN code applicatif : les chauffeurs et
--      partenaires véhicule sont créés par les server actions de
--      apps/client (auth.admin.createUser + écriture directe), qui
--      fonctionnent correctement. → SUPPRIMÉE, ainsi que les deux
--      fonctions mortes qui en dépendaient.
--
--   2. public._grant_goodwill_credit(uuid, uuid, uuid)
--      — crédite 200 F le portefeuille d'un client, sans contrôle
--      d'accès (plafonné à 2 fois par semaine). → verrouillée ci-dessous.
--
--   CORRECTIF SYSTÉMATIQUE
--   Plutôt que d'énumérer les fonctions au cas par cas, on révoque
--   EXECUTE sur TOUTES les fonctions internes de `public` (convention du
--   projet : préfixe « _ »), hors fonctions déclencheurs. Les appels
--   internes continuent de fonctionner : une fonction `security definer`
--   s'exécute avec les droits de son propriétaire, qui conserve EXECUTE.
--   Vérifié au préalable : aucun code applicatif n'appelle de RPC
--   préfixée « _ », à la seule exception de _is_within_service_zone,
--   appelée par la fonction edge tamy-webhook avec la clé de service —
--   ré-accordée explicitement en fin de fichier.
--
--   RÈGLE À TENIR : toute nouvelle fonction interne préfixée « _ » doit
--   être révoquée à sa création. Rejouer ce fichier suffit à rattraper.
-- ============================================================

-- ---------- 1. Suppression des fonctions mortes et vulnérables ----------
drop function if exists public.admin_register_dealer(text, text, text, text, numeric, boolean, numeric);
drop function if exists public.admin_register_driver(text, text, driver_application_type, text, text);
drop function if exists public._admin_upsert_profile(text, text, user_role);

-- ---------- 2. Verrou systématique sur les fonctions internes ----------
do $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like '\_%'              -- convention : interne
      and p.prorettype <> 'trigger'::regtype -- les fonctions déclencheurs
                                             -- ne sont pas appelables en RPC
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    v_count := v_count + 1;
  end loop;
  raise notice 'Fonctions internes verrouillées : %', v_count;
end $$;

-- ---------- 3. Réaccords nécessaires ----------
-- tamy-webhook (clé de service) vérifie la zone de service avant de
-- proposer un prix, pour renvoyer un message clair plutôt qu'une exception.
grant execute on function public._is_within_service_zone(double precision, double precision)
  to service_role;
