-- Relevé mensuel par véhicule (contrat de partenariat, article 9.8) : Jours actifs, Part du Partenaire, solde du Fonds, versements, retenues et frais.
-- L'article 14.2 interdit au Partenaire l'accès au détail des courses et à la rémunération du Chauffeur : le relevé ne renvoie donc plus
-- le volume (prix des courses) ni l'alimentation mensuelle du fonds (qui en donnerait le montant à 5 %). Le solde du Fonds reste cumulé.
drop function if exists public.dealer_my_statement(date, uuid);

create or replace function public.dealer_my_statement(p_month date default null, p_dealer_id uuid default null)
returns table (
  vehicle_id uuid, plate_number text, brand text, model text, category text, rides int, active_days int, share_fcfa bigint, fund_total_fcfa bigint
)
language sql stable security definer set search_path = public as $fn$
  with b as (
    select date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Porto-Novo')::date))::date as d0
  ),
  me as (select public._dealer_resolve(p_dealer_id) as id)
  select v.id, v.plate_number, v.brand, v.model, v.category::text,
         (count(r.id) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date >= b.d0 and (r.ended_at at time zone 'Africa/Porto-Novo')::date < (b.d0 + interval '1 month')::date))::int,
         (count(distinct (r.ended_at at time zone 'Africa/Porto-Novo')::date) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date >= b.d0 and (r.ended_at at time zone 'Africa/Porto-Novo')::date < (b.d0 + interval '1 month')::date))::int,
         coalesce(sum(r.dealer_share_fcfa) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date >= b.d0 and (r.ended_at at time zone 'Africa/Porto-Novo')::date < (b.d0 + interval '1 month')::date), 0)::bigint,
         coalesce(sum(r.driver_rachat_fcfa) filter (where (r.ended_at at time zone 'Africa/Porto-Novo')::date < (b.d0 + interval '1 month')::date), 0)::bigint
    from public.vehicles v
    cross join b cross join me
    left join public.rides r on r.vehicle_id = v.id and r.status = 'completed' and r.ended_at is not null and r.dealer_partner_id = me.id
   where v.dealer_partner_id = me.id and v.status <> 'archived'
   group by v.id, v.plate_number, v.brand, v.model, v.category, b.d0
   order by v.plate_number;
$fn$;
revoke execute on function public.dealer_my_statement(date, uuid) from public, anon;
grant execute on function public.dealer_my_statement(date, uuid) to authenticated;
