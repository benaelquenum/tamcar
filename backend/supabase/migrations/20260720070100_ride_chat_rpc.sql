-- ============================================================
-- Chat ride : RPC send + mark_read + trigger push.
-- ============================================================

-- ------------------------------------------------------------
-- 1. send_ride_message : envoyer un message
--    - vérifie que l'user est client ou chauffeur de la course
--    - refuse si course terminée / annulée
--    - refuse contenu vide ou > 500 chars (contrainte table)
-- ------------------------------------------------------------
create or replace function public.send_ride_message(
  p_ride_id uuid,
  p_content text
)
returns public.ride_messages
language plpgsql security definer set search_path = public as $fnsm$
declare
  r public.rides;
  v_driver_profile uuid;
  new_msg public.ride_messages;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_content is null or length(trim(p_content)) = 0 then
    raise exception 'Message vide';
  end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Course introuvable'; end if;

  if r.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Course terminée — chat fermé';
  end if;

  -- Vérifier appartenance : client OU chauffeur assigné
  if r.driver_id is not null then
    select profile_id into v_driver_profile
      from public.drivers where id = r.driver_id;
  end if;

  if r.client_id <> auth.uid() and coalesce(v_driver_profile, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid() then
    raise exception 'Not your ride';
  end if;

  insert into public.ride_messages (ride_id, sender_id, content)
    values (p_ride_id, auth.uid(), trim(p_content))
    returning * into new_msg;

  return new_msg;
end;
$fnsm$;

grant execute on function public.send_ride_message to authenticated;

-- ------------------------------------------------------------
-- 2. mark_ride_messages_read : marque comme lus les messages
--    reçus par l'user (ceux dont sender_id <> auth.uid())
-- ------------------------------------------------------------
create or replace function public.mark_ride_messages_read(p_ride_id uuid)
returns int
language plpgsql security definer set search_path = public as $fnmr$
declare
  v_count int;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  update public.ride_messages
    set read_at = now()
    where ride_id = p_ride_id
      and sender_id <> auth.uid()
      and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$fnmr$;

grant execute on function public.mark_ride_messages_read to authenticated;

-- ------------------------------------------------------------
-- 3. Trigger : push notification à l'autre partie sur INSERT
-- ------------------------------------------------------------
create or replace function public._on_ride_message_created()
returns trigger
language plpgsql security definer set search_path = public as $fntm$
declare
  r public.rides;
  v_driver_profile uuid;
  v_recipient uuid;
  v_sender_name text;
  v_preview text;
begin
  select * into r from public.rides where id = new.ride_id;
  if r is null then return new; end if;

  if r.driver_id is not null then
    select profile_id into v_driver_profile
      from public.drivers where id = r.driver_id;
  end if;

  -- Le destinataire est celui qui n'a pas envoyé
  if new.sender_id = r.client_id then
    v_recipient := v_driver_profile;
  else
    v_recipient := r.client_id;
  end if;

  if v_recipient is null then return new; end if;

  select full_name into v_sender_name from public.profiles where id = new.sender_id;
  v_preview := left(new.content, 80);
  if length(new.content) > 80 then v_preview := v_preview || '…'; end if;

  perform public._push_notify(
    v_recipient,
    coalesce(v_sender_name, 'TamCar') || ' — message',
    v_preview,
    '/ride/' || new.ride_id::text,
    'msg:' || new.ride_id::text,
    false
  );

  return new;
end;
$fntm$;

drop trigger if exists trg_ride_message_push on public.ride_messages;
create trigger trg_ride_message_push
  after insert on public.ride_messages
  for each row
  execute function public._on_ride_message_created();

-- ------------------------------------------------------------
-- 4. RPC : messages d'une course (fetch initial)
-- ------------------------------------------------------------
create or replace function public.ride_messages_history(p_ride_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_full_name text,
  content text,
  created_at timestamptz,
  read_at timestamptz
)
language sql stable security definer set search_path = public as $fnh$
  select m.id, m.sender_id, p.full_name as sender_full_name,
    m.content, m.created_at, m.read_at
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
