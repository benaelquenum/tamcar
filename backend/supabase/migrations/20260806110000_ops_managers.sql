-- ============================================================
-- TamCar — Responsables opérations par ville (2026-08-06)
--
--   Chaque ville de déploiement (Cotonou, Porto-Novo, Parakou) a un
--   responsable opérations rémunéré à 3 % du VOLUME DES COURSES de sa
--   ville, plafonné à 150 000 F par mois.
--
--   ⚠️ Point d'architecture : un responsable opérations PEUT AUSSI être
--   chauffeur. Comme un compte n'a qu'un seul `profiles.role`, le droit
--   d'accès à l'espace /ops ne repose PAS sur le rôle mais sur
--   l'appartenance à la table `ops_city_managers`.
--
--   ⚠️ La rémunération est CALCULÉE, PAS PAYÉE. Aucune écriture
--   comptable, aucun mouvement de wallet n'est créé ici. Seul le champ
--   `ops_city_managers.settled_through_month` est prévu pour tracer un
--   règlement futur (il n'est écrit par aucune fonction de ce fichier).
--
--   Livré :
--     • ops_cities              — référentiel des villes opérées
--     • rides.ops_city          — ville de rattachement (matérialisée)
--     • ops_city_managers       — nominations (1 actif max par ville)
--     • ops_city_for_point()    — attribution géographique
--     • ops_is_manager()        — gate d'accès /ops
--     • ops_my_dashboard()      — synthèse du mois pour le responsable
--     • ops_my_daily()          — détail jour par jour
--     • ops_my_months()         — historique des N derniers mois
--     • admin_city_managers()   — vue admin de tous les responsables
--     • admin_set_city_manager()— nommer / remplacer un responsable
--     • ops_backfill_ride_cities() — recalcul si un centre bouge
-- ============================================================


-- ============================================================
-- 1. Référentiel des villes opérées
-- ============================================================

create table if not exists public.ops_cities (
  city        text primary key,
  center_lat  double precision not null,
  center_lng  double precision not null,
  radius_m    int not null default 25000 check (radius_m > 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.ops_cities is
  'Référentiel des villes opérées par TamCar (centre + rayon). Sert à rattacher une course à une ville pour la rémunération des responsables opérations.';

-- Centres repris de la zone de service (_is_within_service_zone) pour rester
-- cohérent avec le périmètre commercial déjà en production.
--   Cotonou    : rayon 45 km → absorbe Abomey-Calavi, Godomey, Pahou, Ouidah
--   Porto-Novo : rayon 30 km → absorbe Sèmè-Podji (est), Avrankou, Adjarra
--   Parakou    : rayon 30 km → ville isolée au nord, aucun conflit
insert into public.ops_cities (city, center_lat, center_lng, radius_m) values
  ('Cotonou',    6.365, 2.435, 45000),
  ('Porto-Novo', 6.497, 2.605, 30000),
  ('Parakou',    9.337, 2.630, 30000)
on conflict (city) do nothing;

alter table public.ops_cities enable row level security;

drop policy if exists ops_cities_public_read on public.ops_cities;
create policy ops_cities_public_read on public.ops_cities
  for select using (true);

drop policy if exists ops_cities_admin_write on public.ops_cities;
create policy ops_cities_admin_write on public.ops_cities
  for all using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- 2. Rattachement d'une course à une ville
--
--   MÉTHODE RETENUE : la course est rattachée à la ville de
--   `ops_cities` dont le CENTRE est le plus proche de son POINT DE
--   DÉPART (pickup_location), à condition d'être dans le rayon de
--   cette ville. Sinon NULL (course hors périmètre : elle ne compte
--   pour personne).
--
--   POURQUOI PAS « la ville du lieu `places` le plus proche » :
--     1. `places` ne contient AUCUN POI à Parakou (les 10 300 POI OSM
--        importés couvrent uniquement le corridor sud). Une course
--        partant de Parakou serait rattachée à un lieu situé à 400 km.
--     2. `places.city` est plus fin que le découpage opérationnel :
--        4 806 POI 'Abomey-Calavi', 232 'Sèmè-Kpodji', 644 'Ouidah'.
--        Ces communes n'ont pas de responsable → une grande partie du
--        volume réel du Grand Nokoué ne serait attribuée à personne.
--     3. Coût : un KNN GiST par course (`<->` sur 10 000+ POI) contre
--        3 distances sur une table de 3 lignes ici, et surtout la
--        valeur est MATÉRIALISÉE dans `rides.ops_city` à l'insertion
--        → l'agrégation mensuelle est un simple index range scan.
--
--   LIMITES ASSUMÉES :
--     a. La frontière entre deux villes est la médiatrice des centres,
--        pas une limite administrative réelle. Cotonou et Porto-Novo
--        sont distants de ~24 km : tout ce qui part à plus de ~12 km
--        à l'est de Cotonou bascule sur Porto-Novo (Sèmè-Podji, par
--        exemple, rattachée à Porto-Novo — même département Ouémé).
--     b. Seul le POINT DE DÉPART compte. Une course interurbaine
--        Cotonou → Porto-Novo est intégralement au crédit de Cotonou.
--        C'est volontaire : le responsable « produit » la course en
--        recrutant et en animant les chauffeurs de son bassin.
--     c. La valeur est figée à l'insertion. Si un centre ou un rayon
--        d'`ops_cities` change, il faut relancer
--        `public.ops_backfill_ride_cities()` (admin).
-- ============================================================

create or replace function public.ops_city_for_point(
  p_lat double precision,
  p_lng double precision
)
returns text
language sql stable security invoker as $fn$
  -- Lecture seule sur un référentiel public (ops_cities). Aucun contrôle
  -- d'accès nécessaire : ne révèle que le nom d'une ville pour un point.
  select c.city
  from public.ops_cities c
  where c.active
    and p_lat is not null
    and p_lng is not null
    and st_dwithin(
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
          st_setsrid(st_makepoint(c.center_lng, c.center_lat), 4326)::geography,
          c.radius_m
        )
  order by st_distance(
             st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
             st_setsrid(st_makepoint(c.center_lng, c.center_lat), 4326)::geography
           ) asc
  limit 1;
$fn$;

comment on function public.ops_city_for_point is
  'Ville opérée la plus proche du point (centre le plus proche, dans son rayon). NULL si hors périmètre.';

grant execute on function public.ops_city_for_point(double precision, double precision) to authenticated;


-- Colonne matérialisée sur rides
alter table public.rides add column if not exists ops_city text;

comment on column public.rides.ops_city is
  'Ville opérée de rattachement, calculée depuis pickup_location à l''insertion (cf ops_city_for_point). NULL = hors périmètre.';

create or replace function public._rides_set_ops_city()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  -- Trigger interne (pas d'appel direct possible) : le contrôle d'accès est
  -- assuré par les policies RLS de public.rides sur l'INSERT/UPDATE lui-même.
  new.ops_city := public.ops_city_for_point(
    st_y(new.pickup_location::geometry),
    st_x(new.pickup_location::geometry)
  );
  return new;
end;
$fn$;

drop trigger if exists rides_set_ops_city on public.rides;
create trigger rides_set_ops_city
  before insert or update of pickup_location on public.rides
  for each row execute function public._rides_set_ops_city();

-- Backfill des courses existantes (idempotent : seules les lignes non
-- encore renseignées sont touchées).
update public.rides r
   set ops_city = public.ops_city_for_point(
         st_y(r.pickup_location::geometry),
         st_x(r.pickup_location::geometry))
 where r.ops_city is null;

-- Index de travail : toutes les agrégations filtrent
-- (ops_city, status='completed', ended_at) et somment price_total_fcfa.
create index if not exists rides_ops_city_completed_idx
  on public.rides (ops_city, ended_at)
  include (price_total_fcfa, driver_id)
  where status = 'completed' and ops_city is not null;


create or replace function public.ops_backfill_ride_cities()
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_count int;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  update public.rides r
     set ops_city = public.ops_city_for_point(
           st_y(r.pickup_location::geometry),
           st_x(r.pickup_location::geometry));
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

comment on function public.ops_backfill_ride_cities is
  'Recalcule rides.ops_city sur TOUTES les courses. À lancer après modification d''un centre / rayon dans ops_cities. Admin uniquement.';

revoke execute on function public.ops_backfill_ride_cities() from public, anon;
grant execute on function public.ops_backfill_ride_cities() to authenticated;


-- ============================================================
-- 3. Nominations
-- ============================================================

create table if not exists public.ops_city_managers (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null references public.profiles(id) on delete cascade,
  city                 text not null references public.ops_cities(city) on update cascade,
  rate_pct             numeric(5,2) not null default 3.0
                         check (rate_pct >= 0 and rate_pct <= 100),
  monthly_cap_fcfa     int not null default 150000 check (monthly_cap_fcfa >= 0),
  active               boolean not null default true,
  started_on           date not null default (now() at time zone 'Africa/Porto-Novo')::date,
  ended_on             date,
  -- Règlement futur : dernier mois effectivement payé (inclus).
  -- AUCUNE fonction de ce fichier ne l'écrit — la rémunération est
  -- calculée, pas payée. Champ prévu pour le flux de paiement à venir.
  settled_through_month date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint ops_city_managers_period_chk
    check (ended_on is null or ended_on >= started_on)
);

comment on table public.ops_city_managers is
  'Responsables opérations par ville. L''appartenance à cette table (et non profiles.role) ouvre l''accès à l''espace /ops — un responsable peut aussi être chauffeur.';
comment on column public.ops_city_managers.settled_through_month is
  'Dernier mois RÉGLÉ au responsable (inclus). NULL = rien réglé. Réservé au futur flux de paiement : rien ne l''écrit aujourd''hui.';

-- Un seul responsable ACTIF par ville à la fois.
create unique index if not exists ops_city_managers_one_active_per_city
  on public.ops_city_managers (city) where active;

create index if not exists ops_city_managers_profile_idx
  on public.ops_city_managers (profile_id);

drop trigger if exists ops_city_managers_updated_at on public.ops_city_managers;
create trigger ops_city_managers_updated_at
  before update on public.ops_city_managers
  for each row execute function public.set_updated_at();

alter table public.ops_city_managers enable row level security;

drop policy if exists ops_city_managers_select on public.ops_city_managers;
create policy ops_city_managers_select on public.ops_city_managers
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists ops_city_managers_admin_write on public.ops_city_managers;
create policy ops_city_managers_admin_write on public.ops_city_managers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- 4. Gate d'accès à l'espace /ops
-- ============================================================

create or replace function public.ops_is_manager()
returns boolean
language sql stable security definer set search_path = public as $fn$
  -- Ne répond que sur l'utilisateur courant : pas de fuite d'information.
  select exists(
    select 1 from public.ops_city_managers m where m.profile_id = auth.uid()
  );
$fn$;

comment on function public.ops_is_manager is
  'true si l''utilisateur courant est (ou a été) responsable opérations d''une ville. Gate d''accès de /ops — indépendant de profiles.role.';

revoke execute on function public.ops_is_manager() from public, anon;
grant execute on function public.ops_is_manager() to authenticated;


-- ============================================================
-- 5. Tableau de bord du responsable
--
--   Assiette = SOMME de rides.price_total_fcfa des courses TERMINÉES
--   partant de sa ville sur le mois (prix payé par le client, PAS la
--   commission TamCar).
--
--   Les courses sont bornées à la PÉRIODE DE MANDAT (started_on →
--   ended_on) : un responsable nommé le 15 ne touche pas le volume du
--   1er au 14, et un remplacement en cours de mois ne double-compte pas.
--
--   Fuseau : Africa/Porto-Novo (UTC+1, pas de changement d'heure).
-- ============================================================

create or replace function public.ops_my_dashboard(p_month date default null)
returns table (
  city              text,
  month_start       date,
  rate_pct          numeric,
  monthly_cap_fcfa  int,
  rides_count       int,
  volume_fcfa       bigint,
  active_drivers    int,
  gross_pay_fcfa    int,
  pay_fcfa          int,
  cap_reached       boolean,
  cap_progress_pct  numeric,
  settled           boolean,
  started_on        date,
  ended_on          date
)
language plpgsql stable security definer set search_path = public as $fn$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_start date;
  v_end   date;   -- exclusif
begin
  if v_uid is null then raise exception 'Auth required'; end if;

  v_start := date_trunc('month',
               coalesce(p_month, (now() at time zone 'Africa/Porto-Novo')::date))::date;
  v_end   := (v_start + interval '1 month')::date;

  return query
  with mine as (
    select m.city, m.rate_pct, m.monthly_cap_fcfa, m.settled_through_month,
           m.started_on, m.ended_on
      from public.ops_city_managers m
     where m.profile_id = v_uid
       and m.started_on < v_end
       and (m.ended_on is null or m.ended_on >= v_start)
  ),
  agg as (
    select mi.city, mi.rate_pct, mi.monthly_cap_fcfa, mi.settled_through_month,
           mi.started_on, mi.ended_on,
           count(r.id)::int                              as rides_count,
           coalesce(sum(r.price_total_fcfa), 0)::bigint  as volume_fcfa,
           count(distinct r.driver_id)::int              as active_drivers
      from mine mi
      left join public.rides r
        on r.ops_city = mi.city
       and r.status   = 'completed'
       and r.ended_at >= ((greatest(v_start, mi.started_on))::timestamp
                            at time zone 'Africa/Porto-Novo')
       and r.ended_at <  ((least(v_end, coalesce(mi.ended_on + 1, v_end)))::timestamp
                            at time zone 'Africa/Porto-Novo')
     group by mi.city, mi.rate_pct, mi.monthly_cap_fcfa, mi.settled_through_month,
              mi.started_on, mi.ended_on
  ),
  calc as (
    select a.*,
           floor(a.volume_fcfa * a.rate_pct / 100.0)::int as gross
      from agg a
  )
  select c.city,
         v_start,
         c.rate_pct,
         c.monthly_cap_fcfa,
         c.rides_count,
         c.volume_fcfa,
         c.active_drivers,
         c.gross,
         least(c.gross, c.monthly_cap_fcfa)                       as pay_fcfa,
         (c.gross >= c.monthly_cap_fcfa)                          as cap_reached,
         case when c.monthly_cap_fcfa = 0 then 100::numeric
              else round(least(100.0, c.gross * 100.0 / c.monthly_cap_fcfa), 1)
         end                                                      as cap_progress_pct,
         (c.settled_through_month is not null
            and v_start <= c.settled_through_month)               as settled,
         c.started_on,
         c.ended_on
    from calc c
   order by c.city;
end;
$fn$;

comment on function public.ops_my_dashboard is
  'Synthèse du mois pour le responsable opérations connecté : volume, courses, chauffeurs actifs, rémunération plafonnée. Assiette = prix total des courses terminées de sa ville.';

revoke execute on function public.ops_my_dashboard(date) from public, anon;
grant execute on function public.ops_my_dashboard(date) to authenticated;


-- ------------------------------------------------------------
-- Détail jour par jour (graphique / tableau)
--   pay_fcfa = part réellement acquise CE jour-là, c.-à-d. la
--   progression du cumul plafonné → la somme de la colonne est
--   exactement la rémunération du mois (le jour où le plafond est
--   atteint, la part du jour est tronquée, les suivants sont à 0).
-- ------------------------------------------------------------

create or replace function public.ops_my_daily(p_month date default null)
returns table (
  city                text,
  day                 date,
  rides_count         int,
  volume_fcfa         bigint,
  gross_pay_fcfa      int,
  pay_fcfa            int,
  cumulative_pay_fcfa int
)
language plpgsql stable security definer set search_path = public as $fn$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_start date;
  v_end   date;   -- exclusif
  v_last  date;
begin
  if v_uid is null then raise exception 'Auth required'; end if;

  v_start := date_trunc('month',
               coalesce(p_month, (now() at time zone 'Africa/Porto-Novo')::date))::date;
  v_end   := (v_start + interval '1 month')::date;
  -- Mois en cours : on s'arrête à aujourd'hui (pas de jours futurs vides).
  v_last  := least((v_end - 1)::date, (now() at time zone 'Africa/Porto-Novo')::date);

  return query
  with mine as (
    select m.city, m.rate_pct, m.monthly_cap_fcfa, m.started_on, m.ended_on
      from public.ops_city_managers m
     where m.profile_id = v_uid
       and m.started_on < v_end
       and (m.ended_on is null or m.ended_on >= v_start)
  ),
  days as (
    select gs.d::date as d
      -- cast explicite en timestamp : évite l'ambiguïté de résolution
      -- generate_series(date, date, interval) → timestamp vs timestamptz.
      from generate_series(v_start::timestamp, v_last::timestamp, interval '1 day') as gs(d)
  ),
  per_day as (
    select mi.city, mi.rate_pct, mi.monthly_cap_fcfa, dd.d,
           count(r.id)::int                             as rides_count,
           coalesce(sum(r.price_total_fcfa), 0)::bigint as volume_fcfa
      from mine mi
      cross join days dd
      left join public.rides r
        on r.ops_city = mi.city
       and r.status   = 'completed'
       and dd.d >= mi.started_on
       and (mi.ended_on is null or dd.d <= mi.ended_on)
       and r.ended_at >= (dd.d::timestamp at time zone 'Africa/Porto-Novo')
       and r.ended_at <  ((dd.d + 1)::timestamp at time zone 'Africa/Porto-Novo')
     group by mi.city, mi.rate_pct, mi.monthly_cap_fcfa, dd.d
  ),
  running as (
    select p.*,
           sum(p.volume_fcfa) over (partition by p.city order by p.d
                                    rows between unbounded preceding and current row) as cum_volume
      from per_day p
  ),
  capped as (
    select rn.*,
           least(floor(rn.cum_volume * rn.rate_pct / 100.0)::int,
                 rn.monthly_cap_fcfa) as cum_pay
      from running rn
  )
  select cp.city,
         cp.d,
         cp.rides_count,
         cp.volume_fcfa,
         floor(cp.volume_fcfa * cp.rate_pct / 100.0)::int as gross_pay_fcfa,
         (cp.cum_pay - coalesce(
              lag(cp.cum_pay) over (partition by cp.city order by cp.d), 0))::int as pay_fcfa,
         cp.cum_pay
    from capped cp
   order by cp.city, cp.d;
end;
$fn$;

comment on function public.ops_my_daily is
  'Détail jour par jour du mois pour le responsable connecté. pay_fcfa = part acquise le jour même (cumul plafonné), la somme du mois = ops_my_dashboard.pay_fcfa.';

revoke execute on function public.ops_my_daily(date) from public, anon;
grant execute on function public.ops_my_daily(date) to authenticated;


-- ------------------------------------------------------------
-- Historique des N derniers mois
-- ------------------------------------------------------------

create or replace function public.ops_my_months(p_count int default 6)
returns table (
  city         text,
  month_start  date,
  rides_count  int,
  volume_fcfa  bigint,
  pay_fcfa     int,
  cap_reached  boolean,
  settled      boolean
)
language plpgsql stable security definer set search_path = public as $fn$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_today date;
  v_n     int;
begin
  if v_uid is null then raise exception 'Auth required'; end if;

  v_today := (now() at time zone 'Africa/Porto-Novo')::date;
  v_n     := least(greatest(coalesce(p_count, 6), 1), 24);

  return query
  with months as (
    select (date_trunc('month', v_today) - make_interval(months => gs.g))::date as m
      from generate_series(0, v_n - 1) as gs(g)
  ),
  mine as (
    select m.city, m.rate_pct, m.monthly_cap_fcfa, m.settled_through_month,
           m.started_on, m.ended_on
      from public.ops_city_managers m
     where m.profile_id = v_uid
  ),
  agg as (
    select mi.city, mo.m, mi.rate_pct, mi.monthly_cap_fcfa, mi.settled_through_month,
           count(r.id)::int                             as rides_count,
           coalesce(sum(r.price_total_fcfa), 0)::bigint as volume_fcfa
      from mine mi
      join months mo
        on mi.started_on < (mo.m + interval '1 month')::date
       and (mi.ended_on is null or mi.ended_on >= mo.m)
      left join public.rides r
        on r.ops_city = mi.city
       and r.status   = 'completed'
       and r.ended_at >= ((greatest(mo.m, mi.started_on))::timestamp
                            at time zone 'Africa/Porto-Novo')
       and r.ended_at <  ((least((mo.m + interval '1 month')::date,
                                 coalesce(mi.ended_on + 1,
                                          (mo.m + interval '1 month')::date)))::timestamp
                            at time zone 'Africa/Porto-Novo')
     group by mi.city, mo.m, mi.rate_pct, mi.monthly_cap_fcfa, mi.settled_through_month
  )
  select a.city,
         a.m,
         a.rides_count,
         a.volume_fcfa,
         least(floor(a.volume_fcfa * a.rate_pct / 100.0)::int, a.monthly_cap_fcfa),
         (floor(a.volume_fcfa * a.rate_pct / 100.0)::int >= a.monthly_cap_fcfa),
         (a.settled_through_month is not null and a.m <= a.settled_through_month)
    from agg a
   order by a.city, a.m desc;
end;
$fn$;

comment on function public.ops_my_months is
  'Historique des N derniers mois (max 24) du responsable connecté, une ligne par ville et par mois.';

revoke execute on function public.ops_my_months(int) from public, anon;
grant execute on function public.ops_my_months(int) to authenticated;


-- ============================================================
-- 6. Administration
-- ============================================================

create or replace function public.admin_city_managers()
returns table (
  id                    uuid,
  profile_id            uuid,
  full_name             text,
  phone                 text,
  profile_role          user_role,
  city                  text,
  rate_pct              numeric,
  monthly_cap_fcfa      int,
  active                boolean,
  started_on            date,
  ended_on              date,
  settled_through_month date,
  month_start           date,
  rides_count           int,
  volume_fcfa           bigint,
  pay_fcfa              int,
  cap_reached           boolean
)
language plpgsql stable security definer set search_path = public as $fn$
#variable_conflict use_column
declare
  v_start date;
  v_end   date;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  v_start := date_trunc('month', (now() at time zone 'Africa/Porto-Novo')::date)::date;
  v_end   := (v_start + interval '1 month')::date;

  return query
  with agg as (
    select m.id, m.profile_id, m.city, m.rate_pct, m.monthly_cap_fcfa, m.active,
           m.started_on, m.ended_on, m.settled_through_month,
           count(r.id)::int                             as rides_count,
           coalesce(sum(r.price_total_fcfa), 0)::bigint as volume_fcfa
      from public.ops_city_managers m
      left join public.rides r
        on r.ops_city = m.city
       and r.status   = 'completed'
       and m.started_on < v_end
       and (m.ended_on is null or m.ended_on >= v_start)
       and r.ended_at >= ((greatest(v_start, m.started_on))::timestamp
                            at time zone 'Africa/Porto-Novo')
       and r.ended_at <  ((least(v_end, coalesce(m.ended_on + 1, v_end)))::timestamp
                            at time zone 'Africa/Porto-Novo')
     group by m.id, m.profile_id, m.city, m.rate_pct, m.monthly_cap_fcfa, m.active,
              m.started_on, m.ended_on, m.settled_through_month
  )
  select a.id, a.profile_id, p.full_name, p.phone, p.role,
         a.city, a.rate_pct, a.monthly_cap_fcfa, a.active,
         a.started_on, a.ended_on, a.settled_through_month,
         v_start,
         a.rides_count,
         a.volume_fcfa,
         least(floor(a.volume_fcfa * a.rate_pct / 100.0)::int, a.monthly_cap_fcfa),
         (floor(a.volume_fcfa * a.rate_pct / 100.0)::int >= a.monthly_cap_fcfa)
    from agg a
    join public.profiles p on p.id = a.profile_id
   order by a.active desc, a.city, a.started_on desc;
end;
$fn$;

comment on function public.admin_city_managers is
  'Vue admin de tous les responsables opérations avec leur rémunération du mois en cours (bornée à leur période de mandat).';

revoke execute on function public.admin_city_managers() from public, anon;
grant execute on function public.admin_city_managers() to authenticated;


-- ------------------------------------------------------------
-- Nommer / remplacer un responsable
--   • si le profil est déjà responsable actif de la ville → maj taux/plafond
--   • sinon → clôture le responsable actif en place (active=false,
--     ended_on = hier si le mandat a commencé avant, sinon aujourd'hui)
--     puis crée la nouvelle nomination.
-- ------------------------------------------------------------

create or replace function public.admin_set_city_manager(
  p_profile_id uuid,
  p_city       text,
  p_rate       numeric default 3.0,
  p_cap        int     default 150000
)
returns public.ops_city_managers
language plpgsql security definer set search_path = public as $fn$
declare
  v_today date;
  v_row   public.ops_city_managers;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  if p_profile_id is null then raise exception 'Profil requis'; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Profil introuvable';
  end if;
  if not exists (select 1 from public.ops_cities where city = p_city and active) then
    raise exception 'Ville inconnue ou inactive : %', p_city;
  end if;
  if p_rate is null or p_rate < 0 or p_rate > 100 then
    raise exception 'Taux invalide (0 a 100)';
  end if;
  if p_cap is null or p_cap < 0 then
    raise exception 'Plafond invalide';
  end if;

  v_today := (now() at time zone 'Africa/Porto-Novo')::date;

  -- Déjà en poste sur cette ville : simple ajustement taux / plafond.
  select * into v_row
    from public.ops_city_managers
   where city = p_city and active and profile_id = p_profile_id;

  if found then
    update public.ops_city_managers
       set rate_pct = p_rate, monthly_cap_fcfa = p_cap, updated_at = now()
     where id = v_row.id
     returning * into v_row;
    return v_row;
  end if;

  -- Remplacement : on clôture le titulaire en place.
  update public.ops_city_managers
     set active = false,
         ended_on = case when started_on < v_today then v_today - 1 else started_on end,
         updated_at = now()
   where city = p_city and active;

  insert into public.ops_city_managers
    (profile_id, city, rate_pct, monthly_cap_fcfa, active, started_on)
  values
    (p_profile_id, p_city, p_rate, p_cap, true, v_today)
  returning * into v_row;

  return v_row;
end;
$fn$;

comment on function public.admin_set_city_manager is
  'Nomme (ou remplace) le responsable opérations d''une ville. Clôture automatiquement le titulaire en place — un seul actif par ville.';

revoke execute on function public.admin_set_city_manager(uuid, text, numeric, int) from public, anon;
grant execute on function public.admin_set_city_manager(uuid, text, numeric, int) to authenticated;


-- ------------------------------------------------------------
-- Retirer un responsable (fin de mandat)
-- ------------------------------------------------------------

create or replace function public.admin_end_city_manager(p_id uuid)
returns public.ops_city_managers
language plpgsql security definer set search_path = public as $fn$
declare
  v_row public.ops_city_managers;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  update public.ops_city_managers
     set active = false,
         ended_on = coalesce(ended_on, (now() at time zone 'Africa/Porto-Novo')::date),
         updated_at = now()
   where id = p_id
   returning * into v_row;

  if not found then raise exception 'Nomination introuvable'; end if;
  return v_row;
end;
$fn$;

comment on function public.admin_end_city_manager is
  'Met fin au mandat d''un responsable opérations (active=false, ended_on=aujourd''hui). La ville se retrouve sans responsable.';

revoke execute on function public.admin_end_city_manager(uuid) from public, anon;
grant execute on function public.admin_end_city_manager(uuid) to authenticated;
