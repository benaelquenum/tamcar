-- Prime d'approche et propriétaires-chauffeurs (formule Propriétaire : 80 % chauffeur, 20 % TamCar).
--
-- La prime d'approche était déjà versée à tous les chauffeurs, formule Propriétaire comprise, mais son
-- plafond (« TamCar ne perd jamais d'argent ») reposait sur la part de TamCar d'une voiture sous contrat
-- de partenaire (23 %, ou 60 % pour moto et tricycle). Un propriétaire-chauffeur ne laisse que 20 % à
-- TamCar : la prime est donc plafonnée à SA part réelle sur la course.
--   - paiement : part réelle de la course (platform_share_fcfa / prix) ;
--   - offre affichée avant acceptation : 20 % (_owner_platform_pct, à garder aligné sur accept_ride).

create or replace function public._owner_platform_pct()
returns int language sql immutable as $fn$ select 20 $fn$;
revoke execute on function public._owner_platform_pct() from public, anon, authenticated;

-- Montant : le 4e paramètre (part de TamCar en %) remplace la part de la catégorie quand il est fourni.
drop function if exists public._approach_amount(text, int, int);
create or replace function public._approach_amount(
  p_category text, p_distance_m int, p_price int, p_share_pct numeric default null
)
returns int language sql stable security definer set search_path = public as $fn$
  select coalesce(case
    when p_distance_m is null or p_distance_m <= public._program_rule('approach_free_m') then 0
    else (
      select case when q.amt < 50 then 0 else (floor(q.amt / 50.0) * 50)::int end
        from (select least(
                (p_distance_m - public._program_rule('approach_free_m')) / 1000.0 * public._approach_rate(p_category),
                p_price * coalesce(p_share_pct,
                                   (case p_category
                                      when 'moto' then public._program_rule('share_moto')
                                      when 'tricycle' then public._program_rule('share_tricycle')
                                      when 'confort' then public._program_rule('share_confort')
                                      else public._program_rule('share_essentiel') end)) / 100.0
                  * public._program_rule('approach_cap_pct') / 100.0,
                public._program_rule('approach_max_fcfa')) as amt) q
    ) end, 0);
$fn$;
revoke execute on function public._approach_amount(text, int, int, numeric) from public, anon, authenticated;

create or replace function public._pay_approach_bonus(p_ride_id uuid)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  r public.rides;
  v_cat text;
  v_app text;
  v_profile uuid;
  v_amount int;
  v_share numeric;
  v_wallet uuid;
  v_log uuid;
begin
  select * into r from public.rides where id = p_ride_id;
  if r.id is null or r.status::text <> 'completed' or r.driver_id is null or r.driver_distance_at_match_m is null then
    return 0;
  end if;
  if (now() at time zone 'Africa/Porto-Novo')::date < public._bonus_start() then return 0; end if;

  select d.profile_id, d.application_type::text, v.category::text into v_profile, v_app, v_cat
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.id = r.driver_id;
  if v_profile is null then return 0; end if;

  -- Propriétaire-chauffeur : plafond = la part réelle de TamCar sur cette course.
  v_share := case when v_app = 'proprietaire' and coalesce(r.price_total_fcfa, 0) > 0
                  then r.platform_share_fcfa * 100.0 / r.price_total_fcfa
                  else null end;

  v_amount := public._approach_amount(coalesce(v_cat, 'essentiel'), r.driver_distance_at_match_m, r.price_total_fcfa, v_share);
  if v_amount <= 0 then return 0; end if;

  insert into public.driver_approach_log (ride_id, driver_id, distance_m, bonus_fcfa)
  values (p_ride_id, r.driver_id, r.driver_distance_at_match_m, v_amount)
  on conflict (ride_id) do nothing
  returning ride_id into v_log;
  if v_log is null then return 0; end if;

  select id into v_wallet from public.wallets where profile_id = v_profile and kind = 'tamcar_revenus';
  if v_wallet is null then
    insert into public.wallets (profile_id, kind, balance_fcfa) values (v_profile, 'tamcar_revenus', 0)
    returning id into v_wallet;
  end if;
  update public.wallets set balance_fcfa = balance_fcfa + v_amount, updated_at = now() where id = v_wallet;
  insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, provider, status, meta)
  values (v_wallet, 'approach_bonus', v_amount, p_ride_id, 'internal', 'success',
          jsonb_build_object('distance_m', r.driver_distance_at_match_m));
  perform public._push_notify(v_profile, 'Prime d''approche : +' || v_amount || ' F',
    'Vous êtes venu de loin chercher ce client : ' || v_amount || ' F sont crédités sur votre portefeuille.',
    '/wallet', 'approach:' || p_ride_id::text, false);
  return v_amount;
end;
$fn$;
revoke execute on function public._pay_approach_bonus(uuid) from public, anon, authenticated;

-- Ce que le chauffeur voit sur l'offre : la part de TamCar est celle de sa formule.
create or replace function public.my_approach_plan()
returns table (free_m int, rate_per_km int, cap_pct int, share_pct int, max_fcfa int, started boolean, start_date date)
language sql stable security definer set search_path = public as $fn$
  select public._program_rule('approach_free_m'),
         public._approach_rate(coalesce(v.category::text, 'essentiel')),
         public._program_rule('approach_cap_pct'),
         case when d.application_type::text = 'proprietaire' then public._owner_platform_pct()
              else case coalesce(v.category::text, 'essentiel')
                     when 'moto' then public._program_rule('share_moto')
                     when 'tricycle' then public._program_rule('share_tricycle')
                     when 'confort' then public._program_rule('share_confort')
                     else public._program_rule('share_essentiel') end
         end,
         public._program_rule('approach_max_fcfa'),
         (now() at time zone 'Africa/Porto-Novo')::date >= public._bonus_start(),
         public._bonus_start()
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.profile_id = auth.uid();
$fn$;
revoke execute on function public.my_approach_plan() from public, anon;
grant execute on function public.my_approach_plan() to authenticated;
