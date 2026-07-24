-- ============================================================
-- TamCar — Jauge chauffeur en VOLUME FCFA (2026-07-24)
--
--   Remplace l'affichage « nombre de courses » par un objectif de
--   VOLUME quotidien (somme des prix des courses terminées aujourd'hui),
--   par catégorie de véhicule :
--     moto 4 500 F/j · tricycle 9 000 F/j · voiture 15 000 F/j.
--   Motivation : 5 courses longues peuvent valoir 10 courtes (décision
--   Terence 2026-07-24). Le bonus reste ~7 % au-dessus du plancher,
--   abaissé pour les chauffeurs seniors.
-- ============================================================

create or replace function public.driver_today_volume(p_driver_id uuid)
returns table (
  volume_today int,
  min_target int,
  bonus_threshold int,
  is_senior boolean,
  in_bonus_zone boolean,
  fcfa_until_bonus int,
  fcfa_below_min int
)
language sql stable security invoker as $fn_vol$
  with cat as (
    select coalesce(v.category::text, 'essentiel') as category
    from public.drivers d
    left join public.vehicles v on v.id = d.current_vehicle_id
    where d.id = p_driver_id
  ),
  base as (
    select case (select category from cat)
      when 'moto' then 4500
      when 'tricycle' then 9000
      else 15000
    end as floor
  ),
  s as (
    select
      coalesce((
        select sum(r.price_total_fcfa)::int
        from public.rides r
        where r.driver_id = p_driver_id
          and r.status = 'completed'
          and (r.ended_at at time zone 'Africa/Porto-Novo')::date
              = (now() at time zone 'Africa/Porto-Novo')::date
      ), 0) as volume_today,
      (select floor from base) as min_target,
      public.is_driver_senior(p_driver_id) as senior
  )
  select
    s.volume_today,
    s.min_target,
    round(s.min_target * (case when s.senior then 1.0 else 1.07 end))::int as bonus_threshold,
    s.senior,
    s.volume_today >= round(s.min_target * (case when s.senior then 1.0 else 1.07 end)) as in_bonus_zone,
    greatest(0, round(s.min_target * (case when s.senior then 1.0 else 1.07 end))::int - s.volume_today) as fcfa_until_bonus,
    greatest(0, s.min_target - s.volume_today) as fcfa_below_min
  from s;
$fn_vol$;

grant execute on function public.driver_today_volume to authenticated;
