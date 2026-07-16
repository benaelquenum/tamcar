-- ============================================================
-- TamCar — Split v3 formule Cession + bonus 16e/j + warnings (2026-07-16)
--
-- Décisions figées :
--   • Split standard cession : 40 chauffeur / 10 rachat / 30 concess / 20 plateforme
--   • Bonus dès la 16e course/jour → split devient 45/10/30/15 (prélevé plateforme)
--   • Chauffeur senior (6 mois service sans warning) : bonus dès la 14e course/jour
--   • Timezone de référence : Africa/Porto-Novo (WAT UTC+1)
--   • Seuil minimum 15 courses/j, sanctions strictes sans exemption :
--       10 j consécutifs sous seuil → warning
--       20 j → interview
--       30 j → résiliation possible
--   • Base de calcul : courses `status = 'completed'` uniquement
-- ============================================================

-- ------------------------------------------------------------
-- Table warnings chauffeur
-- ------------------------------------------------------------
create type driver_warning_level as enum ('warning', 'interview', 'terminated');

create table public.driver_warnings (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  level driver_warning_level not null,
  issued_at timestamptz not null default now(),
  reason text not null,
  notes text,
  resolved_at timestamptz
);

create index driver_warnings_driver_idx on public.driver_warnings(driver_id, issued_at desc);
create index driver_warnings_active_idx on public.driver_warnings(driver_id) where resolved_at is null;

alter table public.driver_warnings enable row level security;

create policy warnings_read_own_or_admin on public.driver_warnings for select
  using (
    public.is_admin()
    or driver_id in (select id from public.drivers where profile_id = auth.uid())
  );

create policy warnings_admin_write on public.driver_warnings for all
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- is_driver_senior : true si 6+ mois de service sans warning sur les 6 derniers mois
-- ------------------------------------------------------------
create or replace function public.is_driver_senior(p_driver_id uuid)
returns boolean
language sql stable security invoker as $$
  select exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.created_at < now() - interval '6 months'
      and not exists (
        select 1 from public.driver_warnings w
        where w.driver_id = d.id
          and w.issued_at > now() - interval '6 months'
      )
  );
$$;

-- ------------------------------------------------------------
-- driver_today_rides_count : nombre de courses completed aujourd'hui (heure Bénin)
-- ------------------------------------------------------------
create or replace function public.driver_today_rides_count(p_driver_id uuid)
returns int
language sql stable security invoker as $$
  select count(*)::int
  from public.rides
  where driver_id = p_driver_id
    and status = 'completed'
    and (ended_at at time zone 'Africa/Porto-Novo')::date
      = (now() at time zone 'Africa/Porto-Novo')::date;
$$;

-- ------------------------------------------------------------
-- driver_today_progress : détail complet pour dashboard chauffeur
-- ------------------------------------------------------------
create or replace function public.driver_today_progress(p_driver_id uuid)
returns table (
  rides_today int,
  min_target int,
  bonus_threshold int,
  is_senior boolean,
  in_bonus_zone boolean,
  courses_until_bonus int,
  courses_below_min int
)
language sql stable security invoker as $$
  with s as (
    select
      public.driver_today_rides_count(p_driver_id) as rides_today,
      15 as min_target,
      public.is_driver_senior(p_driver_id) as senior
  )
  select
    s.rides_today,
    s.min_target,
    case when s.senior then 14 else 16 end as bonus_threshold,
    s.senior,
    s.rides_today >= (case when s.senior then 14 else 16 end) as in_bonus_zone,
    greatest(0, (case when s.senior then 14 else 16 end) - s.rides_today) as courses_until_bonus,
    greatest(0, s.min_target - s.rides_today) as courses_below_min
  from s;
$$;

-- ------------------------------------------------------------
-- accept_ride v3 : split 40/10/30/20 pour formule cession
-- ------------------------------------------------------------
create or replace function public.accept_ride(ride_id uuid)
returns public.rides
language plpgsql security invoker as $$
declare
  driver_row public.drivers;
  dealer_id uuid;
  result public.rides;
  total int;
  new_driver_cash int;
  new_driver_rachat int;
  new_dealer_share int;
  new_platform int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into driver_row
  from public.drivers where profile_id = auth.uid();

  if driver_row is null then raise exception 'Not a driver'; end if;
  if driver_row.status <> 'active' or not driver_row.is_online then
    raise exception 'Driver not active or offline';
  end if;
  if driver_row.current_vehicle_id is null then
    raise exception 'No vehicle assigned';
  end if;

  if exists (
    select 1 from public.rides
    where driver_id = driver_row.id
      and status in ('matched', 'arrived', 'in_progress')
  ) then
    raise exception 'Course active déjà en cours — termine-la avant.';
  end if;

  select dealer_partner_id into dealer_id
   from public.vehicles where id = driver_row.current_vehicle_id;

  select price_total_fcfa into total
   from public.rides where id = ride_id;

  if driver_row.application_type = 'proprietaire' then
    -- Formule B : 80% chauffeur, 20% plateforme
    new_driver_cash := floor(total * 0.80)::int;
    new_driver_rachat := 0;
    new_dealer_share := 0;
    new_platform := total - new_driver_cash;
  else
    -- Formule A cession v3 : 40/10/30/20 (standard, sans bonus)
    -- Le bonus 5% éventuel est appliqué au crédit dans le trigger complete
    new_driver_cash := floor(total * 0.40)::int;
    new_driver_rachat := floor(total * 0.10)::int;
    new_dealer_share := floor(total * 0.30)::int;
    new_platform := total - new_driver_cash - new_driver_rachat - new_dealer_share;
  end if;

  update public.rides
  set driver_id = driver_row.id,
      vehicle_id = driver_row.current_vehicle_id,
      dealer_partner_id = case
        when driver_row.application_type = 'proprietaire' then null
        else dealer_id
      end,
      driver_share_fcfa = new_driver_cash,
      driver_rachat_fcfa = new_driver_rachat,
      dealer_share_fcfa = new_dealer_share,
      platform_share_fcfa = new_platform,
      status = 'matched',
      matched_at = now(),
      updated_at = now()
  where id = ride_id
    and status = 'requested'
    and driver_id is null
  returning * into result;

  if result is null then raise exception 'Ride already taken or unavailable'; end if;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- credit_wallets_on_ride_complete v3 :
--   • Formule cession : ajoute bonus 5% si rang du jour >= seuil (16 std / 14 senior)
--   • Bonus prélevé sur platform_share
--   • Formule proprietaire : bonus 10% plafonné 100 F (inchangé)
-- ------------------------------------------------------------
create or replace function public.credit_wallets_on_ride_complete()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  w_id uuid;
  driver_profile_id uuid;
  dealer_profile_id uuid;
  driver_app_type driver_application_type;
  driver_created_at timestamptz;
  is_senior boolean := false;
  bonus_threshold int;
  rides_before_this int := 0;
  bonus int := 0;
  total_credited_to_driver int;
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then

    if new.driver_id is not null then
      select application_type, profile_id, created_at
        into driver_app_type, driver_profile_id, driver_created_at
       from public.drivers where id = new.driver_id;

      if driver_app_type = 'cession' then
        -- Compte les courses completed de ce driver AVANT celle-ci dans la journée locale
        select count(*)::int into rides_before_this
        from public.rides
        where driver_id = new.driver_id
          and status = 'completed'
          and id <> new.id
          and (ended_at at time zone 'Africa/Porto-Novo')::date
            = (new.ended_at at time zone 'Africa/Porto-Novo')::date;

        -- Senior si 6+ mois service et pas de warning récent
        is_senior := (
          driver_created_at < now() - interval '6 months'
          and not exists (
            select 1 from public.driver_warnings w
            where w.driver_id = new.driver_id
              and w.issued_at > now() - interval '6 months'
          )
        );

        bonus_threshold := case when is_senior then 13 else 15 end;

        -- Cette course est la (rides_before_this + 1)ème. Bonus si (rides_before_this >= bonus_threshold)
        if rides_before_this >= bonus_threshold then
          bonus := floor(new.price_total_fcfa * 0.05)::int;
          bonus := least(bonus, new.platform_share_fcfa);
        end if;

      elsif driver_app_type = 'proprietaire' and new.driver_share_fcfa > 0 then
        -- Formule B : bonus 10% plafonné 100 F (inchangé)
        bonus := least(floor(new.price_total_fcfa * 0.10)::int, 100);
        bonus := least(bonus, new.platform_share_fcfa);
      end if;

      total_credited_to_driver := new.driver_share_fcfa + bonus;

      -- Chauffeur cash (share + bonus éventuel)
      if total_credited_to_driver > 0 then
        select id into w_id from public.wallets
          where profile_id = driver_profile_id and kind = 'tamcar_revenus';
        if w_id is not null then
          update public.wallets
            set balance_fcfa = balance_fcfa + total_credited_to_driver
            where id = w_id;
          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
          values (w_id, 'revenue_share_credit', total_credited_to_driver, new.id, 'success');
        end if;
      end if;

      -- Chauffeur rachat (formule A uniquement)
      if new.driver_rachat_fcfa > 0 then
        select id into w_id from public.wallets
          where profile_id = driver_profile_id and kind = 'tamcar_rachat';
        if w_id is not null then
          update public.wallets
            set balance_fcfa = balance_fcfa + new.driver_rachat_fcfa
            where id = w_id;
          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
          values (w_id, 'rachat_credit', new.driver_rachat_fcfa, new.id, 'success');
        end if;
      end if;
    end if;

    -- Concessionnaire
    if new.dealer_partner_id is not null and new.dealer_share_fcfa > 0 then
      select profile_id into dealer_profile_id
        from public.dealer_partners where id = new.dealer_partner_id;
      select id into w_id from public.wallets
        where profile_id = dealer_profile_id and kind = 'tamcar_revenus';
      if w_id is not null then
        update public.wallets
          set balance_fcfa = balance_fcfa + new.dealer_share_fcfa
          where id = w_id;
        insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
        values (w_id, 'revenue_share_credit', new.dealer_share_fcfa, new.id, 'success');
      end if;
    end if;

  end if;
  return new;
end;
$$;

comment on function public.credit_wallets_on_ride_complete is
  'Trigger AFTER UPDATE rides.status=completed : split 40/10/30/20 formule cession, bonus 5% dès 16e/j (14e si senior) prélevé plateforme, bonus 10% plafonné 100 F formule proprietaire.';
