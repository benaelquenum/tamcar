-- Réglages éditables depuis /admin/bonus : mode TEST des paiements, virements automatiques, durée TamAssur par véhicule.
-- Avant : « payments_test_mode » (à passer à 0 au lancement) n'était modifiable nulle part, et la règle « une cotisation
-- quotidienne doit être d'au moins 100 F » (clés tamassur_%) refusait les durées en mois (12, 24).
create or replace function public.admin_set_program_rule(p_key text, p_value int)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_value is null or p_value < 0 then raise exception 'Valeur invalide'; end if;
  if (p_key like 'share_%' or p_key in ('surplus_cede_pct', 'tamassur_fund_pct')) and p_value > 100 then
    raise exception 'Un pourcentage ne peut pas dépasser 100.';
  end if;
  if p_key like 'tamassur_months_%' then
    if p_value < 1 or p_value > 120 then raise exception 'Une durée doit être comprise entre 1 et 120 mois.'; end if;
  elsif p_key like 'tamassur_%' and p_key <> 'tamassur_fund_pct' and p_value < 100 then
    raise exception 'Une cotisation quotidienne doit être d''au moins 100 F.';
  end if;
  if p_key in ('payments_test_mode', 'payouts_auto') and p_value not in (0, 1) then
    raise exception 'Ce réglage se règle sur 1 (activé) ou 0 (désactivé).';
  end if;
  if p_key = 'prio_enabled' and p_value not in (0, 1) then
    raise exception 'La priorité de proximité se règle sur 1 (active) ou 0 (désactivée).';
  end if;
  if p_key like 'prio_r%_m' and (p_value < 500 or p_value > 50000) then
    raise exception 'Un rayon doit être compris entre 500 m et 50 000 m.';
  end if;
  if p_key like 'prio_d%_s' and p_value > 300 then
    raise exception 'Un délai ne peut pas dépasser 300 secondes.';
  end if;
  update public.program_rules set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'Réglage inconnu'; end if;
end;
$fn$;
revoke execute on function public.admin_set_program_rule(text, int) from public, anon;
grant execute on function public.admin_set_program_rule(text, int) to authenticated;
