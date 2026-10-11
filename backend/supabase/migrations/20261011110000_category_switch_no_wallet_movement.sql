-- ============================================================
-- TamCar — Changement de catégorie : plus aucun mouvement d'argent (2026-10-11)
--
--   Défaut constaté : quand un client changeait de catégorie une course encore « en recherche » (ex. Confort → Moto),
--   client_switch_category créditait la différence de prix dans son portefeuille TamCar Crédit (type « refund ») — par exemple
--   950 F → 300 F = 650 F offerts — alors que RIEN n'avait été prélevé : une course en espèces se paie en espèces, et le
--   TamCar Crédit n'est débité qu'à la fin de la course (create_ride le dit : « le portefeuille n'est débité qu'à la fin de
--   course »). Ce crédit sortait donc de nulle part : faille d'argent exploitable (demander une catégorie chère, passer à la
--   moins chère, recommencer). Dans l'autre sens, passer à une catégorie plus chère débitait le Crédit d'une course payée en espèces.
--   Même défaut dans client_accept_downgrade (Confort → Essentiel).
--
--   Correction : le prix est simplement recalculé ; le paiement se fait à la fin de la course, au nouveau prix (espèces
--   ou débit du TamCar Crédit par le déclencheur de fin de course).
-- ============================================================
create or replace function public.client_switch_category(p_ride_id uuid, p_new_category vehicle_category)
returns public.rides
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  quote record;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status not in ('requested', 'scheduled') then
    raise exception 'Course déjà matchée ou terminée';
  end if;
  if r.status = 'scheduled' and r.driver_id is not null then
    raise exception 'Un chauffeur est déjà engagé sur cette réservation';
  end if;
  if r.requested_category = p_new_category then
    raise exception 'Déjà dans cette catégorie';
  end if;

  select * into quote from public.compute_price(
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    r.distance_km, r.duration_min, p_new_category, false, false
  ) limit 1;
  if quote is null or quote.price_total_fcfa is null then
    raise exception 'Tarif indisponible pour cette catégorie';
  end if;

  -- Paiement TamCar Crédit : le solde doit couvrir le nouveau prix en plus des autres courses déjà engagées en crédit
  if r.payment_method = 'tamcar_credit' and quote.price_total_fcfa > r.price_total_fcfa then
    if coalesce((select balance_fcfa from public.wallets where profile_id = r.client_id and kind = 'tamcar_credit'), 0)
       - coalesce((select sum(price_total_fcfa) from public.rides
                    where client_id = r.client_id and payment_method = 'tamcar_credit' and id <> r.id
                      and status in ('requested', 'scheduled', 'matched', 'arrived', 'in_progress')), 0)
       < quote.price_total_fcfa then
      raise exception 'Solde TamCar Crédit insuffisant pour cette catégorie.';
    end if;
  end if;

  update public.rides set
    requested_category = p_new_category,
    price_total_fcfa   = quote.price_total_fcfa,
    driver_share_fcfa  = quote.driver_cash_fcfa,
    driver_rachat_fcfa = quote.driver_rachat_fcfa,
    dealer_share_fcfa  = quote.dealer_share_fcfa,
    platform_share_fcfa= quote.platform_share_fcfa,
    downgrade_accepted_at = case
      when p_new_category in ('moto','tricycle') then now()
      when p_new_category = 'essentiel' and r.requested_category in ('confort') then now()
      else downgrade_accepted_at
    end,
    -- Réservation : la nouvelle catégorie relance une recherche neuve.
    booking_reminders_sent = case
      when r.status = 'scheduled'
        then array_remove(booking_reminders_sent, 120::smallint)
      else booking_reminders_sent
    end,
    driver_search_started_at = case
      when r.status = 'scheduled' then now() else driver_search_started_at
    end,
    driver_search_prompted_at = case
      when r.status = 'scheduled' then null else driver_search_prompted_at
    end,
    updated_at = now()
  where id = p_ride_id
  returning * into result;

  return result;
end;
$fn$;

create or replace function public.client_accept_downgrade(p_ride_id uuid, p_with_ac boolean default false)
returns public.rides
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  new_price record;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status <> 'requested' then raise exception 'Course déjà matchée ou terminée'; end if;
  if r.requested_category <> 'confort' then
    raise exception 'Seule une demande Confort peut être downgradée';
  end if;
  if r.downgrade_accepted_at is not null then
    raise exception 'Downgrade déjà accepté';
  end if;

  -- Recalcule prix Essentiel sans clim (option supprimée)
  select * into new_price from public.compute_price(
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    r.distance_km, r.duration_min,
    'essentiel'::vehicle_category, false, false
  ) limit 1;

  update public.rides
    set price_total_fcfa = new_price.price_total_fcfa,
        driver_share_fcfa = new_price.driver_cash_fcfa,
        driver_rachat_fcfa = new_price.driver_rachat_fcfa,
        dealer_share_fcfa = new_price.dealer_share_fcfa,
        platform_share_fcfa = new_price.platform_share_fcfa,
        with_ac = false,
        downgrade_accepted_at = now(),
        updated_at = now()
    where id = p_ride_id
    returning * into result;

  return result;
end;
$fn$;
