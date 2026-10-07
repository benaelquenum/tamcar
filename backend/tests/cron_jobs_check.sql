-- Exécute une fois chaque tâche planifiée (pg_cron) pour vérifier qu aucune ne plante ; tout est annulé.
-- Usage : supabase db query --linked -f backend/tests/cron_jobs_check.sql --workdir backend  (résultat dans « RESULTATS »)
do $$
declare out text := ''; j jsonb;
begin
  begin j := public.tampass_nightly(); out := out || 'tampass_nightly : OK ' || j::text || E'\n';
  exception when others then out := out || 'tampass_nightly : ECHEC ' || sqlerrm || E'\n'; end;
  begin j := public.tampass_sync(); out := out || 'tampass_sync : OK ' || j::text || E'\n';
  exception when others then out := out || 'tampass_sync : ECHEC ' || sqlerrm || E'\n'; end;
  begin perform public.tampass_monitor(); out := out || E'tampass_monitor : OK\n';
  exception when others then out := out || 'tampass_monitor : ECHEC ' || sqlerrm || E'\n'; end;
  begin perform public._scheduled_rides_tick(); out := out || E'_scheduled_rides_tick : OK\n';
  exception when others then out := out || '_scheduled_rides_tick : ECHEC ' || sqlerrm || E'\n'; end;
  begin perform public._expire_stale_requests(); perform public._expire_stale_calls(); perform public._rentals_tick(); perform public._ride_live_tick(); perform public._push_ring_openings();
    out := out || E'tâches de chaque minute / 5 s : OK\n';
  exception when others then out := out || 'tâches minute : ECHEC ' || sqlerrm || E'\n'; end;
  begin perform public._debt_guard_sweep(); perform public._remind_upcoming_bookings(); out := out || E'_debt_guard_sweep, _remind_upcoming_bookings : OK\n';
  exception when others then out := out || 'debt/remind : ECHEC ' || sqlerrm || E'\n'; end;
  begin perform public.charge_driver_insurance(); perform public.award_performance_bonus(); perform public._charge_senteur(); out := out || E'charge_driver_insurance, award_performance_bonus, _charge_senteur : OK\n';
  exception when others then out := out || 'tâches du soir : ECHEC ' || sqlerrm || E'\n'; end;
  begin perform public._run_daily_backup(); out := out || E'_run_daily_backup : OK\n';
  exception when others then out := out || '_run_daily_backup : ECHEC ' || sqlerrm || E'\n'; end;
  begin perform public._check_backup_health(); out := out || E'_check_backup_health : OK\n';
  exception when others then out := out || '_check_backup_health : ECHEC ' || sqlerrm || E'\n'; end;
  raise exception E'RESULTATS\n%', out;
end $$;
