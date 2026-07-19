-- ============================================================
-- Push nouvelles courses et switch catégorie aux chauffeurs concernés.
--
-- Deux nouveaux triggers :
--   1. trg_ride_created_push : à chaque INSERT sur rides (status='requested'),
--      trouve tous les chauffeurs online + status='active' qui pourraient
--      être matchés (catégorie compatible + rayon 10 km) et leur envoie un push.
--   2. trg_ride_switch_push : à chaque UPDATE de requested_category (client
--      a switché via client_switch_category), envoie un push aux chauffeurs
--      de la nouvelle catégorie.
-- ============================================================

-- ------------------------------------------------------------
-- Helper : notify all matching drivers around a ride
-- ------------------------------------------------------------
create or replace function public._notify_matching_drivers(p_ride_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  drv record;
  is_below boolean;
  category_label text;
begin
  select * into r from public.rides where id = p_ride_id;
  if r is null or r.status <> 'requested' then return; end if;

  category_label := case r.requested_category
    when 'moto'      then 'Moto'
    when 'tricycle'  then 'Tricycle'
    when 'essentiel' then 'Essentiel'
    when 'confort'   then 'Confort'
    else initcap(r.requested_category::text)
  end;

  for drv in
    select d.profile_id, v.category as drv_cat
    from public.drivers d
    join public.vehicles v on v.id = d.current_vehicle_id
    where d.is_online = true
      and d.status = 'active'
      and (
        v.category = r.requested_category
        or (v.category = 'confort' and r.requested_category = 'essentiel')
      )
      and st_dwithin(d.current_location, r.pickup_location, 10000)
  loop
    is_below := (drv.drv_cat = 'confort' and r.requested_category = 'essentiel');
    perform public._push_notify(
      drv.profile_id,
      case when is_below
        then '🚗 Course ' || category_label || ' — tarif réduit'
        else '🚗 Nouvelle course ' || category_label
      end,
      case when is_below
        then 'Un client attend un ' || category_label || ' près de toi. Tarif au client, à toi de voir.'
        else 'Un client attend près de toi. Ouvre TamCar pour accepter.'
      end,
      '/',
      'new-ride:' || p_ride_id::text,
      true
    );
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Trigger 1 : nouvelle course requested
-- ------------------------------------------------------------
create or replace function public._on_ride_created()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'requested' and new.driver_id is null then
    perform public._notify_matching_drivers(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ride_created_push on public.rides;
create trigger trg_ride_created_push
  after insert on public.rides
  for each row
  execute function public._on_ride_created();

-- ------------------------------------------------------------
-- Trigger 2 : requested_category changée (client_switch_category)
-- ------------------------------------------------------------
create or replace function public._on_ride_category_switch()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'requested'
     and old.requested_category is distinct from new.requested_category
  then
    perform public._notify_matching_drivers(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ride_category_switch on public.rides;
create trigger trg_ride_category_switch
  after update of requested_category on public.rides
  for each row
  execute function public._on_ride_category_switch();
