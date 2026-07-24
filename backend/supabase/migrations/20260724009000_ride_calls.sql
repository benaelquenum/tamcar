-- ============================================================
-- TamCar — Appel intégré (WebRTC) entre client et chauffeur (2026-07-24)
--
--   Table de cycle de vie de l'appel + RPC start/answer/end.
--   La signalisation WebRTC (SDP/ICE) passe par Supabase Realtime
--   Broadcast sur le canal `call:<call_id>` (éphémère, pas en base).
--
--   Anti-contournement : aucun numéro n'est échangé, l'appel est
--   pair-à-pair audio dans l'app. Réservé aux 2 participants d'une
--   course active (matched / arrived / in_progress).
-- ============================================================

create table if not exists public.ride_calls (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'ringing'
    check (status in ('ringing', 'active', 'ended', 'missed', 'declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);

create index if not exists ride_calls_ride_idx on public.ride_calls (ride_id, created_at desc);
create index if not exists ride_calls_callee_idx on public.ride_calls (callee_id, status);

alter table public.ride_calls enable row level security;

-- Les 2 participants de l'appel (et admin) peuvent lire ; réception
-- realtime des INSERT côté callee = sonnerie d'appel entrant.
drop policy if exists ride_calls_select on public.ride_calls;
create policy ride_calls_select on public.ride_calls for select
  using (caller_id = auth.uid() or callee_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- start_ride_call : démarre un appel vers l'autre partie de la course.
-- ------------------------------------------------------------
create or replace function public.start_ride_call(p_ride_id uuid)
returns public.ride_calls
language plpgsql security definer set search_path = public as $fn_start$
declare
  v_ride public.rides;
  v_callee uuid;
  v_caller_name text;
  v_call public.ride_calls;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if not found then raise exception 'Course introuvable'; end if;
  if v_ride.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Appel possible uniquement pendant une course active';
  end if;

  -- Détermine l'autre partie (le callee)
  if v_ride.client_id = auth.uid() then
    select d.profile_id into v_callee from public.drivers d where d.id = v_ride.driver_id;
  elsif exists (select 1 from public.drivers d where d.id = v_ride.driver_id and d.profile_id = auth.uid()) then
    v_callee := v_ride.client_id;
  else
    raise exception 'Non autorisé sur cette course';
  end if;
  if v_callee is null then raise exception 'Interlocuteur indisponible'; end if;

  -- Referme d'éventuels appels encore "ringing/active" sur cette course
  update public.ride_calls
     set status = 'ended', ended_at = now()
   where ride_id = p_ride_id and status in ('ringing', 'active');

  insert into public.ride_calls (ride_id, caller_id, callee_id)
  values (p_ride_id, auth.uid(), v_callee)
  returning * into v_call;

  select full_name into v_caller_name from public.profiles where id = auth.uid();

  perform public._push_notify(
    v_callee,
    '📞 Appel TamCar',
    coalesce(split_part(v_caller_name, ' ', 1), 'Ton interlocuteur') || ' t''appelle. Ouvre pour répondre.',
    '/ride/' || p_ride_id::text, 'call:' || v_call.id::text, true
  );

  return v_call;
end;
$fn_start$;
grant execute on function public.start_ride_call(uuid) to authenticated;

-- ------------------------------------------------------------
-- answer_ride_call : le callee décroche.
-- ------------------------------------------------------------
create or replace function public.answer_ride_call(p_call_id uuid)
returns public.ride_calls
language plpgsql security definer set search_path = public as $fn_answer$
declare v_call public.ride_calls;
begin
  update public.ride_calls
     set status = 'active', answered_at = now()
   where id = p_call_id and callee_id = auth.uid() and status = 'ringing'
   returning * into v_call;
  if not found then raise exception 'Appel introuvable ou déjà traité'; end if;
  return v_call;
end;
$fn_answer$;
grant execute on function public.answer_ride_call(uuid) to authenticated;

-- ------------------------------------------------------------
-- end_ride_call : raccrocher / refuser / marquer manqué.
-- ------------------------------------------------------------
create or replace function public.end_ride_call(p_call_id uuid, p_status text default 'ended')
returns public.ride_calls
language plpgsql security definer set search_path = public as $fn_end$
declare v_call public.ride_calls;
begin
  if p_status not in ('ended', 'missed', 'declined') then
    raise exception 'Statut de fin invalide';
  end if;
  update public.ride_calls
     set status = p_status, ended_at = now()
   where id = p_call_id
     and (caller_id = auth.uid() or callee_id = auth.uid())
     and status in ('ringing', 'active')
   returning * into v_call;
  if not found then raise exception 'Appel introuvable ou déjà clos'; end if;
  return v_call;
end;
$fn_end$;
grant execute on function public.end_ride_call(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- my_incoming_call : appel entrant en attente pour le user courant
-- (sonnerie si l'app est rouverte via la notif push).
-- ------------------------------------------------------------
create or replace function public.my_incoming_call(p_ride_id uuid)
returns table (call_id uuid, caller_id uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $fn_inc$
  select c.id, c.caller_id, c.created_at
  from public.ride_calls c
  where c.ride_id = p_ride_id
    and c.callee_id = auth.uid()
    and c.status = 'ringing'
    and c.created_at > now() - interval '60 seconds'
  order by c.created_at desc
  limit 1;
$fn_inc$;
grant execute on function public.my_incoming_call to authenticated;

-- ------------------------------------------------------------
-- Realtime : le callee reçoit l'INSERT (sonnerie). Safe si déjà ajouté.
-- ------------------------------------------------------------
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.ride_calls';
  exception
    when duplicate_object then null;
    when others then null;
  end;
end $$;
