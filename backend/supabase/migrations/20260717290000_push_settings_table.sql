-- ============================================================
-- Contournement : Supabase ne permet plus ALTER DATABASE ... SET
-- depuis le SQL Editor. On stocke les settings dans une table
-- privée _push_settings, lue par _push_notify.
-- ============================================================

create table if not exists public._push_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public._push_settings enable row level security;
-- Aucune policy → seule la fonction security definer y accède.

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
