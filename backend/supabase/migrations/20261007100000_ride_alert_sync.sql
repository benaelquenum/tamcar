-- ============================================================
-- Synchro client <-> chauffeur sur les demandes de course (2026-10-07)
--
-- Constat (Terence) : le client annule, le chauffeur continue de recevoir l'alerte.
--   Causes :
--   1. la RLS « rides_driver_pool_read » ne montre aux chauffeurs que les courses encore
--      « requested » sans chauffeur : l'annulation (ou la prise par un autre chauffeur) sort la ligne
--      de leur vue, donc le temps réel ne leur envoie AUCUN événement ; l'écran ne se corrigeait qu'au
--      sondage de sécurité (45 s) et la boucle sonore tournait jusque-là ;
--   2. aucune notification de fin : l'alerte système (push) restait affichée.
--
-- Corrections :
--   a. _push_notify enrichit toute alerte « new-ride:<id> » (adresses, distance au chauffeur, catégorie) et la
--      marque comme alerte de course (champ « ring ») : l'APK chauffeur récent y fait sonner sa sonnerie ;
--   b. trigger _ride_alert_gone : dès qu'une demande quitte le pool (annulée, expirée, prise, catégorie
--      changée), (1) message de FIN aux chauffeurs alertés (la notification est remplacée puis disparaît,
--      la sonnerie native s'arrête), (2) diffusion temps réel « ride_gone » sur le canal « driver-pool » : les
--      écrans chauffeur ouverts retirent la demande et coupent le son immédiatement.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Alerte de course enrichie
-- ------------------------------------------------------------
create or replace function public._push_notify(
  p_profile_id uuid,
  p_title text,
  p_body text,
  p_url text default '/',
  p_tag text default null,
  p_require_interaction boolean default false
)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  url text;
  svc text;
  payload jsonb;
  v_ride_id uuid;
  v_ride record;
  v_dist numeric;
  v_dist_txt text;
  v_body text := p_body;
begin
  select value into url from public._push_settings where key = 'send_push_url';
  select value into svc from public._push_settings where key = 'service_role_key';
  if url is null or svc is null or url = '' or svc = '' then return; end if;

  payload := jsonb_build_object(
    'profile_id', p_profile_id,
    'title', p_title,
    'body', p_body,
    'url', coalesce(p_url, '/'),
    'tag', p_tag,
    'requireInteraction', p_require_interaction
  );

  -- Alerte de nouvelle course : adresses + distance au chauffeur, et marqueur « ring » pour la sonnerie native.
  if p_tag like 'new-ride:%' then
    begin
      v_ride_id := substring(p_tag from 10)::uuid;
    exception when others then
      v_ride_id := null;
    end;
    if v_ride_id is not null then
      select r.requested_category, r.pickup_address, r.dropoff_address, r.pickup_location, r.scheduled_at
        into v_ride
        from public.rides r where r.id = v_ride_id;
      if found then
        select st_distance(d.current_location, v_ride.pickup_location)
          into v_dist
          from public.drivers d
         where d.profile_id = p_profile_id and d.current_location is not null
         limit 1;
        v_dist_txt := case
          when v_dist is null then null
          when v_dist < 1000 then (round(v_dist / 10.0) * 10)::int || ' m'
          else replace(round(v_dist / 1000.0, 1)::text, '.', ',') || ' km'
        end;
        v_body := coalesce('À ' || v_dist_txt || ' · ', '')
                  || left(coalesce(v_ride.pickup_address, ''), 70)
                  || ' → ' || left(coalesce(v_ride.dropoff_address, ''), 70);
        payload := payload || jsonb_build_object(
          'body', v_body,
          'ring', jsonb_build_object(
            'kind', 'request',
            'ride_id', v_ride_id,
            'category', v_ride.requested_category::text,
            'distance_m', case when v_dist is null then null else round(v_dist)::int end,
            'booking', v_ride.scheduled_at is not null
          )
        );
      end if;
    end if;
  end if;

  perform net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc
    ),
    body := payload
  );
end;
$fn$;
revoke execute on function public._push_notify(uuid, text, text, text, text, boolean) from public, anon, authenticated;

-- Message de FIN d'alerte (remplace la notification de la demande, coupe la sonnerie native).
create or replace function public._push_notify_ring_end(
  p_profile_id uuid,
  p_title text,
  p_body text,
  p_tag text,
  p_ring jsonb
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
      'title', p_title,
      'body', coalesce(p_body, ''),
      'url', '/',
      'tag', p_tag,
      'requireInteraction', false,
      'ring', p_ring
    )
  );
end;
$fn$;
revoke execute on function public._push_notify_ring_end(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Une demande quitte le pool : fin d'alerte + diffusion temps réel
-- ------------------------------------------------------------

-- Diffusion publique (identifiant de course + raison, rien de sensible) vers les deux écouteurs de l'app chauffeur :
-- « driver-pool » (écran d'accueil) et « watcher-pool » (veilleur global). Un canal par composant (freshChannel).
create or replace function public._broadcast_ride_gone(p_ride_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  t text;
begin
  foreach t in array array['driver-pool', 'watcher-pool'] loop
    begin
      perform realtime.send(
        jsonb_build_object('ride_id', p_ride_id, 'reason', p_reason),
        'ride_gone', t, false
      );
    exception when others then null;
    end;
  end loop;
end;
$fn$;
revoke execute on function public._broadcast_ride_gone(uuid, text) from public, anon, authenticated;

create or replace function public._ride_alert_gone()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_reason text;
  v_title text;
  v_body text;
  v_radius int;
  v_tag text := 'new-ride:' || old.id::text;
  v_acceptor uuid;
  drv record;
begin
  -- Réservation programmée annulée / prise : l'écran des chauffeurs la retire, pas de push.
  if old.status = 'scheduled' then
    if new.status = 'scheduled' and new.driver_id is null then return new; end if;
    perform public._broadcast_ride_gone(old.id, case when new.driver_id is not null then 'taken' else 'cancelled' end);
    return new;
  end if;

  -- Demande immédiate : raison de la sortie du pool.
  if new.driver_id is not null then
    v_reason := 'taken';
  elsif new.status::text like 'cancelled%' then
    v_reason := 'cancelled';
  elsif new.status = 'expired' then
    v_reason := 'expired';
  elsif new.status = 'requested' and new.requested_category is distinct from old.requested_category then
    v_reason := 'changed';
  else
    return new;
  end if;

  -- 1) Diffusion temps réel : tous les écrans chauffeur ouverts retirent la demande et coupent le son.
  perform public._broadcast_ride_gone(old.id, v_reason);

  v_title := case v_reason
    when 'cancelled' then 'Course annulée'
    when 'taken'     then 'Course déjà prise'
    when 'expired'   then 'Demande expirée'
    else 'Demande modifiée'
  end;
  v_body := case v_reason
    when 'cancelled' then 'Le client a annulé la demande.'
    when 'taken'     then 'Un autre chauffeur a accepté cette demande.'
    when 'expired'   then 'Plus de réponse : la demande est close.'
    else 'Le client a changé de catégorie.'
  end;

  -- 2) Fin d'alerte système (push) pour les chauffeurs qui ont pu être alertés.
  if new.driver_id is not null then
    select d.profile_id into v_acceptor from public.drivers d where d.id = new.driver_id;
  end if;

  if old.requested_driver_id is not null then
    -- Course directe : seul le chauffeur visé a été alerté.
    for drv in
      select d.profile_id from public.drivers d where d.id = old.requested_driver_id
    loop
      perform public._push_notify_ring_end(
        drv.profile_id,
        case when drv.profile_id = v_acceptor then 'Course acceptée' else v_title end,
        case when drv.profile_id = v_acceptor then '' else v_body end,
        v_tag,
        jsonb_build_object('kind', 'end', 'ride_id', old.id, 'reason',
                           case when drv.profile_id = v_acceptor then 'mine' else v_reason end)
      );
    end loop;
    return new;
  end if;

  v_radius := coalesce(nullif(old.notified_radius_m, 0), 15000);
  for drv in
    select d.profile_id
      from public.drivers d
      join public.vehicles v on v.id = d.current_vehicle_id
     where d.is_online = true
       and d.status = 'active'
       and v.category = old.requested_category
       and (d.current_location is null
            or st_dwithin(d.current_location, old.pickup_location, v_radius))
  loop
    perform public._push_notify_ring_end(
      drv.profile_id,
      case when drv.profile_id = v_acceptor then 'Course acceptée' else v_title end,
      case when drv.profile_id = v_acceptor then '' else v_body end,
      v_tag,
      jsonb_build_object('kind', 'end', 'ride_id', old.id, 'reason',
                         case when drv.profile_id = v_acceptor then 'mine' else v_reason end)
    );
  end loop;

  return new;
end;
$fn$;
revoke execute on function public._ride_alert_gone() from public, anon, authenticated;

drop trigger if exists trg_ride_alert_gone on public.rides;
create trigger trg_ride_alert_gone
  after update of status, driver_id, requested_category on public.rides
  for each row
  when (old.status in ('requested', 'scheduled') and old.driver_id is null)
  execute function public._ride_alert_gone();
