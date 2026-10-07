-- ============================================================
-- TamCar Office — Suivi des lignes d'épargne NSIA (2026-10-07)
--
--   Chaque « ligne » est un emplacement de 6 ans chez NSIA (1 000 F par jour et par personne, du lundi au samedi) alimenté par une
--   chaîne de conducteurs : moto = 12 mois chacun, tricycle et voitures = 24 mois. TamCar rachète (partiellement) tous les 24 mois,
--   aux mois 24, 48 et 72 : le capital revient à TamCar, qui rembourse les conducteurs sortis (60 jours après le terme, 90 jours en
--   cas de départ anticipé) et avance l'écart entre un remboursement et le rachat suivant.
--   Ce module ne fait QUE suivre : il ne déplace aucun argent. Les calculs (à racheter, remboursements dus, avance) sont faits à
--   l'affichage à partir de ces trois tables.
--   Écriture : fondateur et secrétariat ; lecture : + expert-comptable ; suppression : fondateur seul (comme l'échéancier).
-- ============================================================
create table if not exists public.bo_nsia_lines (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  vehicle_kind text not null check (vehicle_kind in ('moto', 'tricycle', 'voiture')),
  opened_on date not null,
  term_months int not null default 72 check (term_months between 12 and 120),
  redeem_every_months int not null default 24 check (redeem_every_months between 6 and 72),
  contract_months int not null default 24 check (contract_months between 6 and 36),   -- durée d'un conducteur sur cette ligne
  daily_fcfa int not null default 1000 check (daily_fcfa >= 1000),
  status text not null default 'active' check (status in ('active', 'closed')),
  notes text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.bo_nsia_periods (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.bo_nsia_lines(id) on delete cascade,
  kind text not null default 'driver' check (kind in ('driver', 'vacancy')),
  label text not null,                       -- nom du conducteur / de l'engin, ou « Poste vacant »
  starts_on date not null,
  planned_end_on date not null,
  ended_on date,                             -- sortie effective (si différente de la fin prévue)
  refunded_on date,                          -- remboursement effectué au conducteur
  refund_fcfa int,                           -- montant réellement remboursé
  notes text,
  created_at timestamptz not null default now(),
  check (planned_end_on >= starts_on),
  check (ended_on is null or ended_on >= starts_on)
);
create index if not exists bo_nsia_periods_line_idx on public.bo_nsia_periods (line_id, starts_on);

create table if not exists public.bo_nsia_redemptions (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.bo_nsia_lines(id) on delete cascade,
  due_on date not null,                      -- date prévue du rachat
  done_on date,                              -- rachat effectué
  amount_fcfa int,                           -- somme reçue de NSIA
  interest_fcfa int,                         -- dont intérêts (laissés sur la ligne tant que Terence n'a pas tranché)
  notes text,
  created_at timestamptz not null default now(),
  unique (line_id, due_on)
);
create index if not exists bo_nsia_redemptions_line_idx on public.bo_nsia_redemptions (line_id, due_on);

-- Droits : mêmes règles que l'échéancier
do $do$
declare t text;
begin
  foreach t in array array['bo_nsia_lines', 'bo_nsia_periods', 'bo_nsia_redemptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (public.is_backoffice_reader())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert with check (public.is_backoffice())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update using (public.is_backoffice()) with check (public.is_backoffice())', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete using (public.is_admin())', t || '_delete', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$do$;

-- Création d'une ligne avec son plan type : les rachats (aux mois 24, 48, 72) et la chaîne de conducteurs.
create or replace function public.bo_nsia_create_line(
  p_label text,
  p_vehicle_kind text,
  p_opened_on date,
  p_with_plan boolean default true
)
returns public.bo_nsia_lines
language plpgsql security definer set search_path = public as $fn$
declare
  v_line public.bo_nsia_lines;
  v_contract int := case when p_vehicle_kind = 'moto' then 12 else 24 end;
  i int;
  v_start date;
begin
  if not public.is_backoffice() then raise exception 'Accès refusé'; end if;
  if nullif(trim(coalesce(p_label, '')), '') is null then raise exception 'Intitulé manquant'; end if;
  if p_opened_on is null then raise exception 'Date d''ouverture manquante'; end if;

  insert into public.bo_nsia_lines (label, vehicle_kind, opened_on, contract_months)
  values (trim(p_label), p_vehicle_kind, p_opened_on, v_contract)
  returning * into v_line;

  if p_with_plan then
    for i in 1 .. (v_line.term_months / v_line.redeem_every_months) loop
      insert into public.bo_nsia_redemptions (line_id, due_on)
      values (v_line.id, (p_opened_on + make_interval(months => i * v_line.redeem_every_months))::date);
    end loop;
    for i in 0 .. (v_line.term_months / v_contract) - 1 loop
      v_start := (p_opened_on + make_interval(months => i * v_contract))::date;
      insert into public.bo_nsia_periods (line_id, kind, label, starts_on, planned_end_on)
      values (v_line.id, 'driver', 'Conducteur ' || (i + 1) || ' (à désigner)', v_start,
              ((p_opened_on + make_interval(months => (i + 1) * v_contract))::date - 1));
    end loop;
  end if;
  return v_line;
end;
$fn$;
revoke execute on function public.bo_nsia_create_line(text, text, date, boolean) from public, anon;
grant execute on function public.bo_nsia_create_line(text, text, date, boolean) to authenticated;
