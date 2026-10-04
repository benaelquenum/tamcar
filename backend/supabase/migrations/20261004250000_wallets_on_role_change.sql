-- Portefeuilles manquants : les comptes créés depuis l'admin (chauffeurs, partenaires véhicule)
-- naissent « client » puis passent « driver » / « dealer » : le trigger de création des portefeuilles
-- (à l'insertion du profil seulement) ne leur donnait que « TamCar Crédit ». Sans portefeuille
-- Revenus, les crédits de fin de course étaient sautés en silence (le trigger de crédit ignore
-- l'absence de portefeuille) : un partenaire ne voyait jamais sa part arriver.
--
-- Correctif :
--   1. les portefeuilles sont créés aussi au changement de rôle, à la création de la fiche
--      chauffeur et à celle de la fiche partenaire ;
--   2. rattrapage des portefeuilles manquants ;
--   3. rattrapage des parts partenaires jamais créditées (courses terminées sans crédit).

create or replace function public._ensure_role_wallets()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_profile uuid;
  v_role text;
begin
  if tg_table_name = 'profiles' then
    v_profile := new.id;
    v_role := new.role::text;
  elsif tg_table_name = 'drivers' then
    v_profile := new.profile_id;
    v_role := 'driver';
  else
    v_profile := new.profile_id;
    v_role := 'dealer';
  end if;

  insert into public.wallets (profile_id, kind, balance_fcfa) values (v_profile, 'tamcar_credit', 0)
    on conflict (profile_id, kind) do nothing;
  if v_role in ('driver', 'dealer') then
    insert into public.wallets (profile_id, kind, balance_fcfa) values (v_profile, 'tamcar_revenus', 0)
      on conflict (profile_id, kind) do nothing;
  end if;
  if v_role = 'driver' then
    insert into public.wallets (profile_id, kind, balance_fcfa)
      values (v_profile, 'tamcar_rachat', 0), (v_profile, 'tamcar_epargne', 0)
      on conflict (profile_id, kind) do nothing;
  end if;
  return new;
end;
$fn$;
revoke execute on function public._ensure_role_wallets() from public, anon, authenticated;

drop trigger if exists profiles_wallets_on_role on public.profiles;
create trigger profiles_wallets_on_role
  after update of role on public.profiles
  for each row when (new.role is distinct from old.role)
  execute function public._ensure_role_wallets();

drop trigger if exists drivers_ensure_wallets on public.drivers;
create trigger drivers_ensure_wallets
  after insert on public.drivers
  for each row execute function public._ensure_role_wallets();

drop trigger if exists dealer_partners_ensure_wallets on public.dealer_partners;
create trigger dealer_partners_ensure_wallets
  after insert on public.dealer_partners
  for each row execute function public._ensure_role_wallets();

-- 2. Rattrapage des portefeuilles manquants --------------------------------------------------------
insert into public.wallets (profile_id, kind, balance_fcfa)
select d.profile_id, k.kind::wallet_kind, 0
  from public.drivers d
  cross join (values ('tamcar_credit'), ('tamcar_revenus'), ('tamcar_rachat'), ('tamcar_epargne')) as k(kind)
on conflict (profile_id, kind) do nothing;

insert into public.wallets (profile_id, kind, balance_fcfa)
select dp.profile_id, k.kind::wallet_kind, 0
  from public.dealer_partners dp
  cross join (values ('tamcar_credit'), ('tamcar_revenus')) as k(kind)
on conflict (profile_id, kind) do nothing;

-- 3. Parts partenaires jamais créditées : une écriture par course, historisée à la date de fin ------
do $do$
declare
  r record;
begin
  for r in
    select rd.id as ride_id, rd.dealer_share_fcfa as share, rd.ended_at, w.id as wallet_id
      from public.rides rd
      join public.dealer_partners dp on dp.id = rd.dealer_partner_id
      join public.wallets w on w.profile_id = dp.profile_id and w.kind = 'tamcar_revenus'
     where rd.status = 'completed' and rd.dealer_share_fcfa > 0
       and not exists (select 1 from public.wallet_transactions t
                        where t.ride_id = rd.id and t.wallet_id = w.id and t.type = 'dealer_share_credit')
  loop
    update public.wallets set balance_fcfa = balance_fcfa + r.share, updated_at = now() where id = r.wallet_id;
    insert into public.wallet_transactions (wallet_id, type, amount_fcfa, ride_id, status, created_at)
    values (r.wallet_id, 'dealer_share_credit', r.share, r.ride_id, 'success', coalesce(r.ended_at, now()));
  end loop;
end
$do$;
