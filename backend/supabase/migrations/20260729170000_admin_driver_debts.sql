-- ============================================================
-- TamCar — Vue admin des dettes chauffeur (2026-07-29)  [Phase 4]
--
--   Liste les chauffeurs dont le wallet Revenus est négatif (dette de
--   commissions de courses encaissées en direct, cf Phase 1). Pour relance
--   / recouvrement. Réservé à l'admin.
-- ============================================================

create or replace function public.admin_driver_debts()
returns table (
  driver_id uuid,
  full_name text,
  phone text,
  debt_fcfa int,
  is_online boolean,
  last_seen_at timestamptz
)
language sql stable security definer set search_path = public as $fn$
  select
    d.id as driver_id,
    p.full_name,
    p.phone,
    (-w.balance_fcfa)::int as debt_fcfa,
    d.is_online,
    d.last_seen_at
  from public.wallets w
  join public.drivers d on d.profile_id = w.profile_id
  join public.profiles p on p.id = d.profile_id
  where w.kind = 'tamcar_revenus'
    and w.balance_fcfa < 0
    and (select public.is_admin())
  order by w.balance_fcfa asc;   -- solde le plus négatif (plus grosse dette) en premier
$fn$;

grant execute on function public.admin_driver_debts to authenticated;
