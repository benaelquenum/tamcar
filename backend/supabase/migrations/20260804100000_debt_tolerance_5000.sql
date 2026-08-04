-- ============================================================
-- TamCar — Tolérance de découvert wallet chauffeur (2026-08-04)
--
--   Décision : le blocage de mise en ligne ne se déclenche plus dès
--   que le wallet Revenus passe sous 0, mais seulement sous −5 000 F.
--   Un petit découvert (course cash encaissée juste avant la recharge)
--   ne doit pas immobiliser le chauffeur ; au-delà de 5 000 F de dette,
--   la mise en ligne reste refusée tant qu'il n'a pas rechargé par MoMo.
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

  -- Blocage dette : tolérance de découvert de 5 000 F.
  -- Revenus < −5 000 => recharger le wallet avant de repasser en ligne.
  select balance_fcfa into v_balance from public.wallets
   where profile_id = auth.uid() and kind = 'tamcar_revenus';
  if coalesce(v_balance, 0) < -5000 then
    raise exception 'Dette de % F (tolérance 5 000 F dépassée). Rechargez au moins % F pour repasser en ligne.',
      (-v_balance), (-v_balance - 5000)
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
