-- Simulation (tout est annulé) : ce que feraient ce soir les prélèvements TamAssur (22 h) et le versement quotidien (00 h 10) si leur date de démarrage
-- était aujourd'hui. Aucune écriture ne subsiste : la fonction se termine par une exception qui annule la transaction.
-- Usage : bash runtest.sh start_debits_dry_run
do $$
declare
  out text := ''; r record; today date := (now() at time zone 'Africa/Porto-Novo')::date; j1 jsonb; j2 jsonb;
begin
  create temp table snap on commit drop as
    select w.profile_id, w.kind::text as kind, w.balance_fcfa from public.wallets w;
  update public._push_settings set value = today::text where key in ('floor_debit_from', 'tamassur_debit_from');
  j1 := public.charge_driver_insurance(today);
  j2 := public.charge_driver_floor(today);
  out := out || 'TamAssur (22 h) : ' || j1::text || E'\n' || 'Versement quotidien (00 h 10) : ' || j2::text || E'\n\n';
  for r in
    select p.full_name, d.application_type::text as formule, d.status::text as st, coalesce(v.category::text, '-') as cat,
           coalesce(s.balance_fcfa, 0) as avant, coalesce(w.balance_fcfa, 0) as apres, w.kind::text as kind
      from public.drivers d
      join public.profiles p on p.id = d.profile_id
      left join public.vehicles v on v.id = d.current_vehicle_id
      join public.wallets w on w.profile_id = d.profile_id and w.kind::text in ('tamcar_revenus', 'tamcar_epargne')
      left join snap s on s.profile_id = w.profile_id and s.kind = w.kind::text
     where d.status::text <> 'archived' and coalesce(s.balance_fcfa, 0) <> w.balance_fcfa
     order by p.full_name, w.kind::text
  loop
    out := out || r.full_name || ' (' || r.formule || ', ' || r.cat || ') ' || r.kind || ' : ' || r.avant || ' -> ' || r.apres || E'\n';
  end loop;
  raise exception 'RESULTATS%', E'\n' || out;
end $$;
