-- ============================================================
-- Chat : médias éphémères (photo / note vocale 30 s / vidéo 5 s)
-- Décision Terence 2026-07-27 : expiration 5 minutes après l'envoi
-- (temps, pas vue unique). Après 5 min, le média est inaccessible.
-- ============================================================

-- 1. Colonnes média sur ride_messages + content devient optionnel
alter table public.ride_messages
  add column if not exists kind text not null default 'text',
  add column if not exists media_path text,
  add column if not exists media_duration_s int;

alter table public.ride_messages drop constraint if exists ride_messages_content_check;
alter table public.ride_messages alter column content drop not null;

do $$ begin
  alter table public.ride_messages
    add constraint ride_messages_kind_check check (kind in ('text', 'photo', 'audio', 'video'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.ride_messages
    add constraint ride_messages_content_or_media check (
      (kind = 'text'  and content is not null and length(trim(content)) between 1 and 500)
      or (kind <> 'text' and media_path is not null)
    );
exception when duplicate_object then null; end $$;

-- 2. Bucket privé pour les médias de chat
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ride-media', 'ride-media', false, 20971520, -- 20 Mo (vidéo 5 s reste petite)
  array['image/jpeg', 'image/png', 'image/webp',
        'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg',
        'video/webm', 'video/mp4']
)
on conflict (id) do update
  set public = false, file_size_limit = 20971520,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp',
        'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg',
        'video/webm', 'video/mp4'];

-- 3. RLS Storage — chemin : <ride_id>/<uuid>.<ext>
-- Upload : un participant d'une course ACTIVE peut téléverser dans son dossier.
do $$ begin
  create policy ride_media_upload on storage.objects
    for insert with check (
      bucket_id = 'ride-media'
      and exists (
        select 1 from public.rides r
        left join public.drivers d on d.id = r.driver_id
        where r.id::text = split_part(name, '/', 1)
          and r.status in ('matched', 'arrived', 'in_progress')
          and (r.client_id = auth.uid() or d.profile_id = auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

-- Lecture : participant + message rattaché de MOINS de 5 minutes (éphémère).
do $$ begin
  create policy ride_media_read on storage.objects
    for select using (
      bucket_id = 'ride-media'
      and exists (
        select 1 from public.ride_messages m
        join public.rides r on r.id = m.ride_id
        left join public.drivers d on d.id = r.driver_id
        where m.media_path = name
          and m.created_at > now() - interval '5 minutes'
          and (r.client_id = auth.uid() or d.profile_id = auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

-- 4. RPC : envoyer un message média (mêmes gardes que send_ride_message)
create or replace function public.send_ride_media(
  p_ride_id uuid,
  p_kind text,
  p_media_path text,
  p_duration_s int default null
)
returns public.ride_messages
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  v_driver_profile uuid;
  new_msg public.ride_messages;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_kind not in ('photo', 'audio', 'video') then raise exception 'Type média invalide'; end if;
  if p_media_path is null or length(trim(p_media_path)) = 0 then raise exception 'Média manquant'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Course introuvable'; end if;
  if r.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Course terminée — chat fermé';
  end if;

  if r.driver_id is not null then
    select profile_id into v_driver_profile from public.drivers where id = r.driver_id;
  end if;
  if r.client_id <> auth.uid()
     and coalesce(v_driver_profile, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid() then
    raise exception 'Not your ride';
  end if;

  insert into public.ride_messages (ride_id, sender_id, kind, media_path, media_duration_s, content)
    values (p_ride_id, auth.uid(), p_kind, p_media_path, p_duration_s, null)
    returning * into new_msg;
  return new_msg;
end;
$$;

grant execute on function public.send_ride_media(uuid, text, text, int) to authenticated;

-- 5. ride_messages_history enrichi (kind + media_path + durée)
create or replace function public.ride_messages_history(p_ride_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_full_name text,
  content text,
  kind text,
  media_path text,
  media_duration_s int,
  created_at timestamptz,
  read_at timestamptz
)
language sql stable security definer set search_path = public as $fnh$
  select m.id, m.sender_id, p.full_name as sender_full_name,
    m.content, m.kind, m.media_path, m.media_duration_s, m.created_at, m.read_at
  from public.ride_messages m
  left join public.profiles p on p.id = m.sender_id
  where m.ride_id = p_ride_id
    and exists (
      select 1 from public.rides r
      left join public.drivers d on d.id = r.driver_id
      where r.id = m.ride_id
        and (r.client_id = auth.uid() or d.profile_id = auth.uid())
    )
  order by m.created_at asc;
$fnh$;

grant execute on function public.ride_messages_history to authenticated;
