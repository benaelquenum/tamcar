-- ============================================================
-- Confidentialité partenaire (2026-10-07)
--
-- Règle : un partenaire véhicule ne voit QUE sa part (jamais le prix des courses ni la part du chauffeur ni l'identité
-- des clients). Constat (test en rôle partenaire) : la politique rides_select lui donnait un accès direct en lecture
-- à TOUTES les courses de ses véhicules (prix, parts chauffeur et plateforme, client, adresses) via l'API.
--
-- 1. Retrait de la clause « partenaire » de rides_select (ses chiffres passent par les fonctions dealer_my_*, qui
--    ne renvoient que sa part).
-- 2. Ses écrans se tenaient à jour grâce à ce droit de lecture (postgres_changes sur rides) : remplacés par une
--    diffusion publique SANS DONNÉES (« refresh ») sur le canal dealer-<identifiant partenaire> (l'identifiant est un UUID non devinable).
-- ============================================================

alter policy rides_select on public.rides
  using (
    client_id = (select auth.uid())
    or driver_id in (select d.id from public.drivers d where d.profile_id = (select auth.uid()))
    or (select is_admin())
  );

create or replace function public._ride_dealer_notify()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  begin
    perform realtime.send('{}'::jsonb, 'refresh', 'dealer-' || new.dealer_partner_id::text, false);
  exception when others then
    null;
  end;
  return null;
end;
$fn$;
revoke execute on function public._ride_dealer_notify() from public, anon, authenticated;

drop trigger if exists trg_ride_dealer_notify on public.rides;
create trigger trg_ride_dealer_notify
  after insert or update of status, driver_id, dealer_share_fcfa on public.rides
  for each row
  when (new.dealer_partner_id is not null)
  execute function public._ride_dealer_notify();
