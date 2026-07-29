-- ============================================================
-- TamCar — Blocage mise en ligne si dette (2026-07-29)  [Phase 3]
--
--   Un chauffeur dont le wallet Revenus est négatif (dette = commissions
--   de courses encaissées en direct, cf Phase 1) ne peut PAS repasser en
--   ligne tant qu'il n'a pas régularisé (Phase 2). Seuil = 0 : dès que le
--   solde passe sous 0, mise en ligne refusée, peu importe le montant.
--   (driver_go_offline reste toujours possible.)
-- ============================================================

create or replace function public.driver_go_online(
  current_lng double precision,
  current_lat double precision
)
returns public.drivers
language plpgsql security invoker as $$
declare
  result public.drivers;
  v_balance int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  -- Blocage dette : Revenus < 0 => régulariser avant de repasser en ligne
  select balance_fcfa into v_balance from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus';
  if coalesce(v_balance, 0) < 0 then
    raise exception 'Dette de % F à régler avant de repasser en ligne.', (-v_balance)
      using errcode = 'P0001';
  end if;

  update public.drivers
  set is_online = true,
      current_location = st_setsrid(st_makepoint(current_lng, current_lat), 4326)::geography,
      last_seen_at = now(),
      updated_at = now()
  where profile_id = auth.uid()
  returning * into result;

  if result is null then
    raise exception 'Not a driver';
  end if;
  return result;
end;
$$;
