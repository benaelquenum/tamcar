-- ============================================================
-- Tarifs Moto et Tricycle (référence marché Bénin, à ajuster).
-- Moto ≈ zémidjan formalisé : base 200, 50 F/km, min course 250.
-- Tricycle (kékéno-taxi) : base 400, 70 F/km, min 500.
-- ============================================================

insert into public.pricing_tiers
  (category,   base_fcfa, base_covers_km, base_covers_min, km_city_fcfa, km_corridor_fcfa, min_fcfa, min_course_fcfa, ac_extra_fcfa, km_daily_limit)
values
  ('moto',           150,            1.0,               3,           50,               80,       15,             250,             0,            180),
  ('tricycle',       350,            2.0,               4,           70,              120,       25,             500,             0,            200)
on conflict (category) do update set
  base_fcfa = excluded.base_fcfa,
  base_covers_km = excluded.base_covers_km,
  base_covers_min = excluded.base_covers_min,
  km_city_fcfa = excluded.km_city_fcfa,
  km_corridor_fcfa = excluded.km_corridor_fcfa,
  min_fcfa = excluded.min_fcfa,
  min_course_fcfa = excluded.min_course_fcfa;

-- ============================================================
-- RPC preview_alternative_offers(ride_id) : quand aucun véhicule
-- de la catégorie demandée n'est disponible, on liste les
-- alternatives (moto, tricycle, éventuellement confort) avec leur
-- nouveau prix et une estimation de gain/coût pour le client.
-- ============================================================

create or replace function public.preview_alternative_offers(p_ride_id uuid)
returns table (
  category vehicle_category,
  new_price_fcfa int,
  delta_fcfa int,          -- négatif = économie, positif = supplément
  drivers_online_nearby int
)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rides;
  pickup_g geography;
  cat vehicle_category;
  candidate_cats vehicle_category[];
  quote record;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;

  pickup_g := r.pickup_location;

  -- Liste des catégories alternatives selon la demande initiale du client :
  --   Essentiel  → moto, tricycle, confort (upgrade)
  --   Confort    → essentiel (déjà géré via preview_downgrade_price)
  --   Moto       → tricycle, essentiel
  --   Tricycle   → moto, essentiel
  if r.requested_category = 'essentiel' then
    candidate_cats := array['moto','tricycle','confort']::vehicle_category[];
  elsif r.requested_category = 'moto' then
    candidate_cats := array['tricycle','essentiel']::vehicle_category[];
  elsif r.requested_category = 'tricycle' then
    candidate_cats := array['moto','essentiel']::vehicle_category[];
  else
    candidate_cats := array[]::vehicle_category[];
  end if;

  foreach cat in array candidate_cats loop
    select * into quote from public.compute_price(
      st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
      st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
      r.distance_km, r.duration_min, cat, false, false
    ) limit 1;

    return query
    select
      cat,
      quote.price_total_fcfa,
      quote.price_total_fcfa - r.price_total_fcfa,
      (
        select count(*)::int from public.drivers d
        join public.vehicles v on v.id = d.current_vehicle_id
        where d.is_online = true
          and d.status = 'active'
          and v.category = cat
          and st_dwithin(d.current_location, pickup_g, 10000)  -- 10 km rayon
      );
  end loop;
end;
$$;

grant execute on function public.preview_alternative_offers(uuid) to authenticated;

-- ============================================================
-- RPC client_switch_category(ride_id, new_category) :
-- le client accepte une catégorie alternative après avoir vu preview.
-- Recalcule prix + shares. Rembourse la différence (ou débite si +).
-- Marque downgrade_accepted_at si passage vers catégorie inférieure.
-- ============================================================

create or replace function public.client_switch_category(
  p_ride_id uuid,
  p_new_category vehicle_category
)
returns public.rides
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  quote record;
  delta int;
  client_wallet_id uuid;
  result public.rides;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.client_id <> auth.uid() then raise exception 'Not your ride'; end if;
  if r.status <> 'requested' then raise exception 'Course déjà matchée ou terminée'; end if;
  if r.requested_category = p_new_category then
    raise exception 'Déjà dans cette catégorie';
  end if;

  select * into quote from public.compute_price(
    st_y(r.pickup_location::geometry), st_x(r.pickup_location::geometry),
    st_y(r.dropoff_location::geometry), st_x(r.dropoff_location::geometry),
    r.distance_km, r.duration_min, p_new_category, false, false
  ) limit 1;

  delta := r.price_total_fcfa - quote.price_total_fcfa; -- >0 si économie

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
    updated_at = now()
  where id = p_ride_id
  returning * into result;

  -- Ajustement wallet : delta > 0 = remboursement, delta < 0 = supplément à payer
  if delta <> 0 then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (r.client_id, 'tamcar_credit', 0)
      on conflict (profile_id, kind) do nothing;
    select id into client_wallet_id
      from public.wallets
      where profile_id = r.client_id and kind = 'tamcar_credit';
    update public.wallets
      set balance_fcfa = balance_fcfa + delta,
          updated_at = now()
      where id = client_wallet_id;
    insert into public.wallet_transactions
      (wallet_id, type, amount_fcfa, ride_id, status)
      values (client_wallet_id, case when delta > 0 then 'refund' else 'payment' end,
              abs(delta), p_ride_id, 'success');
  end if;

  return result;
end;
$$;

grant execute on function public.client_switch_category(uuid, vehicle_category) to authenticated;
