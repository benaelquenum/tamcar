-- ============================================================
-- ADR (Avance de Démarrage Remboursable) + Split fonds rachat
-- (2026-07-16, Option Y validée par Terence)
--
-- Concessionnaire verse 100 k F à la signature → finance démarrage ANATT.
-- Remboursement à M+12 du 1er chauffeur activé.
-- Split fonds rachat :
--   • Année 1 driver (< 12 mois d'activité) : 30% plateforme / 70% chauffeur
--   • Année 2+ driver (≥ 12 mois) : 20% plateforme / 80% chauffeur
-- La part plateforme est cumulée par concessionnaire dans dealer_advances.refunded_fcfa
-- Une fois refunded_fcfa ≥ amount_fcfa ET now() ≥ refund_target_at → remboursement auto.
-- ============================================================

-- ------------------------------------------------------------
-- Enum status ADR
-- ------------------------------------------------------------
create type dealer_advance_status as enum (
  'pending_activation',  -- versée mais 1er chauffeur pas encore activé (refund_target_at inconnu)
  'active',              -- 1er chauffeur activé, refund_target_at = created_at + 12 mois
  'refunded',            -- remboursée intégralement au concess
  'forfeited'            -- résiliation prématurée : partiellement absorbée
);

-- ------------------------------------------------------------
-- Table dealer_advances
-- ------------------------------------------------------------
create table public.dealer_advances (
  id uuid primary key default gen_random_uuid(),
  dealer_partner_id uuid not null references public.dealer_partners(id) on delete cascade,
  amount_fcfa int not null default 100000,
  deposited_at timestamptz not null default now(),
  first_driver_activated_at timestamptz,
  refund_target_at timestamptz,
  refunded_fcfa int not null default 0,      -- cumul prélevé sur fonds rachat
  refunded_in_full_at timestamptz,
  status dealer_advance_status not null default 'pending_activation',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_advance_unique_active
    unique (dealer_partner_id)  -- un concess = une ADR active
);

create index dealer_advances_status_idx on public.dealer_advances(status);
create index dealer_advances_refund_target_idx
  on public.dealer_advances(refund_target_at)
  where status = 'active';

create trigger dealer_advances_updated_at
  before update on public.dealer_advances
  for each row execute function public.set_updated_at();

alter table public.dealer_advances enable row level security;

create policy dealer_advances_read_own_or_admin on public.dealer_advances for select
  using (
    public.is_admin()
    or dealer_partner_id in (
      select id from public.dealer_partners where profile_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- RPC create_dealer_advance : admin appelle à l'approbation candidat
-- ------------------------------------------------------------
create or replace function public.create_dealer_advance(
  p_dealer_partner_id uuid,
  p_amount_fcfa int default 100000
)
returns public.dealer_advances
language plpgsql security invoker as $$
declare
  result public.dealer_advances;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  insert into public.dealer_advances (dealer_partner_id, amount_fcfa)
  values (p_dealer_partner_id, p_amount_fcfa)
  returning * into result;
  return result;
end;
$$;

-- ------------------------------------------------------------
-- Trigger auto : activate ADR quand 1er driver du concess devient active
-- ------------------------------------------------------------
create or replace function public.activate_dealer_advance_on_first_driver()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_dealer_id uuid;
begin
  if new.status = 'active' and (old.status is null or old.status <> 'active') then
    select v.dealer_partner_id into v_dealer_id
    from public.vehicles v where v.id = new.current_vehicle_id;

    if v_dealer_id is null then return new; end if;

    update public.dealer_advances
    set status = 'active',
        first_driver_activated_at = coalesce(first_driver_activated_at, now()),
        refund_target_at = coalesce(refund_target_at, now() + interval '12 months'),
        updated_at = now()
    where dealer_partner_id = v_dealer_id
      and status = 'pending_activation';
  end if;
  return new;
end;
$$;

drop trigger if exists activate_dealer_advance_trg on public.drivers;
create trigger activate_dealer_advance_trg
  after insert or update of status on public.drivers
  for each row execute function public.activate_dealer_advance_on_first_driver();

-- ------------------------------------------------------------
-- credit_wallets_on_ride_complete v5 : split fonds rachat 30/70 → 20/80
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

  -- Split rachat
  months_active numeric;
  platform_rachat_share_pct numeric;
  platform_rachat_amount int := 0;
  driver_rachat_amount int := 0;
  v_dealer_id uuid;
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then

    -- Débit client si tamcar_credit (inchangé)
    if new.payment_method = 'tamcar_credit' and new.price_total_fcfa > 0 then
      select id into w_id from public.wallets
        where profile_id = new.client_id and kind = 'tamcar_credit';
      if w_id is not null then
        update public.wallets
          set balance_fcfa = balance_fcfa - new.price_total_fcfa
          where id = w_id;
        insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
        values (w_id, 'payment', new.price_total_fcfa, new.id, 'success');
      end if;
    end if;

    if new.driver_id is not null then
      select application_type, profile_id, created_at
        into driver_app_type, driver_profile_id, driver_created_at
       from public.drivers where id = new.driver_id;

      -- Bonus formule cession (16e / 14e senior) — inchangé
      if driver_app_type = 'cession' then
        select count(*)::int into rides_before_this
        from public.rides
        where driver_id = new.driver_id
          and status = 'completed'
          and id <> new.id
          and (ended_at at time zone 'Africa/Porto-Novo')::date
            = (new.ended_at at time zone 'Africa/Porto-Novo')::date;

        is_senior := (
          driver_created_at < now() - interval '6 months'
          and not exists (
            select 1 from public.driver_warnings w
            where w.driver_id = new.driver_id
              and w.issued_at > now() - interval '6 months'
          )
        );

        bonus_threshold := case when is_senior then 13 else 15 end;

        if rides_before_this >= bonus_threshold then
          bonus := floor(new.price_total_fcfa * 0.05)::int;
          bonus := least(bonus, new.platform_share_fcfa);
        end if;

      elsif driver_app_type = 'proprietaire' and new.driver_share_fcfa > 0 then
        bonus := least(floor(new.price_total_fcfa * 0.10)::int, 100);
        bonus := least(bonus, new.platform_share_fcfa);
      end if;

      total_credited_to_driver := new.driver_share_fcfa + bonus;

      -- Chauffeur cash
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

      -- ================================================================
      -- SPLIT FONDS RACHAT (nouveau, Option Y)
      -- ================================================================
      if driver_app_type = 'cession' and new.driver_rachat_fcfa > 0 then
        -- Âge du driver en mois (approx)
        months_active := extract(epoch from (now() - driver_created_at)) / (30.0 * 86400);
        platform_rachat_share_pct := case when months_active < 12 then 0.30 else 0.20 end;
        platform_rachat_amount := floor(new.driver_rachat_fcfa * platform_rachat_share_pct)::int;
        driver_rachat_amount := new.driver_rachat_fcfa - platform_rachat_amount;

        -- Crédite le chauffeur (part réduite)
        select id into w_id from public.wallets
          where profile_id = driver_profile_id and kind = 'tamcar_rachat';
        if w_id is not null then
          update public.wallets
            set balance_fcfa = balance_fcfa + driver_rachat_amount
            where id = w_id;
          insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
          values (w_id, 'rachat_credit', driver_rachat_amount, new.id, 'success');
        end if;

        -- Part plateforme → cumulée sur l'ADR du dealer partner du driver
        select v.dealer_partner_id into v_dealer_id
          from public.vehicles v where v.id = new.vehicle_id;

        if v_dealer_id is not null and platform_rachat_amount > 0 then
          update public.dealer_advances
          set refunded_fcfa = refunded_fcfa + platform_rachat_amount,
              updated_at = now()
          where dealer_partner_id = v_dealer_id
            and status = 'active';
          -- Le refund effectif au concess est déclenché par un job/RPC séparé
          -- une fois refunded_fcfa >= amount_fcfa ET now() >= refund_target_at.
        end if;

      elsif new.driver_rachat_fcfa > 0 then
        -- Formule propriétaire ou autre : 100% chauffeur (pas de split)
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

    -- Concessionnaire courant (30% du CA, inchangé)
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
  'v5 : split fonds rachat cession → 30% plateforme an 1 / 20% an 2, cumul dans dealer_advances.refunded_fcfa. Reste 70/80% chauffeur.';

-- ------------------------------------------------------------
-- admin_refund_dealer_advance : verse l'ADR au concess (bouton admin)
-- ------------------------------------------------------------
create or replace function public.admin_refund_dealer_advance(p_advance_id uuid)
returns public.dealer_advances
language plpgsql security invoker as $$
declare
  a public.dealer_advances;
  w_id uuid;
  dealer_profile_id uuid;
  result public.dealer_advances;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  select * into a from public.dealer_advances where id = p_advance_id;
  if a is null then raise exception 'Advance introuvable'; end if;
  if a.status <> 'active' then raise exception 'Advance non active (status=%)', a.status; end if;

  select profile_id into dealer_profile_id
   from public.dealer_partners where id = a.dealer_partner_id;

  select id into w_id from public.wallets
   where profile_id = dealer_profile_id and kind = 'tamcar_revenus';
  if w_id is null then raise exception 'Wallet concess introuvable'; end if;

  update public.wallets
   set balance_fcfa = balance_fcfa + a.amount_fcfa,
       updated_at = now()
   where id = w_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, status)
  values (w_id, 'adjustment', a.amount_fcfa, 'success');

  update public.dealer_advances
   set status = 'refunded',
       refunded_in_full_at = now(),
       updated_at = now()
   where id = p_advance_id
  returning * into result;

  return result;
end;
$$;

comment on function public.admin_refund_dealer_advance is
  'Admin marque une ADR comme remboursée : verse amount_fcfa au wallet tamcar_revenus du concess et passe status=refunded.';

-- ------------------------------------------------------------
-- admin_forfeit_dealer_advance : résiliation prématurée prorata temporis
-- ------------------------------------------------------------
create or replace function public.admin_forfeit_dealer_advance(
  p_advance_id uuid,
  p_reason text default null
)
returns public.dealer_advances
language plpgsql security invoker as $$
declare
  a public.dealer_advances;
  months_active int;
  prorata_amount int;
  w_id uuid;
  dealer_profile_id uuid;
  result public.dealer_advances;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;

  select * into a from public.dealer_advances where id = p_advance_id;
  if a is null then raise exception 'Advance introuvable'; end if;
  if a.status <> 'active' then raise exception 'Advance non active'; end if;

  if a.first_driver_activated_at is null then
    -- Jamais activée → 0 remboursé au concess
    prorata_amount := 0;
  else
    months_active := extract(month from age(now(), a.first_driver_activated_at))::int
                    + extract(year from age(now(), a.first_driver_activated_at))::int * 12;
    months_active := least(months_active, 12);
    prorata_amount := floor(a.amount_fcfa * months_active / 12.0)::int;
  end if;

  if prorata_amount > 0 then
    select profile_id into dealer_profile_id
     from public.dealer_partners where id = a.dealer_partner_id;
    select id into w_id from public.wallets
     where profile_id = dealer_profile_id and kind = 'tamcar_revenus';
    if w_id is not null then
      update public.wallets
       set balance_fcfa = balance_fcfa + prorata_amount,
           updated_at = now()
       where id = w_id;
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, status)
      values (w_id, 'adjustment', prorata_amount, 'success');
    end if;
  end if;

  update public.dealer_advances
   set status = 'forfeited',
       refunded_in_full_at = case when prorata_amount > 0 then now() else null end,
       notes = coalesce(notes || E'\n', '') || 'Forfeited: ' || coalesce(p_reason, 'no reason'),
       updated_at = now()
   where id = p_advance_id
  returning * into result;

  return result;
end;
$$;

comment on function public.admin_forfeit_dealer_advance is
  'Admin résilie une ADR prématurément. Remboursement prorata temporis (amount × mois_effectifs/12) au concess, le solde reste à la plateforme.';
