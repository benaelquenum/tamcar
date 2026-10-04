-- Décision de Terence (2026-10-04) : toutes les primes d'approche sont plafonnées à 200 F, quelle que soit la distance.
insert into public.program_rules (key, value, label) values
  ('approach_max_fcfa', 200, 'Prime d''approche : montant maximum par course, quelle que soit la distance (F)')
on conflict (key) do nothing;

create or replace function public._approach_amount(p_category text, p_distance_m int, p_price int)
returns int language sql stable security definer set search_path = public as $fn$
  select coalesce(case
    when p_distance_m is null or p_distance_m <= public._program_rule('approach_free_m') then 0
    else (
      select case when q.amt < 50 then 0 else (floor(q.amt / 50.0) * 50)::int end
        from (select least(
                (p_distance_m - public._program_rule('approach_free_m')) / 1000.0 * public._approach_rate(p_category),
                p_price * (case p_category
                             when 'moto' then public._program_rule('share_moto')
                             when 'tricycle' then public._program_rule('share_tricycle')
                             when 'confort' then public._program_rule('share_confort')
                             else public._program_rule('share_essentiel') end) / 100.0
                  * public._program_rule('approach_cap_pct') / 100.0,
                public._program_rule('approach_max_fcfa')) as amt) q
    ) end, 0);
$fn$;
revoke execute on function public._approach_amount(text, int, int) from public, anon, authenticated;

drop function if exists public.my_approach_plan();
create or replace function public.my_approach_plan()
returns table (free_m int, rate_per_km int, cap_pct int, share_pct int, max_fcfa int, started boolean, start_date date)
language sql stable security definer set search_path = public as $fn$
  select public._program_rule('approach_free_m'),
         public._approach_rate(coalesce(v.category::text, 'essentiel')),
         public._program_rule('approach_cap_pct'),
         case coalesce(v.category::text, 'essentiel')
           when 'moto' then public._program_rule('share_moto')
           when 'tricycle' then public._program_rule('share_tricycle')
           when 'confort' then public._program_rule('share_confort')
           else public._program_rule('share_essentiel') end,
         public._program_rule('approach_max_fcfa'),
         (now() at time zone 'Africa/Porto-Novo')::date >= public._bonus_start(),
         public._bonus_start()
    from public.drivers d left join public.vehicles v on v.id = d.current_vehicle_id
   where d.profile_id = auth.uid();
$fn$;
revoke execute on function public.my_approach_plan() from public, anon;
grant execute on function public.my_approach_plan() to authenticated;
