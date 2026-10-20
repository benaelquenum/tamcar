-- Démarrage des prélèvements le 20 octobre 2026 (décision du fondateur, 2026-10-20), au lieu du 1er janvier 2027 :
--   • cotisation TamAssur (22 h, heure de Porto-Novo) pour les chauffeurs hors versement quotidien ;
--   • versement quotidien de la formule Cession (clôture à 00 h 10 pour la veille) : manque sur l'objectif prélevé, 834 F épargnés par jour travaillé.
-- Le bonus de performance (crédit, non prélèvement) garde sa date (performance_bonus_from).
update public._push_settings set value = '2026-10-20' where key in ('floor_debit_from', 'tamassur_debit_from');

-- Les tâches du contrôle des véhicules et des avis de fin de contrat sont planifiées en UTC : 5 h et 5 h 30 à Porto-Novo (UTC+1) = 4 h et 4 h 30 UTC.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'vehicle-compliance') then perform cron.unschedule('vehicle-compliance'); end if;
  perform cron.schedule('vehicle-compliance', '0 4 * * *', 'select public._vehicle_compliance_sweep()');
  if exists (select 1 from cron.job where jobname = 'cession-end-notices') then perform cron.unschedule('cession-end-notices'); end if;
  perform cron.schedule('cession-end-notices', '30 4 * * *', 'select public._notify_cession_end()');
end
$do$;
