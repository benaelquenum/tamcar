-- ============================================================
-- Connexion par numéro de téléphone (2026-10-28)
--
-- Le téléphone sert d'identifiant à la place de l'email : l'application retrouve
-- l'email du compte à partir du numéro, puis ouvre la session avec le mot de passe
-- (aucun SMS : aucun fournisseur SMS n'est branché).
--
--   _login_email_for_phone(numéro, chauffeur_seulement)  interne, réservée au service
--       (client web : action serveur avec la clé de service). Renvoie l'email si UN SEUL
--       compte porte ce numéro (huit derniers chiffres), sinon null.
--   driver_login_email(numéro)  appelable sans être connecté, pour le portail chauffeur
--       (qui n'a pas la clé de service). Elle ne répond QUE pour un chauffeur dont l'email
--       est un identifiant interne « @tamcar.local » (créé par l'équipe, non joignable) :
--       jamais un vrai email de client ou de partenaire.
-- ============================================================
create or replace function public._login_email_for_phone(p_phone text, p_driver_only boolean default false)
returns text
language sql stable security definer set search_path = public, auth as $fn$
  select case when count(*) = 1 then max(u.email) else null end
  from public.profiles p
  join auth.users u on u.id = p.id
  where length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 8
    and nullif(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), '') is not null
    and right(regexp_replace(p.phone, '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8)
    and (not p_driver_only or (p.role::text = 'driver' and u.email like '%@tamcar.local'));
$fn$;
revoke all on function public._login_email_for_phone(text, boolean) from public, anon, authenticated;
grant execute on function public._login_email_for_phone(text, boolean) to service_role;

create or replace function public.driver_login_email(p_phone text)
returns text
language sql stable security definer set search_path = public, auth as $fn$
  select public._login_email_for_phone(p_phone, true);
$fn$;
grant execute on function public.driver_login_email(text) to anon, authenticated;
