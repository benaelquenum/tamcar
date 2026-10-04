-- Priorité de proximité : premier cercle élargi à 5 km (décision de Terence, 2026-10-05).
--
-- « À 0 s, le cercle s'étend à 5 km » : tous les chauffeurs à moins de 5 km voient la course tout de
-- suite et le plus rapide la prend (promptitude). Les cercles suivants s'ouvrent ensuite :
--     0 s  : jusqu'à 5 km
--    10 s  : jusqu'à 10 km
--    20 s  : jusqu'à 15 km (au-delà de 10 km : la prime d'approche reste la compensation du déplacement)
-- Le 4e cercle (même rayon que le 3e) ne sert plus : il est conservé tel quel, sans effet.

update public.program_rules set value = 5000,  updated_at = now() where key = 'prio_r1_m';
update public.program_rules set value = 10000, updated_at = now() where key = 'prio_r2_m';
update public.program_rules set value = 10,    updated_at = now() where key = 'prio_d2_s';
update public.program_rules set value = 15000, updated_at = now() where key = 'prio_r3_m';
update public.program_rules set value = 20,    updated_at = now() where key = 'prio_d3_s';
update public.program_rules set value = 15000, updated_at = now() where key = 'prio_r4_m';
update public.program_rules set value = 40,    updated_at = now() where key = 'prio_d4_s';

-- Calendrier lu par l'application chauffeur : seules les ouvertures qui élargissent réellement le
-- rayon comptent (délai remis à 0 sinon) — l'écran ne relit le pool qu'à ces moments-là.
create or replace function public.ride_ring_plan()
returns table (enabled boolean, d2_s int, d3_s int, d4_s int)
language sql stable security definer set search_path = public as $fn$
  select public._program_rule('prio_enabled') = 1,
         case when public._program_rule('prio_r2_m') > public._program_rule('prio_r1_m')
              then public._program_rule('prio_d2_s') else 0 end,
         case when public._program_rule('prio_r3_m') > greatest(public._program_rule('prio_r1_m'), public._program_rule('prio_r2_m'))
              then public._program_rule('prio_d3_s') else 0 end,
         case when public._program_rule('prio_r4_m') > greatest(public._program_rule('prio_r1_m'), public._program_rule('prio_r2_m'), public._program_rule('prio_r3_m'))
              then public._program_rule('prio_d4_s') else 0 end;
$fn$;
revoke execute on function public.ride_ring_plan() from public, anon;
grant execute on function public.ride_ring_plan() to authenticated;
