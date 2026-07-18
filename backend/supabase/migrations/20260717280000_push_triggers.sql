-- ============================================================
-- Triggers push : notifient client / chauffeur sur les transitions clés.
-- Utilise pg_net pour appeler l'Edge Function send-push.
--
-- Secrets DB requis (à setter via Supabase Dashboard → Database → Settings) :
--   app.settings.supabase_url         = https://<ref>.supabase.co
--   app.settings.send_push_url        = https://<ref>.supabase.co/functions/v1/send-push
--   app.settings.supabase_service_key = <service_role_key>
--
-- Ou définis-les via ALTER DATABASE (voir bas du fichier).
-- ============================================================

create extension if not exists pg_net;

create or replace function public._push_notify(
  p_profile_id uuid,
  p_title text,
  p_body text,
  p_url text default '/',
  p_tag text default null,
  p_require_interaction boolean default false
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  url text;
  svc text;
  payload jsonb;
begin
  begin
    url := current_setting('app.settings.send_push_url', true);
    svc := current_setting('app.settings.supabase_service_key', true);
  exception when others then
    return;
  end;
  if url is null or svc is null or url = '' or svc = '' then return; end if;

  payload := jsonb_build_object(
    'profile_id', p_profile_id,
    'title', p_title,
    'body', p_body,
    'url', coalesce(p_url, '/'),
    'tag', p_tag,
    'requireInteraction', p_require_interaction
  );

  perform net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc
    ),
    body := payload
  );
end;
$$;

-- ------------------------------------------------------------
-- Trigger 1 : ride status transitions (matched, arrived, in_progress, completed, cancelled_*)
-- ------------------------------------------------------------
create or replace function public._on_ride_status_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  driver_profile_id uuid;
begin
  if TG_OP <> 'UPDATE' then return NEW; end if;
  if OLD.status = NEW.status then return NEW; end if;

  if NEW.driver_id is not null then
    select profile_id into driver_profile_id
      from public.drivers where id = NEW.driver_id;
  end if;

  -- matched → client
  if NEW.status = 'matched' then
    perform public._push_notify(
      NEW.client_id,
      'Chauffeur trouvé !',
      'Ton chauffeur TamCar est en route.',
      '/ride/' || NEW.id::text,
      'ride:' || NEW.id::text,
      false
    );
  -- arrived → client (persistent — le client doit sortir)
  elsif NEW.status = 'arrived' then
    perform public._push_notify(
      NEW.client_id,
      'Ton chauffeur est arrivé',
      'Rejoins-le au point de départ.',
      '/ride/' || NEW.id::text,
      'ride:' || NEW.id::text,
      true
    );
  -- in_progress → client
  elsif NEW.status = 'in_progress' then
    perform public._push_notify(
      NEW.client_id,
      'Course démarrée',
      'Bon voyage avec TamCar !',
      '/ride/' || NEW.id::text,
      'ride:' || NEW.id::text,
      false
    );
  -- completed → client
  elsif NEW.status = 'completed' then
    perform public._push_notify(
      NEW.client_id,
      'Course terminée',
      'Merci ! Note ton chauffeur.',
      '/ride/' || NEW.id::text,
      'ride:' || NEW.id::text,
      false
    );
    if driver_profile_id is not null then
      perform public._push_notify(
        driver_profile_id,
        'Course terminée',
        'Ta part cash + rachat est créditée sur ton wallet.',
        '/ride/' || NEW.id::text,
        'ride:' || NEW.id::text,
        false
      );
    end if;
  -- cancelled_by_client → chauffeur
  elsif NEW.status = 'cancelled_by_client' then
    if driver_profile_id is not null then
      perform public._push_notify(
        driver_profile_id,
        'Course annulée',
        'Le client a annulé. Retour au pool de courses.',
        '/',
        'ride:' || NEW.id::text,
        true
      );
    end if;
  -- cancelled_by_driver → client
  elsif NEW.status = 'cancelled_by_driver' then
    perform public._push_notify(
      NEW.client_id,
      'Chauffeur indisponible',
      'Le chauffeur a annulé. On te trouve un autre TamCar.',
      '/ride/' || NEW.id::text,
      'ride:' || NEW.id::text,
      true
    );
  end if;

  -- completion_requested (client demande fin) → chauffeur
  if NEW.completion_requested_at is not null and
     (OLD.completion_requested_at is null or OLD.completion_requested_at <> NEW.completion_requested_at)
  then
    if driver_profile_id is not null then
      perform public._push_notify(
        driver_profile_id,
        'Fin de course demandée',
        'Le client demande de finaliser. Auto-accept dans 20 s.',
        '/ride/' || NEW.id::text,
        'ride:' || NEW.id::text,
        true
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_ride_status_change on public.rides;
create trigger trg_ride_status_change
  after update on public.rides
  for each row
  execute function public._on_ride_status_change();

-- ------------------------------------------------------------
-- Trigger 2 : ride_stops (client modifie itinéraire) → chauffeur
-- ------------------------------------------------------------
create or replace function public._on_ride_stops_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ride_row public.rides;
  driver_profile_id uuid;
  msg text;
begin
  select * into ride_row from public.rides where id =
    case when TG_OP = 'DELETE' then OLD.ride_id else NEW.ride_id end;
  if ride_row is null or ride_row.driver_id is null then return coalesce(NEW, OLD); end if;
  select profile_id into driver_profile_id
    from public.drivers where id = ride_row.driver_id;
  if driver_profile_id is null then return coalesce(NEW, OLD); end if;

  if TG_OP = 'INSERT' then
    msg := 'Le client a ajouté un arrêt.';
  elsif TG_OP = 'UPDATE' and (
    OLD.order_idx is distinct from NEW.order_idx or
    OLD.address is distinct from NEW.address or
    OLD.status is distinct from NEW.status
  ) then
    msg := 'Le client a modifié l''itinéraire.';
  else
    return coalesce(NEW, OLD);
  end if;

  perform public._push_notify(
    driver_profile_id,
    'Itinéraire modifié',
    msg,
    '/ride/' || ride_row.id::text,
    'ride:' || ride_row.id::text,
    false
  );
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_ride_stops_change on public.ride_stops;
create trigger trg_ride_stops_change
  after insert or update on public.ride_stops
  for each row
  execute function public._on_ride_stops_change();

-- ------------------------------------------------------------
-- Notes de config (à faire côté Supabase Dashboard) :
--   ALTER DATABASE postgres SET app.settings.send_push_url =
--     'https://<ref>.supabase.co/functions/v1/send-push';
--   ALTER DATABASE postgres SET app.settings.supabase_service_key =
--     '<service_role_key_jwt>';
-- Après ALTER DATABASE, un simple new connection recharge les settings.
-- ------------------------------------------------------------
