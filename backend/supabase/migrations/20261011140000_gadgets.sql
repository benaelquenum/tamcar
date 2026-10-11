-- ============================================================
-- TamCar — Gadgets des meilleurs chauffeurs et clients : critères et classement automatique (2026-10-11)
--
--   Décision de Terence : offrir des gadgets TOUS LES 6 MOIS aux 3 à 5 meilleurs chauffeurs ET clients. Les tours suivent les
--   semestres civils (janvier-juin, juillet-décembre). Le classement est calculé par la base à partir des courses, des notes et des
--   annulations ; le back-office l'affiche, l'admin le valide (les gagnants sont enregistrés et prévenus), puis suit la remise.
--
--   Chauffeur : courses terminées sur le tour, note moyenne des notes reçues sur le tour, annulations tardives (course immédiate
--   annulée par le chauffeur + désistement à moins de 10 minutes d'une réservation). Client : courses terminées, note moyenne reçue
--   des chauffeurs, annulations avec frais. Classement : nombre de courses, puis note, puis volume. Tous les seuils sont des réglages.
-- ============================================================

insert into public.program_rules (key, value, label) values
  ('gadget_winners_drivers',   5,      'Gadgets : nombre de chauffeurs récompensés par tour (6 mois)'),
  ('gadget_winners_clients',   5,      'Gadgets : nombre de clients récompensés par tour (6 mois)'),
  ('gadget_driver_min_rides',  100,    'Gadgets : nombre minimal de courses terminées sur le tour, chauffeur'),
  ('gadget_driver_min_rating', 47,     'Gadgets : note minimale reçue, chauffeur (en dixièmes d''étoile : 47 = 4,7 ; 0 = pas de condition)'),
  ('gadget_client_min_rides',  10,     'Gadgets : nombre minimal de courses terminées sur le tour, client'),
  ('gadget_client_min_rating', 45,     'Gadgets : note minimale reçue des chauffeurs, client (en dixièmes d''étoile : 45 = 4,5 ; 0 = pas de condition)'),
  ('gadget_max_late_cancels',  0,      'Gadgets : annulations imputables tolérées sur le tour (chauffeur : annulation de sa part ou désistement à moins de 10 min ; client : annulation avec frais)'),
  ('gadget_value_driver_fcfa', 13000,  'Gadgets : valeur prévue du cadeau d''un chauffeur (F)'),
  ('gadget_value_client_fcfa', 6000,   'Gadgets : valeur prévue du cadeau d''un client (F)'),
  ('gadget_budget_fcfa',       95000,  'Gadgets : budget maximal par tour (F) — 10 % du résultat net cumulé ; ne dépenser que si la caisse dépasse 1 M F')
on conflict (key) do update set label = excluded.label;

create or replace function public.admin_set_program_rule(p_key text, p_value int)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_value is null or p_value < 0 then raise exception 'Valeur invalide'; end if;
  if (p_key like 'share_%' or p_key in ('surplus_cede_pct', 'tamassur_fund_pct')) and p_value > 100 then
    raise exception 'Un pourcentage ne peut pas dépasser 100.';
  end if;
  if p_key like 'tamassur_months_%' then
    if p_value < 1 or p_value > 120 then raise exception 'Une durée doit être comprise entre 1 et 120 mois.'; end if;
  elsif p_key like 'tamassur_%' and p_key <> 'tamassur_fund_pct' and p_value < 100 then
    raise exception 'Une cotisation quotidienne doit être d''au moins 100 F.';
  end if;
  if p_key in ('payments_test_mode', 'payouts_auto', 'payments_provider') and p_value not in (0, 1) then
    raise exception 'Ce réglage se règle sur 1 (activé) ou 0 (désactivé).';
  end if;
  if p_key = 'booking_penalty_fcfa' and p_value > 5000 then
    raise exception 'La pénalité de réservation ne peut pas dépasser 5 000 F.';
  end if;
  if p_key in ('gadget_driver_min_rating', 'gadget_client_min_rating') and p_value > 50 then
    raise exception 'Une note minimale s''exprime en dixièmes d''étoile (47 = 4,7) et ne peut pas dépasser 50.';
  end if;
  if p_key in ('gadget_winners_drivers', 'gadget_winners_clients') and p_value > 50 then
    raise exception 'Au plus 50 gagnants par catégorie.';
  end if;
  if p_key = 'prio_enabled' and p_value not in (0, 1) then
    raise exception 'La priorité de proximité se règle sur 1 (active) ou 0 (désactivée).';
  end if;
  if p_key like 'prio_r%_m' and (p_value < 500 or p_value > 50000) then
    raise exception 'Un rayon doit être compris entre 500 m et 50 000 m.';
  end if;
  if p_key like 'prio_d%_s' and p_value > 300 then
    raise exception 'Un délai ne peut pas dépasser 300 secondes.';
  end if;
  update public.program_rules set value = p_value, updated_at = now() where key = p_key;
  if not found then raise exception 'Réglage inconnu'; end if;
end;
$fn$;
revoke execute on function public.admin_set_program_rule(text, int) from public, anon;
grant execute on function public.admin_set_program_rule(text, int) to authenticated;

-- Cadeaux attribués --------------------------------------------------------------------------------------------------------------
create table if not exists public.gadget_awards (
  id uuid primary key default gen_random_uuid(),
  round_from date not null,
  round_to date not null,
  kind text not null check (kind in ('driver', 'client')),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  rank int not null,
  metrics jsonb not null default '{}'::jsonb,
  gadget text,
  value_fcfa int,
  status text not null default 'awarded' check (status in ('awarded', 'delivered', 'declined')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (round_from, kind, profile_id)
);
create index if not exists gadget_awards_round_idx on public.gadget_awards (round_from desc, kind, rank);
alter table public.gadget_awards enable row level security;
drop policy if exists gadget_awards_admin_select on public.gadget_awards;
create policy gadget_awards_admin_select on public.gadget_awards for select using (public.is_admin());
revoke all on public.gadget_awards from anon, authenticated;
grant select on public.gadget_awards to authenticated;

-- Classement d'un tour ---------------------------------------------------------------------------------------------------------------
drop function if exists public.admin_gadget_ranking(text, date, date);
create or replace function public.admin_gadget_ranking(p_kind text, p_from date, p_to date)
returns table (
  rank_pos int,
  profile_id uuid,
  full_name text,
  phone text,
  rides int,
  volume_fcfa bigint,
  rating numeric,
  rating_count int,
  late_cancels int,  -- annulations imputables
  objective_days int,
  eligible boolean,
  reason text,
  is_winner boolean
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_min_rides int;
  v_min_rating int;
  v_max_late int := public._program_rule('gadget_max_late_cancels');
  v_winners int;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_kind not in ('driver', 'client') then raise exception 'Type inconnu'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Période invalide'; end if;

  if p_kind = 'driver' then
    v_min_rides := public._program_rule('gadget_driver_min_rides');
    v_min_rating := public._program_rule('gadget_driver_min_rating');
    v_winners := public._program_rule('gadget_winners_drivers');
  else
    v_min_rides := public._program_rule('gadget_client_min_rides');
    v_min_rating := public._program_rule('gadget_client_min_rating');
    v_winners := public._program_rule('gadget_winners_clients');
  end if;

  return query
  with base as (
    select p.id as pid, p.full_name::text as fname, p.phone::text as fphone,
      case when p_kind = 'driver' then
        (select count(*) from public.rides r where r.driver_id = d.id and r.status = 'completed'
            and (r.ended_at at time zone 'Africa/Porto-Novo')::date between p_from and p_to)
      else
        (select count(*) from public.rides r where r.client_id = p.id and r.status = 'completed'
            and (r.ended_at at time zone 'Africa/Porto-Novo')::date between p_from and p_to)
      end::int as n_rides,
      case when p_kind = 'driver' then
        (select coalesce(sum(r.price_total_fcfa), 0) from public.rides r where r.driver_id = d.id and r.status = 'completed'
            and (r.ended_at at time zone 'Africa/Porto-Novo')::date between p_from and p_to)
      else
        (select coalesce(sum(r.price_total_fcfa), 0) from public.rides r where r.client_id = p.id and r.status = 'completed'
            and (r.ended_at at time zone 'Africa/Porto-Novo')::date between p_from and p_to)
      end::bigint as vol,
      (select round(avg(x.stars)::numeric, 2) from public.ratings x where x.rated_id = p.id
          and (x.created_at at time zone 'Africa/Porto-Novo')::date between p_from and p_to) as avg_rating,
      (select count(*) from public.ratings x where x.rated_id = p.id
          and (x.created_at at time zone 'Africa/Porto-Novo')::date between p_from and p_to)::int as n_ratings,
      case when p_kind = 'driver' then
        (select count(*) from public.rides r where r.driver_id = d.id and r.cancel_attributed_to = 'driver'
            and (coalesce(r.cancelled_at, r.ended_at) at time zone 'Africa/Porto-Novo')::date between p_from and p_to)
        + (select count(*) from public.ride_driver_exclusions x join public.rides r on r.id = x.ride_id
            where x.driver_id = d.id and r.scheduled_at is not null and x.created_at >= r.scheduled_at - interval '10 minutes'
              and (x.created_at at time zone 'Africa/Porto-Novo')::date between p_from and p_to)
      else
        (select count(*) from public.rides r where r.client_id = p.id and r.status = 'cancelled_by_client'
            and r.cancel_attributed_to = 'client' and coalesce(r.cancel_reason, '') not like 'free%'
            and (coalesce(r.cancelled_at, r.ended_at) at time zone 'Africa/Porto-Novo')::date between p_from and p_to)
      end::int as n_late,
      case when p_kind = 'driver' then
        (select count(*) from public.driver_bonus_log b where b.driver_id = d.id and b.day between p_from and p_to)
      else 0 end::int as obj_days
    from public.profiles p
    left join public.drivers d on d.profile_id = p.id
    where p.role::text <> 'admin'
      and ((p_kind = 'driver' and d.id is not null and d.status::text = 'active')
        or (p_kind = 'client' and p.role::text = 'client'))
  ),
  scored as (
    select b.*,
      (b.n_rides >= greatest(v_min_rides, 1)
        and (v_min_rating = 0 or (b.avg_rating is not null and b.avg_rating * 10 >= v_min_rating))
        and b.n_late <= v_max_late) as ok,
      concat_ws(' · ',
        case when b.n_rides < greatest(v_min_rides, 1) then 'moins de ' || greatest(v_min_rides, 1) || ' courses' end,
        case when v_min_rating > 0 and b.avg_rating is null then 'aucune note reçue' end,
        case when v_min_rating > 0 and b.avg_rating is not null and b.avg_rating * 10 < v_min_rating then 'note ' || replace(b.avg_rating::text, '.', ',') || ' sous ' || replace(round(v_min_rating / 10.0, 1)::text, '.', ',') end,
        case when b.n_late > v_max_late then b.n_late || ' annulation' || case when b.n_late > 1 then 's imputables' else ' imputable' end end
      ) as why
    from base b
    where b.n_rides > 0
  ),
  ranked as (
    select s.*,
      -- les éligibles passent d'abord (ok desc) : leur rang parmi les éligibles est donc leur rang tout court
      row_number() over (order by s.ok desc, s.n_rides desc, s.avg_rating desc nulls last, s.vol desc, s.fname) as pos
    from scored s
  )
  select r.pos::int, r.pid, r.fname, r.fphone, r.n_rides, r.vol, r.avg_rating, r.n_ratings, r.n_late, r.obj_days,
         r.ok, nullif(r.why, ''), (r.ok and r.pos <= v_winners)
    from ranked r
   order by r.pos;
end;
$fn$;
revoke execute on function public.admin_gadget_ranking(text, date, date) from public, anon;
grant execute on function public.admin_gadget_ranking(text, date, date) to authenticated;

-- Validation du classement : les gagnants sont enregistrés (une seule fois) et prévenus -----------------------------------------------
create or replace function public.admin_gadget_validate(p_kind text, p_from date, p_to date, p_force boolean default false)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_n int := 0;
  v_row record;
  v_value int;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_kind not in ('driver', 'client') then raise exception 'Type inconnu'; end if;
  if p_to >= v_today and not p_force then
    raise exception 'Ce tour n''est pas terminé (fin le %) : validez après cette date.', to_char(p_to, 'DD/MM/YYYY');
  end if;
  v_value := public._program_rule(case when p_kind = 'driver' then 'gadget_value_driver_fcfa' else 'gadget_value_client_fcfa' end);

  for v_row in select * from public.admin_gadget_ranking(p_kind, p_from, p_to) g where g.is_winner loop
    insert into public.gadget_awards (round_from, round_to, kind, profile_id, rank, metrics, value_fcfa, created_by)
    values (p_from, p_to, p_kind, v_row.profile_id, v_row.rank_pos,
            jsonb_build_object('rides', v_row.rides, 'volume_fcfa', v_row.volume_fcfa, 'rating', v_row.rating, 'late_cancels', v_row.late_cancels,
                               'objective_days', v_row.objective_days),
            v_value, auth.uid())
    on conflict (round_from, kind, profile_id) do nothing;
    if found then
      v_n := v_n + 1;
      perform public._push_notify(
        v_row.profile_id,
        'Bravo, vous êtes parmi les meilleurs',
        case when p_kind = 'driver'
          then 'Vous êtes dans le top des chauffeurs TamCar de ce semestre : un cadeau vous attend. L''équipe vous contactera pour vous le remettre.'
          else 'Vous êtes dans le top des clients TamCar de ce semestre : un cadeau vous attend. L''équipe vous contactera pour vous le remettre.' end,
        '/', 'gadget:' || p_from::text || ':' || p_kind, false);
    end if;
  end loop;
  return v_n;
end;
$fn$;
revoke execute on function public.admin_gadget_validate(text, date, date, boolean) from public, anon;
grant execute on function public.admin_gadget_validate(text, date, date, boolean) to authenticated;

-- Suivi de la remise ---------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_gadget_update(p_id uuid, p_status text, p_gadget text default null, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_status not in ('awarded', 'delivered', 'declined') then raise exception 'Statut inconnu'; end if;
  update public.gadget_awards
     set status = p_status,
         gadget = coalesce(nullif(trim(p_gadget), ''), gadget),
         note = coalesce(nullif(trim(p_note), ''), note),
         delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else null end
   where id = p_id;
  if not found then raise exception 'Cadeau introuvable'; end if;
end;
$fn$;
revoke execute on function public.admin_gadget_update(uuid, text, text, text) from public, anon;
grant execute on function public.admin_gadget_update(uuid, text, text, text) to authenticated;
