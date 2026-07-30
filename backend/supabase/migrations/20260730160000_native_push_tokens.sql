-- ============================================================
-- TamCar — Tokens push natifs FCM (2026-07-30)
--
--   Le Web Push ne fonctionne pas dans la WebView Capacitor : les apps
--   natives s'enregistrent auprès de FCM (Firebase Cloud Messaging) et
--   sauvegardent leur token ici. L'edge function send-push envoie alors
--   sur les DEUX canaux : Web Push (navigateur/PWA) + FCM (APK natif),
--   y compris app tuée.
-- ============================================================

create table if not exists public.native_push_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);

create index if not exists native_push_tokens_profile_idx
  on public.native_push_tokens (profile_id);

alter table public.native_push_tokens enable row level security;
-- Aucune policy : lecture par service_role (edge function), écriture via RPC.

create or replace function public.save_native_push_token(
  p_token text,
  p_platform text default 'android'
)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_token is null or length(trim(p_token)) < 10 then
    raise exception 'Token invalide';
  end if;
  insert into public.native_push_tokens (token, profile_id, platform, updated_at)
  values (trim(p_token), auth.uid(), coalesce(p_platform, 'android'), now())
  on conflict (token) do update
    set profile_id = excluded.profile_id,
        platform = excluded.platform,
        updated_at = now();
end;
$fn$;

revoke execute on function public.save_native_push_token(text, text) from public, anon;
grant execute on function public.save_native_push_token(text, text) to authenticated;
