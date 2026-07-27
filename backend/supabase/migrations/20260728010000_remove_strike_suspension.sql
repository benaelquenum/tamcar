-- ============================================================
-- Retrait de la POLITIQUE DE STRIKES (auto-suspension des chauffeurs).
-- Décision Terence 2026-07-28.
--
-- Ce qu'on RETIRE : le comptage de strikes et l'auto-suspension à ≥5
-- strikes / 30 jours (elle bloquait des chauffeurs — ex. le chauffeur
-- moto ne recevait plus aucune course car status='suspended').
--
-- Ce qu'on GARDE : les pénalités MONÉTAIRES d'annulation abusive, qui
-- vivent dans cancel_ride_by_client / cancel_ride_by_driver et sont
-- indépendantes des strikes :
--   • client qui annule tardivement → frais débités + chauffeur remboursé ;
--   • chauffeur fautif → course gratuite pour le client (+ crédit d'excuse
--     financé par le chauffeur si la migration 20260727150000 est passée).
--
-- Méthode : _apply_driver_strike devient un no-op (on garde sa signature
-- pour ne pas casser les appels existants dans cancel_ride_by_client et
-- admin_resolve_cancellation_dispute).
-- ============================================================

create or replace function public._apply_driver_strike(
  p_driver_id uuid,
  p_ride_id uuid,
  p_reason_label text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Politique de strikes retirée : aucun comptage, aucune auto-suspension.
  return;
end;
$$;

comment on function public._apply_driver_strike is
  'No-op depuis 2026-07-28 — politique de strikes retirée. Conservé pour compat des appels. Les pénalités monétaires d''annulation restent dans cancel_ride_by_client.';

-- Réactive tous les chauffeurs suspendus : l'auto-suspension par strikes
-- était le seul mécanisme automatique de suspension. (Un admin peut
-- toujours suspendre manuellement via admin_suspend_driver si besoin.)
update public.drivers
  set status = 'active', updated_at = now()
  where status = 'suspended';

-- Remet à zéro les compteurs de strikes (plus utilisés).
update public.drivers
  set cancellations_driver_fault_count = 0
  where cancellations_driver_fault_count > 0;
