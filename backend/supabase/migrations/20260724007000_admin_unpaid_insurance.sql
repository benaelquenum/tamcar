-- ============================================================
-- TamCar — Alerte admin : assurances conducteur impayées (2026-07-24)
--
--   Politique validée par Terence : si un chauffeur n'a pas pu régler
--   son assurance (solde revenus insuffisant), l'admin doit en être
--   informé. On l'expose sur le dashboard admin (section dédiée) via
--   cette fonction de lecture réservée à l'admin.
-- ============================================================

create or replace function public.admin_unpaid_insurance()
returns table (
  driver_id uuid,
  full_name text,
  period date,
  amount_fcfa int,
  collected_fcfa int,
  status text,
  months_overdue int
)
language sql stable security definer set search_path = public as $fn_unpaid$
  select
    c.driver_id,
    p.full_name,
    c.period,
    c.amount_fcfa,
    c.collected_fcfa,
    c.status,
    greatest(
      0,
      (extract(year  from age(date_trunc('month', current_date), c.period)) * 12
     + extract(month from age(date_trunc('month', current_date), c.period)))::int
    ) as months_overdue
  from public.driver_insurance_charges c
  join public.drivers d on d.id = c.driver_id
  join public.profiles p on p.id = d.profile_id
  where c.status <> 'paid'
    and (select public.is_admin())
  order by c.period asc, p.full_name;
$fn_unpaid$;

grant execute on function public.admin_unpaid_insurance to authenticated;
