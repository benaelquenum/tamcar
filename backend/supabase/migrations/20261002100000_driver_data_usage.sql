-- ============================================================
-- TamCar Pro — Compteur de data des chauffeurs (2026-10-02)
--
-- Les chauffeurs paient leur forfait (200-300 F par jour) et coupent leurs
-- données pendant la course. Avant de négocier un forfait avec un opérateur ou
-- de dimensionner une SIM, il faut savoir ce que TamCar Pro consomme VRAIMENT.
--
-- L'application compte les octets qui passent par le réseau (API, navigation,
-- cartes, temps réel) et remonte les totaux du jour, une fois toutes les 10 min.
-- Cette table les garde par chauffeur et par jour ; la vue
-- driver_data_usage_daily en tire la moyenne par jour pour tous les chauffeurs.
--
-- Écriture uniquement par la fonction ci-dessous (SECURITY DEFINER) : un compte
-- ne peut ni lire les chiffres des autres ni écrire dans la table directement.
-- ============================================================

create table if not exists public.driver_data_usage (
  profile_id     uuid        not null references public.profiles(id) on delete cascade,
  day            date        not null,
  bytes_api      bigint      not null default 0,   -- courses, portefeuille, profil
  bytes_nav      bigint      not null default 0,   -- itinéraires (Mapbox Directions)
  bytes_tiles    bigint      not null default 0,   -- cartes (estimé : tuiles x 25 Ko)
  bytes_realtime bigint      not null default 0,   -- WebSocket temps réel
  bytes_other    bigint      not null default 0,   -- le reste
  tile_requests  integer     not null default 0,
  platform       text,                             -- 'native' (APK) ou 'web'
  updated_at     timestamptz not null default now(),
  primary key (profile_id, day)
);

alter table public.driver_data_usage enable row level security;

drop policy if exists driver_data_usage_read on public.driver_data_usage;
create policy driver_data_usage_read on public.driver_data_usage
  for select
  using (profile_id = auth.uid() or public.is_admin());

revoke all on public.driver_data_usage from anon;
revoke insert, update, delete, truncate on public.driver_data_usage from authenticated;

-- ------------------------------------------------------------
-- Remontée des totaux du jour. Idempotente : l'application renvoie des TOTAUX
-- cumulés depuis minuit, on garde donc le plus grand (plusieurs appareils ou
-- une remontée en double ne comptent pas deux fois).
-- ------------------------------------------------------------
create or replace function public.report_driver_data_usage(
  p_day           date,
  p_api           bigint,
  p_nav           bigint,
  p_tiles         bigint,
  p_realtime      bigint,
  p_other         bigint,
  p_tile_requests integer default 0,
  p_platform      text default null
)
returns void
language plpgsql security definer set search_path = public as $fn_rdu$
declare
  v_cap constant bigint := 5000000000;  -- 5 Go par catégorie et par jour : au-delà, valeur aberrante
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  -- Réservé aux chauffeurs ; une date trop lointaine est ignorée (horloge faussée).
  if not exists (select 1 from public.drivers where profile_id = auth.uid()) then return; end if;
  if p_day is null or p_day < current_date - 3 or p_day > current_date + 1 then return; end if;

  insert into public.driver_data_usage as u (
    profile_id, day, bytes_api, bytes_nav, bytes_tiles, bytes_realtime, bytes_other, tile_requests, platform
  ) values (
    auth.uid(), p_day,
    least(greatest(coalesce(p_api, 0), 0), v_cap),
    least(greatest(coalesce(p_nav, 0), 0), v_cap),
    least(greatest(coalesce(p_tiles, 0), 0), v_cap),
    least(greatest(coalesce(p_realtime, 0), 0), v_cap),
    least(greatest(coalesce(p_other, 0), 0), v_cap),
    least(greatest(coalesce(p_tile_requests, 0), 0), 10000000),
    case when p_platform in ('native', 'web') then p_platform end
  )
  on conflict (profile_id, day) do update set
    bytes_api      = greatest(u.bytes_api,      excluded.bytes_api),
    bytes_nav      = greatest(u.bytes_nav,      excluded.bytes_nav),
    bytes_tiles    = greatest(u.bytes_tiles,    excluded.bytes_tiles),
    bytes_realtime = greatest(u.bytes_realtime, excluded.bytes_realtime),
    bytes_other    = greatest(u.bytes_other,    excluded.bytes_other),
    tile_requests  = greatest(u.tile_requests,  excluded.tile_requests),
    platform       = coalesce(excluded.platform, u.platform),
    updated_at     = now();
end;
$fn_rdu$;

revoke all on function public.report_driver_data_usage(date, bigint, bigint, bigint, bigint, bigint, integer, text) from public, anon;
grant execute on function public.report_driver_data_usage(date, bigint, bigint, bigint, bigint, bigint, integer, text) to authenticated;

-- ------------------------------------------------------------
-- Vue pour l'équipe : moyenne par jour, en Mo, tous chauffeurs confondus.
-- security_invoker : la politique de lecture s'applique (admin seulement).
-- ------------------------------------------------------------
create or replace view public.driver_data_usage_daily
with (security_invoker = true) as
select
  day,
  count(*)                                                                as chauffeurs,
  round(avg(bytes_api + bytes_nav + bytes_tiles + bytes_realtime + bytes_other) / 1e6, 1) as mo_moyen_total,
  round(avg(bytes_api)      / 1e6, 1) as mo_api,
  round(avg(bytes_nav)      / 1e6, 1) as mo_navigation,
  round(avg(bytes_tiles)    / 1e6, 1) as mo_cartes,
  round(avg(bytes_realtime) / 1e6, 1) as mo_temps_reel,
  round(avg(bytes_other)    / 1e6, 1) as mo_autres,
  -- percentile_cont renvoie un double precision : round() n'existe qu'en numeric, d'où le ::numeric.
  round((percentile_cont(0.5) within group (order by bytes_api + bytes_nav + bytes_tiles + bytes_realtime + bytes_other))::numeric / 1e6, 1) as mo_mediane
from public.driver_data_usage
group by day
order by day desc;
