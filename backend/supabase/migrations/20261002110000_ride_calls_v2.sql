-- ============================================================
-- TamCar — Appel audio dans l'application, version 2 (2026-10-02)
--
-- Appel pair-à-pair (WebRTC) entre le client et le chauffeur d'une course
-- active, sans échange de numéro. Remplace la migration du 24 juillet
-- (20260724009000_ride_calls.sql), qui n'a jamais été appliquée en production :
-- CE FICHIER SUFFIT, il crée tout (idempotent, on peut le rejouer).
--
-- Ce qui change par rapport à la v1 :
--   • les écritures dans ride_calls ne passent QUE par les fonctions ci-dessous ;
--   • un double clic sur « Appeler » ne crée pas deux appels ;
--   • une sonnerie sans réponse devient « manqué » toute seule après 60 s, un
--     appel resté ouvert plus de 3 h est clos (téléphone éteint en cours d'appel) ;
--   • la signalisation reste éphémère (Realtime Broadcast), seul le cycle de vie
--     de l'appel est en base — l'application suit aussi ce cycle de vie pour
--     raccrocher si un message de signalisation se perd.
-- ============================================================

create table if not exists public.ride_calls (
  id          uuid primary key default gen_random_uuid(),
  ride_id     uuid not null references public.rides(id) on delete cascade,
  caller_id   uuid not null references public.profiles(id) on delete cascade,
  callee_id   uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'ringing'
              check (status in ('ringing', 'active', 'ended', 'missed', 'declined')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  ended_at    timestamptz
);

create index if not exists ride_calls_ride_idx   on public.ride_calls (ride_id, created_at desc);
create index if not exists ride_calls_callee_idx on public.ride_calls (callee_id, status);
create index if not exists ride_calls_open_idx   on public.ride_calls (status, created_at)
  where status in ('ringing', 'active');

alter table public.ride_calls enable row level security;

-- Les deux participants (et l'admin) lisent ; le callee reçoit l'INSERT en temps
-- réel = sonnerie d'appel entrant.
drop policy if exists ride_calls_select on public.ride_calls;
create policy ride_calls_select on public.ride_calls for select
  using (caller_id = auth.uid() or callee_id = auth.uid() or public.is_admin());

-- Aucune écriture directe : tout passe par les fonctions SECURITY DEFINER.
revoke all on public.ride_calls from anon;
revoke insert, update, delete, truncate on public.ride_calls from authenticated;

-- ------------------------------------------------------------
-- start_ride_call : démarre un appel vers l'autre partie de la course.
-- ------------------------------------------------------------
create or replace function public.start_ride_call(p_ride_id uuid)
returns public.ride_calls
language plpgsql security definer set search_path = public as $fn_start$
declare
  v_ride  public.rides;
  v_callee uuid;
  v_name  text;
  v_call  public.ride_calls;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if not found then raise exception 'Course introuvable'; end if;
  if v_ride.status not in ('matched', 'arrived', 'in_progress') then
    raise exception 'Appel possible uniquement pendant une course active';
  end if;

  -- L'autre partie de la course.
  if v_ride.client_id = auth.uid() then
    select d.profile_id into v_callee from public.drivers d where d.id = v_ride.driver_id;
  elsif exists (select 1 from public.drivers d where d.id = v_ride.driver_id and d.profile_id = auth.uid()) then
    v_callee := v_ride.client_id;
  else
    raise exception 'Non autorisé sur cette course';
  end if;
  if v_callee is null then raise exception 'Interlocuteur indisponible'; end if;

  -- Double clic : un appel en sonnerie lancé il y a moins de 10 s est renvoyé tel quel.
  select * into v_call
    from public.ride_calls
   where ride_id = p_ride_id and caller_id = auth.uid()
     and status = 'ringing' and created_at > now() - interval '10 seconds'
   order by created_at desc limit 1;
  if found then return v_call; end if;

  -- Un seul appel ouvert par course.
  update public.ride_calls
     set status = 'ended', ended_at = now()
   where ride_id = p_ride_id and status in ('ringing', 'active');

  insert into public.ride_calls (ride_id, caller_id, callee_id)
  values (p_ride_id, auth.uid(), v_callee)
  returning * into v_call;

  select split_part(coalesce(full_name, ''), ' ', 1) into v_name
    from public.profiles where id = auth.uid();

  perform public._push_notify(
    v_callee,
    'Appel TamCar',
    coalesce(nullif(v_name, ''), 'Votre interlocuteur') || ' vous appelle. Ouvrez TamCar pour répondre.',
    '/ride/' || p_ride_id::text,
    'call:' || v_call.id::text,
    true
  );

  return v_call;
end;
$fn_start$;

grant execute on function public.start_ride_call(uuid) to authenticated;

-- ------------------------------------------------------------
-- answer_ride_call : le destinataire décroche.
-- ------------------------------------------------------------
create or replace function public.answer_ride_call(p_call_id uuid)
returns public.ride_calls
language plpgsql security definer set search_path = public as $fn_answer$
declare
  v_call public.ride_calls;
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
-- end_ride_call : raccrocher, refuser ou marquer comme manqué.
-- ------------------------------------------------------------
create or replace function public.end_ride_call(p_call_id uuid, p_status text default 'ended')
returns public.ride_calls
language plpgsql security definer set search_path = public as $fn_end$
declare
  v_call public.ride_calls;
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
-- my_incoming_call : appel entrant en attente (sonnerie à la réouverture de
-- l'application par la notification).
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

grant execute on function public.my_incoming_call(uuid) to authenticated;

-- ------------------------------------------------------------
-- Nettoyage : sonnerie sans réponse → manqué (60 s) ; appel resté ouvert
-- plus de 3 h → clos.
-- ------------------------------------------------------------
create or replace function public._expire_stale_calls()
returns int
language plpgsql security definer set search_path = public as $fn_exp$
declare
  n int;
begin
  update public.ride_calls
     set status = 'missed', ended_at = now()
   where status = 'ringing' and created_at < now() - interval '60 seconds';
  get diagnostics n = row_count;

  update public.ride_calls
     set status = 'ended', ended_at = now()
   where status = 'active' and answered_at < now() - interval '3 hours';

  return n;
end;
$fn_exp$;

revoke all on function public._expire_stale_calls() from public, anon, authenticated;

select cron.schedule(
  'expire-stale-calls',
  '* * * * *',
  $$select public._expire_stale_calls()$$
);

-- ------------------------------------------------------------
-- Temps réel : le destinataire reçoit l'INSERT (sonnerie), les deux parties
-- reçoivent l'UPDATE (raccroché, refusé, manqué). Sans erreur si déjà ajouté.
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
