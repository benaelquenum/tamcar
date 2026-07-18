-- ============================================================
-- Pack fonctionnalités 2026-07-18 :
--   • P2 driver_return_change : le chauffeur transfère de la monnaie vers le wallet client
--   • P3 driver_stats : agrégat courses/gains sur période
--   • P5 sos_alerts : alerte SOS avec position
--   • P6 activation scheduled rides (colonne existe déjà)
--   • P7 arrival_photo_url sur rides
--   • P8 referral_codes + redeem_referral_code
-- ============================================================

-- Nouveaux types wallet_tx_type
alter type wallet_tx_type add value if not exists 'change_return_out';
alter type wallet_tx_type add value if not exists 'change_return_in';
alter type wallet_tx_type add value if not exists 'referral_bonus';

-- ============================================================
-- P2 : driver_return_change(ride_id, amount_fcfa)
-- ============================================================
create or replace function public.driver_return_change(
  p_ride_id uuid,
  p_amount_fcfa int
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  driver_profile_id uuid;
  driver_wallet_id uuid;
  client_wallet_id uuid;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_amount_fcfa <= 0 then raise exception 'Montant invalide'; end if;

  select * into r from public.rides where id = p_ride_id;
  if r is null then raise exception 'Ride introuvable'; end if;
  if r.driver_id is null then raise exception 'Aucun chauffeur sur cette course'; end if;

  select profile_id into driver_profile_id
    from public.drivers where id = r.driver_id;
  if driver_profile_id <> auth.uid() then raise exception 'Not your ride'; end if;

  if r.status <> 'completed' then
    raise exception 'La course doit être terminée pour rendre la monnaie';
  end if;
  if r.ended_at is null or now() > r.ended_at + interval '24 hours' then
    raise exception 'Fenêtre de 24 h dépassée';
  end if;
  if p_amount_fcfa > r.price_total_fcfa then
    raise exception 'Montant supérieur au prix de la course';
  end if;

  -- Débit wallet chauffeur (revenus)
  insert into public.wallets (profile_id, kind, balance_fcfa)
    values (driver_profile_id, 'tamcar_revenus', 0)
    on conflict (profile_id, kind) do nothing;
  select id into driver_wallet_id
    from public.wallets
    where profile_id = driver_profile_id and kind = 'tamcar_revenus';

  update public.wallets
    set balance_fcfa = balance_fcfa - p_amount_fcfa,
        updated_at = now()
    where id = driver_wallet_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
    values (driver_wallet_id, 'change_return_out', p_amount_fcfa, p_ride_id, 'success');

  -- Crédit wallet client (tamcar_credit)
  insert into public.wallets (profile_id, kind, balance_fcfa)
    values (r.client_id, 'tamcar_credit', 0)
    on conflict (profile_id, kind) do nothing;
  select id into client_wallet_id
    from public.wallets
    where profile_id = r.client_id and kind = 'tamcar_credit';

  update public.wallets
    set balance_fcfa = balance_fcfa + p_amount_fcfa,
        updated_at = now()
    where id = client_wallet_id;

  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status)
    values (client_wallet_id, 'change_return_in', p_amount_fcfa, p_ride_id, 'success');

  return jsonb_build_object(
    'amount_fcfa', p_amount_fcfa,
    'ride_id', p_ride_id,
    'driver_wallet_id', driver_wallet_id,
    'client_wallet_id', client_wallet_id
  );
end;
$$;

comment on function public.driver_return_change is
  'Le chauffeur transfère de la monnaie vers le wallet client (P2). Débit tamcar_revenus chauffeur + crédit tamcar_credit client, 2 wallet_transactions liées à ride_id.';

grant execute on function public.driver_return_change(uuid, int) to authenticated;

-- ============================================================
-- P3 : driver_stats(period_days)
-- ============================================================
create or replace function public.driver_stats(period_days int default 7)
returns table (
  rides_completed int,
  rides_cancelled int,
  total_earned_cash_fcfa bigint,
  total_earned_rachat_fcfa bigint,
  avg_rating numeric,
  ratings_count int,
  period_start timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  driver_row public.drivers;
  p_start timestamptz := now() - make_interval(days => period_days);
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  select * into driver_row from public.drivers where profile_id = auth.uid();
  if driver_row is null then raise exception 'Not a driver'; end if;

  return query
  select
    (select count(*)::int from public.rides
      where driver_id = driver_row.id and status = 'completed'
        and ended_at >= p_start) as rides_completed,
    (select count(*)::int from public.rides
      where driver_id = driver_row.id and status = 'cancelled_by_client'
        and updated_at >= p_start) as rides_cancelled,
    (select coalesce(sum(driver_share_fcfa), 0)::bigint from public.rides
      where driver_id = driver_row.id and status = 'completed'
        and ended_at >= p_start) as total_earned_cash_fcfa,
    (select coalesce(sum(driver_rachat_fcfa), 0)::bigint from public.rides
      where driver_id = driver_row.id and status = 'completed'
        and ended_at >= p_start) as total_earned_rachat_fcfa,
    driver_row.rating_avg as avg_rating,
    driver_row.rating_count as ratings_count,
    p_start as period_start;
end;
$$;

grant execute on function public.driver_stats(int) to authenticated;

-- ============================================================
-- P5 : sos_alerts
-- ============================================================
create table if not exists public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid references public.rides(id) on delete set null,
  triggered_by uuid not null references public.profiles(id),
  role text not null check (role in ('client','driver')),
  lat double precision not null,
  lng double precision not null,
  reason text,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists sos_alerts_created_idx on public.sos_alerts(created_at desc);

alter table public.sos_alerts enable row level security;

drop policy if exists sos_alerts_read_own on public.sos_alerts;
create policy sos_alerts_read_own on public.sos_alerts for select
  using (triggered_by = auth.uid() or public.is_admin());

create or replace function public.send_sos_alert(
  p_ride_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_reason text default null
)
returns public.sos_alerts
language plpgsql security definer set search_path = public as $$
declare
  r public.rides;
  role_kind text;
  result public.sos_alerts;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;

  if p_ride_id is not null then
    select * into r from public.rides where id = p_ride_id;
    if r is null then raise exception 'Ride not found'; end if;
    if r.client_id = auth.uid() then
      role_kind := 'client';
    elsif r.driver_id is not null and exists (
      select 1 from public.drivers where id = r.driver_id and profile_id = auth.uid()
    ) then
      role_kind := 'driver';
    else
      raise exception 'Not authorized';
    end if;
  else
    role_kind := 'client';
  end if;

  insert into public.sos_alerts (ride_id, triggered_by, role, lat, lng, reason)
    values (p_ride_id, auth.uid(), role_kind, p_lat, p_lng, p_reason)
    returning * into result;

  return result;
end;
$$;

grant execute on function public.send_sos_alert(uuid, double precision, double precision, text) to authenticated;

-- ============================================================
-- P7 : arrival_photo_url sur rides
-- ============================================================
alter table public.rides
  add column if not exists arrival_photo_url text;

-- Bucket dédié (photos arrivée chauffeur, publiques en lecture)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ride-arrival-photos', 'ride-arrival-photos', true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ride_arrival_photos_read" on storage.objects;
drop policy if exists "ride_arrival_photos_driver_insert" on storage.objects;

create policy "ride_arrival_photos_read"
on storage.objects for select
using (bucket_id = 'ride-arrival-photos');

-- Le driver assigné à la ride peut uploader (fichier {ride_id}.{ext})
create policy "ride_arrival_photos_driver_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'ride-arrival-photos'
  and exists (
    select 1 from public.rides r
    join public.drivers d on d.id = r.driver_id
    where r.id::text = split_part(name, '.', 1)
      and d.profile_id = auth.uid()
  )
);

-- ============================================================
-- P8 : referral_codes + redeem_referral_code
-- ============================================================
create table if not exists public.referral_codes (
  code text primary key check (length(code) between 6 and 12),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  reward_fcfa int not null default 500,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.referral_codes(code) on delete cascade,
  redeemed_by uuid not null references public.profiles(id) on delete cascade,
  reward_fcfa int not null,
  created_at timestamptz not null default now(),
  unique (redeemed_by)  -- 1 seul parrainage utilisé par client
);

alter table public.referral_codes enable row level security;
alter table public.referral_redemptions enable row level security;

drop policy if exists referral_codes_read_own on public.referral_codes;
create policy referral_codes_read_own on public.referral_codes for select
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists referral_redemptions_read_own on public.referral_redemptions;
create policy referral_redemptions_read_own on public.referral_redemptions for select
  using (
    redeemed_by = auth.uid()
    or exists (select 1 from public.referral_codes rc where rc.code = referral_redemptions.code and rc.owner_id = auth.uid())
    or public.is_admin()
  );

create or replace function public.get_or_create_my_referral_code()
returns public.referral_codes
language plpgsql security definer set search_path = public as $$
declare
  result public.referral_codes;
  gen text;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  select * into result from public.referral_codes where owner_id = auth.uid();
  if result is not null then return result; end if;

  -- Génération : 6 caractères base32 (majuscules + chiffres, sans 0/O/1/I)
  loop
    gen := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    gen := translate(gen, '01O', 'ABC');
    exit when not exists (select 1 from public.referral_codes where code = gen);
  end loop;

  insert into public.referral_codes (code, owner_id, reward_fcfa)
    values (gen, auth.uid(), 500)
    returning * into result;
  return result;
end;
$$;

grant execute on function public.get_or_create_my_referral_code() to authenticated;

create or replace function public.redeem_referral_code(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rc public.referral_codes;
  reward int;
  owner_wallet_id uuid;
  new_wallet_id uuid;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  if p_code is null or length(trim(p_code)) < 6 then raise exception 'Code invalide'; end if;

  select * into rc from public.referral_codes where code = upper(trim(p_code));
  if rc is null then raise exception 'Code introuvable'; end if;
  if rc.owner_id = auth.uid() then raise exception 'Tu ne peux pas utiliser ton propre code'; end if;

  if exists (select 1 from public.referral_redemptions where redeemed_by = auth.uid()) then
    raise exception 'Tu as déjà utilisé un code parrainage';
  end if;

  reward := rc.reward_fcfa;

  insert into public.referral_redemptions (code, redeemed_by, reward_fcfa)
    values (rc.code, auth.uid(), reward);

  -- Bonus au parrainé
  insert into public.wallets (profile_id, kind, balance_fcfa)
    values (auth.uid(), 'tamcar_credit', 0)
    on conflict (profile_id, kind) do nothing;
  select id into new_wallet_id
    from public.wallets where profile_id = auth.uid() and kind = 'tamcar_credit';
  update public.wallets set balance_fcfa = balance_fcfa + reward, updated_at = now()
    where id = new_wallet_id;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, status)
    values (new_wallet_id, 'referral_bonus', reward, 'success');

  -- Bonus au parrain
  insert into public.wallets (profile_id, kind, balance_fcfa)
    values (rc.owner_id, 'tamcar_credit', 0)
    on conflict (profile_id, kind) do nothing;
  select id into owner_wallet_id
    from public.wallets where profile_id = rc.owner_id and kind = 'tamcar_credit';
  update public.wallets set balance_fcfa = balance_fcfa + reward, updated_at = now()
    where id = owner_wallet_id;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, status)
    values (owner_wallet_id, 'referral_bonus', reward, 'success');

  return jsonb_build_object(
    'code', rc.code,
    'reward_fcfa', reward,
    'owner_credited', true
  );
end;
$$;

grant execute on function public.redeem_referral_code(text) to authenticated;

-- ============================================================
-- P1 : push_subscriptions (préparation pour Notifications Web)
-- Les VAPID keys + service worker viennent côté frontend / config.
-- ============================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (profile_id, endpoint)
);
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns public.push_subscriptions
language plpgsql security definer set search_path = public as $$
declare
  result public.push_subscriptions;
begin
  if auth.uid() is null then raise exception 'Auth required'; end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
    on conflict (profile_id, endpoint) do update
      set p256dh = excluded.p256dh,
          auth = excluded.auth,
          user_agent = excluded.user_agent
    returning * into result;
  return result;
end;
$$;

grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
