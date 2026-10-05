-- Produits de senteur : 3 000 F par mois (36 000 F par an) prélevés sur le fonds de rachat des chauffeurs de voiture.
--
-- Décision de Terence (2026-10-05) : TamCar fournit aux chauffeurs des produits de senteur pour la bonne
-- présentation du véhicule et le bien-être des clients ; la dépense, 36 000 F par an et par véhicule, est
-- prélevée sur le fonds de rachat (portefeuille « tamcar_rachat »), donc sur ce que le propriétaire touche à la
-- cession — la proposition faite à Afric Group Consulting le dit.
--
--   - Qui : les chauffeurs actifs en formule Cession dont le véhicule est une voiture (Essentiel, Confort, VIP).
--     Motos et tricycles : 0 (réglable). Les propriétaires-chauffeurs n'ont pas de fonds.
--   - Quand : le dernier jour de chaque mois (23 h 40 à Porto-Novo), à partir du mois de démarrage du programme
--     (même date que le bonus : réglage performance_bonus_from, 2027-01-01).
--   - Combien : 3 000 F, dans la limite du fonds disponible (le fonds ne devient jamais négatif) ; le manque
--     éventuel n'est pas rattrapé.
--   - Une ligne par chauffeur et par mois (journal), jamais deux prélèvements pour le même mois.

insert into public.program_rules (key, value, label) values
  ('senteur_moto',      0,    'Produits de senteur : prélèvement mensuel sur le fonds de rachat, moto (F/mois)'),
  ('senteur_tricycle',  0,    'Produits de senteur : prélèvement mensuel sur le fonds de rachat, tricycle (F/mois)'),
  ('senteur_essentiel', 3000, 'Produits de senteur : prélèvement mensuel sur le fonds de rachat, Essentiel (F/mois)'),
  ('senteur_confort',   3000, 'Produits de senteur : prélèvement mensuel sur le fonds de rachat, Confort (F/mois)'),
  ('senteur_premium',   3000, 'Produits de senteur : prélèvement mensuel sur le fonds de rachat, VIP (F/mois)')
on conflict (key) do nothing;

create table if not exists public.driver_senteur_log (
  driver_id uuid not null references public.drivers(id) on delete cascade,
  month date not null,
  due_fcfa int not null,
  charged_fcfa int not null,
  created_at timestamptz not null default now(),
  primary key (driver_id, month)
);
alter table public.driver_senteur_log enable row level security;
drop policy if exists driver_senteur_log_admin on public.driver_senteur_log;
create policy driver_senteur_log_admin on public.driver_senteur_log for select using (public.is_admin());

create or replace function public._senteur_amount(p_category text)
returns int language sql stable security definer set search_path = public as $fn$
  select case p_category
    when 'moto'      then public._program_rule('senteur_moto')
    when 'tricycle'  then public._program_rule('senteur_tricycle')
    when 'essentiel' then public._program_rule('senteur_essentiel')
    when 'confort'   then public._program_rule('senteur_confort')
    when 'premium'   then public._program_rule('senteur_premium')
    else 0 end;
$fn$;
revoke execute on function public._senteur_amount(text) from public, anon, authenticated;

create or replace function public._charge_senteur(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Africa/Porto-Novo')::date);
  v_month date := date_trunc('month', coalesce(p_day, (now() at time zone 'Africa/Porto-Novo')::date))::date;
  v_last date;
  r record;
  v_amount int;
  v_wallet uuid;
  v_bal int;
  v_take int;
  v_log date;
  v_n int := 0;
  v_total int := 0;
begin
  v_last := (v_month + interval '1 month' - interval '1 day')::date;
  if v_day <> v_last then
    return jsonb_build_object('day', v_day, 'skipped', 'not_last_day');
  end if;
  if v_day < public._bonus_start() then
    return jsonb_build_object('day', v_day, 'skipped', 'not_started', 'starts_on', public._bonus_start());
  end if;

  for r in
    select d.id as driver_id, d.profile_id, v.category::text as cat
      from public.drivers d
      join public.vehicles v on v.id = d.current_vehicle_id
     where d.status = 'active' and d.application_type::text = 'cession'
  loop
    v_amount := public._senteur_amount(r.cat);
    if v_amount <= 0 then continue; end if;

    select id, balance_fcfa into v_wallet, v_bal
      from public.wallets where profile_id = r.profile_id and kind = 'tamcar_rachat' for update;
    if v_wallet is null then continue; end if;

    v_take := least(v_amount, greatest(v_bal, 0));
    insert into public.driver_senteur_log (driver_id, month, due_fcfa, charged_fcfa)
    values (r.driver_id, v_month, v_amount, v_take)
    on conflict (driver_id, month) do nothing
    returning month into v_log;
    if v_log is null then continue; end if;   -- déjà prélevé ce mois-ci

    if v_take > 0 then
      update public.wallets set balance_fcfa = balance_fcfa - v_take, updated_at = now() where id = v_wallet;
      insert into public.wallet_transactions (wallet_id, type, amount_fcfa, provider, status, meta)
      values (v_wallet, 'senteur_fee', -v_take, 'internal', 'success',
              jsonb_build_object('month', v_month, 'due', v_amount));
      v_n := v_n + 1;
      v_total := v_total + v_take;
    end if;
  end loop;

  return jsonb_build_object('day', v_day, 'month', v_month, 'drivers', v_n, 'total_fcfa', v_total);
end;
$fn$;
revoke execute on function public._charge_senteur(date) from public, anon, authenticated;

select cron.schedule('senteur-monthly', '40 22 * * *', $$select public._charge_senteur()$$);
