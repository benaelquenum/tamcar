-- ============================================================
-- TamPass — abonnement domicile-travail (trajets récurrents prépayés)
--
-- Modèle :
--   1. Le client achète un pass (semaine / mois / flex) pour un trajet
--      donné (origine → destination, catégorie, créneaux, jours).
--      Paiement intégral par wallet TamCar Crédit (RPC purchase_subscription).
--   2. Chaque jour, generate_subscription_rides(J+1) crée les trajets
--      « planned » du lendemain (appelée par l'Edge Function tampass-scheduler
--      en service role — c'est elle qui crée aussi les rides réelles avec
--      prix/parts et l'assignation du chauffeur attitré).
--   3. Réassignation (règle validée par Terence) :
--      - à H-15 : si l'ETA GPS du chauffeur attitré dépasse le créneau,
--        lancer la recherche d'un remplaçant EN PARALLÈLE
--        (fallback_started_at) — le titulaire garde la priorité tant
--        qu'aucun remplaçant n'a accepté ;
--      - de H-15 à H-5 : re-vérifier la position GPS du titulaire
--        chaque minute ;
--      - à H-5 : verrouiller le chauffeur au meilleur ETA (locked_at,
--        final_driver_id), libérer l'autre.
--      - Garantie ponctualité : aucun véhicule présenté dans les 20 min
--        du créneau → trajet recrédité (status 'recredited') + geste
--        500 F wallet (géré par l'Edge Function).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Catalogue des formules
-- ------------------------------------------------------------
create table if not exists public.subscription_plans (
  code text primary key,
  label text not null,
  rides_total int not null check (rides_total > 0),
  validity_days int not null check (validity_days > 0),
  discount_pct numeric(5,2) not null default 0
    check (discount_pct >= 0 and discount_pct < 100),
  reports_per_month int not null default 2,   -- « jokers » : trajets ratés reportables
  pauses_max int not null default 1,          -- suspensions (1 semaine) autorisées
  is_flex boolean not null default false,     -- flex = carnet sans créneaux fixes
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.subscription_plans
  (code, label, rides_total, validity_days, discount_pct, reports_per_month, pauses_max, is_flex)
values
  ('pass_semaine', 'Pass Semaine', 10, 7,  10.0, 1, 0, false),
  ('pass_mois',    'Pass Mois',    44, 31, 15.0, 2, 1, false),
  ('pass_flex',    'Pass Flex',    10, 30,  8.0, 0, 0, true)
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- 2. Abonnements
-- ------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete restrict,
  plan_code text not null references public.subscription_plans(code),

  status text not null default 'active'
    check (status in ('active', 'paused', 'expired', 'cancelled')),

  category vehicle_category not null,

  origin_location geography(point, 4326) not null,
  origin_address text not null,
  dropoff_location geography(point, 4326) not null,
  dropoff_address text not null,
  distance_km numeric(6,2) not null,
  duration_min int not null,

  -- Créneaux fixes (null pour les pass flex)
  days_of_week int[] default '{1,2,3,4,5}',   -- ISO : 1 = lundi … 7 = dimanche
  slot_out time,                               -- départ aller
  slot_return time,                            -- départ retour (null = aller simple)
  window_minutes int not null default 15,

  -- Chauffeur attitré (préférence, pas une garantie — fallback automatique)
  preferred_driver_id uuid references public.drivers(id) on delete set null,

  -- Compteurs
  rides_total int not null,
  rides_remaining int not null check (rides_remaining >= 0),
  reports_used_month int not null default 0,
  reports_month date,                          -- mois de référence du compteur jokers
  pauses_used int not null default 0,
  paused_until date,

  -- Prix figés à l'achat
  unit_price_fcfa int not null check (unit_price_fcfa > 0),
  discount_pct numeric(5,2) not null default 0,
  total_price_fcfa int not null check (total_price_fcfa > 0),

  starts_on date not null,
  expires_on date not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_client_idx
  on public.subscriptions (client_id, status);
create index if not exists subscriptions_active_idx
  on public.subscriptions (status, starts_on, expires_on)
  where status = 'active';

-- ------------------------------------------------------------
-- 3. Trajets d'abonnement (1 ligne par trajet planifié)
-- ------------------------------------------------------------
create table if not exists public.subscription_rides (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  ride_id uuid references public.rides(id) on delete set null,

  travel_date date not null,
  direction text not null check (direction in ('aller', 'retour')),
  slot_time time not null,

  status text not null default 'planned'
    check (status in (
      'planned',      -- créé par generate_subscription_rides (J-1)
      'generated',    -- ride réelle créée par le scheduler
      'completed',    -- course terminée
      'missed',       -- client absent → trajet décompté
      'reported',     -- joker utilisé → trajet recrédité
      'recredited',   -- garantie ponctualité activée → trajet recrédité
      'cancelled'     -- annulé (pause, expiration…)
    )),

  -- Réassignation H-15 / H-5 (règle Terence)
  fallback_started_at timestamptz,   -- recherche parallèle lancée à H-15
  locked_at timestamptz,             -- décision finale à H-5
  final_driver_id uuid references public.drivers(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (subscription_id, travel_date, direction)
);

create index if not exists subscription_rides_date_idx
  on public.subscription_rides (travel_date, status);

-- ------------------------------------------------------------
-- 4. Journal d'événements (audit)
-- ------------------------------------------------------------
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  event_type text not null,   -- purchased / paused / resumed / report_used / recredited / reassigned / expired / cancelled
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. updated_at automatique
-- ------------------------------------------------------------
create or replace function public.tampass_touch_updated_at()
returns trigger language plpgsql as $fn_touch$
begin
  new.updated_at := now();
  return new;
end;
$fn_touch$;

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.tampass_touch_updated_at();

drop trigger if exists subscription_rides_touch on public.subscription_rides;
create trigger subscription_rides_touch
  before update on public.subscription_rides
  for each row execute function public.tampass_touch_updated_at();

-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_rides enable row level security;
alter table public.subscription_events enable row level security;

create policy plans_select_all on public.subscription_plans
  for select to authenticated using (active);

create policy subs_select_own on public.subscriptions
  for select to authenticated
  using (
    client_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy sub_rides_select_own on public.subscription_rides
  for select to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_id
        and (s.client_id = auth.uid()
             or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
    )
    or final_driver_id in (select d.id from public.drivers d where d.profile_id = auth.uid())
  );

create policy sub_events_select_own on public.subscription_events
  for select to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_id
        and (s.client_id = auth.uid()
             or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
    )
  );

-- Aucune policy insert/update/delete : toutes les écritures passent
-- par les RPC security definer ci-dessous ou par le service role.

-- ------------------------------------------------------------
-- 7. RPC : achat d'un pass (débit wallet + création abonnement)
-- ------------------------------------------------------------
create or replace function public.purchase_subscription(
  p_plan_code text,
  p_category vehicle_category,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_origin_address text,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_dropoff_address text,
  p_distance_km numeric,
  p_duration_min int,
  p_days_of_week int[] default '{1,2,3,4,5}',
  p_slot_out time default null,
  p_slot_return time default null,
  p_preferred_driver_id uuid default null,
  p_starts_on date default null
)
returns public.subscriptions
language plpgsql security definer set search_path = public as $fn_buy$
declare
  v_plan public.subscription_plans;
  v_unit int;
  v_total int;
  v_wallet public.wallets;
  v_sub public.subscriptions;
  v_starts date := coalesce(p_starts_on, current_date + 1);
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  select * into v_plan from public.subscription_plans
  where code = p_plan_code and active;
  if not found then
    raise exception 'Formule inconnue ou inactive : %', p_plan_code;
  end if;

  if not v_plan.is_flex and p_slot_out is null then
    raise exception 'Un créneau aller (p_slot_out) est requis pour cette formule';
  end if;
  if v_starts < current_date then
    raise exception 'La date de début ne peut pas être dans le passé';
  end if;

  -- Prix unitaire officiel du trajet (grille TamCar, jour, sans clim)
  select price_total_fcfa into v_unit
  from public.compute_price(
    p_origin_lat, p_origin_lng, p_dropoff_lat, p_dropoff_lng,
    p_distance_km, p_duration_min, p_category, false, false
  );
  if v_unit is null or v_unit <= 0 then
    raise exception 'Impossible de calculer le prix du trajet';
  end if;

  v_total := round(v_unit * v_plan.rides_total * (1 - v_plan.discount_pct / 100.0))::int;

  -- Débit wallet TamCar Crédit (paiement intégral à l'achat)
  select * into v_wallet from public.wallets
  where profile_id = auth.uid() and kind = 'tamcar_credit'
  for update;
  if not found or v_wallet.balance_fcfa < v_total then
    raise exception 'Solde TamCar Crédit insuffisant (requis : % FCFA). Rechargez votre wallet.', v_total;
  end if;

  update public.wallets
  set balance_fcfa = balance_fcfa - v_total, updated_at = now()
  where id = v_wallet.id;

  insert into public.subscriptions (
    client_id, plan_code, category,
    origin_location, origin_address, dropoff_location, dropoff_address,
    distance_km, duration_min,
    days_of_week, slot_out, slot_return,
    preferred_driver_id,
    rides_total, rides_remaining,
    reports_month,
    unit_price_fcfa, discount_pct, total_price_fcfa,
    starts_on, expires_on
  ) values (
    auth.uid(), v_plan.code, p_category,
    st_setsrid(st_makepoint(p_origin_lng, p_origin_lat), 4326)::geography,
    p_origin_address,
    st_setsrid(st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_dropoff_address,
    p_distance_km, p_duration_min,
    case when v_plan.is_flex then null else p_days_of_week end,
    p_slot_out, p_slot_return,
    p_preferred_driver_id,
    v_plan.rides_total, v_plan.rides_total,
    date_trunc('month', v_starts)::date,
    v_unit, v_plan.discount_pct, v_total,
    v_starts, v_starts + v_plan.validity_days
  )
  returning * into v_sub;

  insert into public.wallet_transactions
    (wallet_id, type, amount_fcfa, provider, status, meta)
  values
    (v_wallet.id, 'payment', -v_total, 'internal', 'success',
     jsonb_build_object('subscription_id', v_sub.id, 'plan', v_plan.code, 'kind', 'tampass'));

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'purchased',
          jsonb_build_object('total_fcfa', v_total, 'unit_fcfa', v_unit,
                             'discount_pct', v_plan.discount_pct));

  return v_sub;
end;
$fn_buy$;

-- ------------------------------------------------------------
-- 8. RPC : pause (1 semaine, extension d'autant)
-- ------------------------------------------------------------
create or replace function public.pause_subscription(p_subscription_id uuid)
returns public.subscriptions
language plpgsql security definer set search_path = public as $fn_pause$
declare
  v_sub public.subscriptions;
  v_plan public.subscription_plans;
  v_cancelled int := 0;
begin
  select * into v_sub from public.subscriptions
  where id = p_subscription_id and client_id = auth.uid()
  for update;
  if not found then raise exception 'Abonnement introuvable'; end if;
  if v_sub.status <> 'active' then raise exception 'Abonnement non actif'; end if;

  select * into v_plan from public.subscription_plans where code = v_sub.plan_code;
  if v_sub.pauses_used >= v_plan.pauses_max then
    raise exception 'Nombre maximal de pauses atteint pour cette formule';
  end if;

  update public.subscriptions
  set status = 'paused',
      paused_until = current_date + 7,
      pauses_used = pauses_used + 1,
      expires_on = expires_on + 7
  where id = v_sub.id
  returning * into v_sub;

  -- Annule les trajets déjà planifiés pendant la pause, recrédite exactement ce nombre
  update public.subscription_rides
  set status = 'cancelled'
  where subscription_id = v_sub.id
    and status = 'planned'
    and travel_date <= current_date + 7;
  get diagnostics v_cancelled = row_count;

  if v_cancelled > 0 then
    update public.subscriptions
    set rides_remaining = rides_remaining + v_cancelled
    where id = v_sub.id;
  end if;

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'paused',
          jsonb_build_object('until', v_sub.paused_until, 'recredited', v_cancelled));

  return v_sub;
end;
$fn_pause$;

-- ------------------------------------------------------------
-- 9. RPC : joker — reporter un trajet raté (missed → reported)
-- ------------------------------------------------------------
create or replace function public.report_subscription_ride(p_subscription_ride_id uuid)
returns public.subscription_rides
language plpgsql security definer set search_path = public as $fn_report$
declare
  v_sr public.subscription_rides;
  v_sub public.subscriptions;
  v_plan public.subscription_plans;
begin
  select sr.* into v_sr
  from public.subscription_rides sr
  join public.subscriptions s on s.id = sr.subscription_id
  where sr.id = p_subscription_ride_id and s.client_id = auth.uid()
  for update of sr;
  if not found then raise exception 'Trajet introuvable'; end if;
  if v_sr.status <> 'missed' then
    raise exception 'Seul un trajet manqué peut être reporté';
  end if;

  select * into v_sub from public.subscriptions
  where id = v_sr.subscription_id for update;
  select * into v_plan from public.subscription_plans where code = v_sub.plan_code;

  -- Compteur mensuel de jokers (reset automatique au changement de mois)
  if v_sub.reports_month is distinct from date_trunc('month', current_date)::date then
    update public.subscriptions
    set reports_used_month = 0,
        reports_month = date_trunc('month', current_date)::date
    where id = v_sub.id;
    v_sub.reports_used_month := 0;
  end if;

  if v_sub.reports_used_month >= v_plan.reports_per_month then
    raise exception 'Jokers du mois épuisés (% max)', v_plan.reports_per_month;
  end if;

  update public.subscription_rides
  set status = 'reported'
  where id = v_sr.id
  returning * into v_sr;

  update public.subscriptions
  set rides_remaining = rides_remaining + 1,
      reports_used_month = reports_used_month + 1
  where id = v_sub.id;

  insert into public.subscription_events (subscription_id, event_type, payload)
  values (v_sub.id, 'report_used', jsonb_build_object('subscription_ride_id', v_sr.id));

  return v_sr;
end;
$fn_report$;

-- ------------------------------------------------------------
-- 10. Génération J-1 des trajets planifiés (appelée par le scheduler
--     en service role — crée les lignes « planned », décompte les crédits)
-- ------------------------------------------------------------
create or replace function public.generate_subscription_rides(p_for_date date)
returns int
language plpgsql security definer set search_path = public as $fn_gen$
declare
  v_sub record;
  v_count int := 0;   -- total global (valeur de retour)
  v_used int;         -- décomptes pour l'abonnement en cours
  v_dirs text[];
  v_dir text;
  v_slot time;
begin
  for v_sub in
    select s.* from public.subscriptions s
    where s.status = 'active'
      and s.days_of_week is not null
      and extract(isodow from p_for_date)::int = any (s.days_of_week)
      and p_for_date >= s.starts_on
      and p_for_date <  s.expires_on
      and (s.paused_until is null or p_for_date > s.paused_until)
      and s.rides_remaining > 0
  loop
    v_used := 0;
    v_dirs := case when v_sub.slot_return is not null
                   then array['aller', 'retour']
                   else array['aller'] end;

    foreach v_dir in array v_dirs
    loop
      exit when v_sub.rides_remaining - v_used <= 0;
      v_slot := case v_dir when 'aller' then v_sub.slot_out else v_sub.slot_return end;

      insert into public.subscription_rides
        (subscription_id, travel_date, direction, slot_time)
      values (v_sub.id, p_for_date, v_dir, v_slot)
      on conflict (subscription_id, travel_date, direction) do nothing;

      if found then
        update public.subscriptions
        set rides_remaining = rides_remaining - 1
        where id = v_sub.id;
        v_used := v_used + 1;
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  -- Expiration automatique des pass arrivés à terme
  update public.subscriptions
  set status = 'expired'
  where status = 'active' and expires_on <= p_for_date;

  -- Reprise automatique des pauses terminées
  update public.subscriptions
  set status = 'active', paused_until = null
  where status = 'paused' and paused_until is not null and paused_until < p_for_date;

  return v_count;
end;
$fn_gen$;

-- Droits d'exécution
grant execute on function public.purchase_subscription to authenticated;
grant execute on function public.pause_subscription to authenticated;
grant execute on function public.report_subscription_ride to authenticated;
revoke execute on function public.generate_subscription_rides from public, authenticated, anon;
grant execute on function public.generate_subscription_rides to service_role;
