-- ============================================================
-- TamCar : suivi « en direct » du chauffeur sur l'écran verrouillé (2026-10-06)
--
--   Comme Uber : une notification qui se met à jour toute seule pendant que le téléphone est en veille
--   (« Votre chauffeur arrive dans 6 min », « Il est arrivé », « En course, arrivée dans 12 min »).
--
--   Côté serveur :
--     - _ride_live_push(ride)  : calcule l'état (en route / bientôt là / arrivé / en course), l'heure d'arrivée
--                                estimée et la progression, et envoie un message « live » si quelque chose a changé ;
--     - _ride_live_tick()      : appelée toutes les 15 s par pg_cron pour les courses actives ;
--     - trigger sur rides.status : message immédiat à chaque changement d'état, et fin de suivi ;
--     - ride_live_state        : mémoire du dernier message envoyé (pour ne pas répéter).
--   L'heure d'arrivée est ESTIMÉE sans appel à un service d'itinéraire : distance à vol d'oiseau x 1,35
--   (détour des rues) / vitesse urbaine moyenne de la catégorie (moto 28, tricycle 20, voiture 22 km/h vers le
--   client ; 30, 22 et 25 km/h en course). Pas de coût par appel.
--
--   Les messages « live » partent par _push_notify_live -> edge function send-push :
--     - Web Push (navigateur, PWA) : mise à jour du texte, remplacée sur place (même tag), silencieuse ;
--     - FCM (APK) : message de données qu'un code natif (TamCarMessagingService) transforme en carte avec barre
--       de progression et icône du véhicule (voiture, tricycle ou moto).
-- ============================================================

create table if not exists public.ride_live_state (
  ride_id uuid primary key references public.rides(id) on delete cascade,
  phase text not null,              -- 'pickup' (vers le client) | 'trip' (vers la destination)
  start_m int not null default 0,   -- distance au début de la phase (m) : sert de base à la progression
  last_state text,
  last_eta int,
  last_progress int,
  last_sent_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.ride_live_state enable row level security;
revoke all on public.ride_live_state from anon, authenticated;

-- ------------------------------------------------------------
-- Envoi d'un message « live » (même edge function que les autres pushs)
-- ------------------------------------------------------------
create or replace function public._push_notify_live(
  p_profile_id uuid,
  p_title text,
  p_body text,
  p_url text,
  p_tag text,
  p_live jsonb,
  p_alert boolean default false
)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  url text;
  svc text;
begin
  select value into url from public._push_settings where key = 'send_push_url';
  select value into svc from public._push_settings where key = 'service_role_key';
  if url is null or svc is null or url = '' or svc = '' then return; end if;

  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc),
    body := jsonb_build_object(
      'profile_id', p_profile_id,
      'title', coalesce(nullif(p_title, ''), 'TamCar'),
      'body', coalesce(p_body, ''),
      'url', coalesce(p_url, '/'),
      'tag', p_tag,
      'requireInteraction', false,
      'live', p_live,
      'alert', p_alert
    )
  );
end;
$fn$;
revoke execute on function public._push_notify_live(uuid, text, text, text, text, jsonb, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Calcul + envoi pour une course
--   p_force  : envoyer même si rien n'a changé (changement d'état)
--   p_status : statut simulé (TESTS uniquement)
--   p_dry    : ne rien envoyer ni mémoriser, renvoyer ce qui serait envoyé (TESTS uniquement)
-- Renvoie le message envoyé (jsonb), ou null si rien n'a été envoyé.
-- ------------------------------------------------------------
create or replace function public._ride_live_push(
  p_ride_id uuid,
  p_force boolean default false,
  p_status public.ride_status default null,
  p_dry boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
  drv record;
  v_status public.ride_status;
  v_phase text;
  v_state text;
  v_icon text;
  v_target geography;
  v_dist numeric;
  v_eta int;
  v_prog int;
  v_speed numeric;
  v_stale boolean;
  v_name text;
  v_vehicle text;
  v_detail text;
  v_title text;
  v_body text;
  v_chip text;
  v_alert boolean;
  v_live jsonb;
  s_exists boolean := false;
  s_phase text;
  s_start int;
  s_state text;
  s_eta int;
  s_prog int;
  s_sent timestamptz;
begin
  select ri.id, ri.client_id, ri.status, ri.requested_category, ri.vehicle_id, ri.driver_id,
         ri.pickup_location, ri.dropoff_location, ri.dropoff_address, ri.scheduled_at
    into r
    from public.rides ri where ri.id = p_ride_id;
  if not found then return null; end if;

  v_status := coalesce(p_status, r.status);
  if v_status not in ('matched', 'arrived', 'in_progress') or r.driver_id is null then return null; end if;

  -- Réservation à l'avance : pas de suivi tant que le départ est loin (le chauffeur n'est pas encore en route)
  if r.scheduled_at is not null and v_status = 'matched' and r.scheduled_at > now() + interval '40 minutes' then
    return null;
  end if;

  select d.current_location, d.last_seen_at, p.full_name, v.plate_number, v.brand, v.model, v.category::text as category
    into drv
    from public.drivers d
    join public.profiles p on p.id = d.profile_id
    left join public.vehicles v on v.id = coalesce(r.vehicle_id, d.current_vehicle_id)
   where d.id = r.driver_id;
  if not found then return null; end if;

  v_icon := case coalesce(drv.category, r.requested_category::text)
              when 'moto' then 'moto' when 'tricycle' then 'tricycle' else 'car' end;
  v_phase := case when v_status = 'in_progress' then 'trip' else 'pickup' end;
  v_target := case v_phase when 'trip' then r.dropoff_location else r.pickup_location end;
  v_stale := drv.current_location is null
             or (drv.last_seen_at is not null and drv.last_seen_at < now() - interval '3 minutes');
  v_speed := case v_phase
               when 'pickup' then case v_icon when 'moto' then 28 when 'tricycle' then 20 else 22 end
               else case v_icon when 'moto' then 30 when 'tricycle' then 22 else 25 end
             end;

  if not v_stale then
    v_dist := st_distance(drv.current_location, v_target);
    v_eta := greatest(1, ceil((v_dist * 1.35 / 1000.0) / v_speed * 60.0)::int);
  end if;

  v_state := case
    when v_status = 'arrived' then 'arrived'
    when v_status = 'in_progress' then 'trip'
    when v_dist is not null and (v_dist <= 350 or v_eta <= 1) then 'arriving'
    else 'enroute'
  end;

  -- Dernier message envoyé pour cette course
  select true, s.phase, s.start_m, s.last_state, s.last_eta, s.last_progress, s.last_sent_at
    into s_exists, s_phase, s_start, s_state, s_eta, s_prog, s_sent
    from public.ride_live_state s where s.ride_id = r.id;
  if not coalesce(s_exists, false) or s_phase is distinct from v_phase then
    s_start := coalesce(round(v_dist)::int, 0);
    s_state := null; s_eta := null; s_prog := null; s_sent := null;
  end if;

  -- Progression : part du chemin déjà parcourue depuis le début de la phase (jamais en arrière)
  if v_state = 'arrived' then
    v_prog := 100;
  elsif v_dist is null then
    v_prog := coalesce(s_prog, 0);
  else
    if round(v_dist) > coalesce(s_start, 0) then s_start := round(v_dist)::int; end if;
    v_prog := case when s_start > 0
                   then greatest(0, least(99, round(100 * (1 - v_dist / s_start))::int))
                   else 0 end;
    v_prog := greatest(v_prog, coalesce(s_prog, 0));
  end if;

  -- Rien de neuf ? (changement d'état, minute d'arrivée ou progression d'au moins 6 points, au plus toutes les
  -- 25 s ; un message de maintien toutes les 4 min pour que la carte ne s'éteigne pas)
  if not p_force and not p_dry
     and s_state is not distinct from v_state
     and not ((s_eta is distinct from v_eta or abs(v_prog - coalesce(s_prog, -100)) >= 6)
              and (s_sent is null or s_sent < now() - interval '25 seconds'))
     and not (s_sent is not null and s_sent < now() - interval '4 minutes')
  then
    return null;
  end if;

  v_name := split_part(coalesce(drv.full_name, ''), ' ', 1);
  v_vehicle := trim(coalesce(drv.brand, '') || ' ' || coalesce(drv.model, ''));
  v_detail := concat_ws(' · ', nullif(v_name, ''), nullif(v_vehicle, ''), drv.plate_number);

  if v_state = 'enroute' then
    v_title := case when v_eta is null then 'Votre chauffeur est en route'
                    else 'Votre chauffeur arrive dans ' || v_eta || ' min' end;
    v_body := v_detail;
    v_chip := case when v_eta is null then null else v_eta || ' min' end;
  elsif v_state = 'arriving' then
    v_title := 'Votre chauffeur arrive';
    v_body := concat_ws(' · ', 'Soyez prêt au point de départ', drv.plate_number);
    v_chip := '1 min';
  elsif v_state = 'arrived' then
    v_title := 'Votre chauffeur est arrivé';
    v_body := concat_ws(' · ', 'Rejoignez-le au point de départ', drv.plate_number);
    v_chip := 'Arrivé';
  else
    v_title := case when v_eta is null then 'Course en cours'
                    else 'En course · arrivée dans ' || v_eta || ' min' end;
    v_body := 'Vers ' || left(coalesce(nullif(r.dropoff_address, ''), 'votre destination'), 60);
    v_chip := case when v_eta is null then null else v_eta || ' min' end;
  end if;

  -- Alerte sonore / bandeau : première annonce, « bientôt là » et « arrivé » seulement
  v_alert := s_state is distinct from v_state and v_state in ('enroute', 'arriving', 'arrived');

  v_live := jsonb_build_object(
    'type', 'ride_progress',
    'ride_id', r.id,
    'state', v_state,
    'eta', v_eta,
    'progress', v_prog,
    'icon', v_icon,
    'plate', drv.plate_number,
    'driver', nullif(v_name, ''),
    'vehicle', nullif(v_vehicle, ''),
    'chip', v_chip,
    'alert', v_alert,
    'title', v_title,
    'body', v_body
  );

  if p_dry then return v_live; end if;

  perform public._push_notify_live(
    r.client_id, v_title, v_body, '/ride/' || r.id::text, 'ride:' || r.id::text, v_live, v_alert
  );

  insert into public.ride_live_state (ride_id, phase, start_m, last_state, last_eta, last_progress, last_sent_at, updated_at)
  values (r.id, v_phase, coalesce(s_start, 0), v_state, v_eta, v_prog, now(), now())
  on conflict (ride_id) do update
    set phase = excluded.phase, start_m = excluded.start_m, last_state = excluded.last_state,
        last_eta = excluded.last_eta, last_progress = excluded.last_progress,
        last_sent_at = excluded.last_sent_at, updated_at = now();

  return v_live;
end;
$fn$;
revoke execute on function public._ride_live_push(uuid, boolean, public.ride_status, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Passage périodique sur les courses actives
-- ------------------------------------------------------------
create or replace function public._ride_live_tick()
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from public.rides
     where status in ('matched', 'arrived', 'in_progress')
       and updated_at > now() - interval '8 hours'
  loop
    begin
      if public._ride_live_push(r.id) is not null then n := n + 1; end if;
    exception when others then
      null; -- une course en erreur ne bloque pas les autres
    end;
  end loop;

  delete from public.ride_live_state s
   using public.rides ri
   where ri.id = s.ride_id and ri.status not in ('matched', 'arrived', 'in_progress');

  return n;
end;
$fn$;
revoke execute on function public._ride_live_tick() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Changement d'état : message immédiat, ou fin de suivi
-- ------------------------------------------------------------
create or replace function public._ride_live_on_status()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if NEW.status in ('matched', 'arrived', 'in_progress') then
    perform public._ride_live_push(NEW.id, true);
  elsif OLD.status in ('matched', 'arrived', 'in_progress') then
    delete from public.ride_live_state where ride_id = NEW.id;
    -- L'APK retire la carte (sauf si une notification de fin l'a déjà remplacée) ; le web n'est pas concerné.
    perform public._push_notify_live(
      NEW.client_id, 'TamCar', '', '/ride/' || NEW.id::text, 'ride:' || NEW.id::text,
      jsonb_build_object('type', 'ride_progress_end', 'ride_id', NEW.id, 'end', true), false
    );
  end if;
  return NEW;
exception when others then
  return NEW; -- le suivi en direct ne doit jamais bloquer une course
end;
$fn$;
revoke execute on function public._ride_live_on_status() from public, anon, authenticated;

drop trigger if exists ride_live_on_status on public.rides;
create trigger ride_live_on_status
  after update of status on public.rides
  for each row
  when (OLD.status is distinct from NEW.status)
  execute function public._ride_live_on_status();

select cron.schedule('ride-live-tick', '15 seconds', $$select public._ride_live_tick()$$);
