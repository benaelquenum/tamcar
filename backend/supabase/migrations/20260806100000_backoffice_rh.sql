-- ============================================================
-- TamCar Office — Phase 4 : RH & paie (2026-08-06)
--
--   1. bo_employees          : registre du personnel, matricule EMP-2026-0001
--   2. bo_employee_documents : rattachement de pièces de la GED à un employé
--   3. bo_leaves             : congés (droit béninois : 24 j ouvrables / an,
--                              acquis à raison de 2 j par mois de service)
--   4. bo_payroll_settings   : barèmes ITS + taux CNSS, MODIFIABLES sans
--                              redéploiement (table singleton, id = 1)
--   5. bo_payslips           : bulletins mensuels + lien vers l'écriture
--   6. RPC : bo_create_employee, bo_generate_payslip, bo_post_payroll,
--            bo_mark_payroll_paid, bo_hr_alerts, bo_leave_balances,
--            bo_decide_leave, bo_compute_its, bo_working_days
--
-- ------------------------------------------------------------
-- CONFIDENTIALITÉ
-- ------------------------------------------------------------
--   Tout le module RH est réservé à public.is_admin() — lecture ET écriture.
--   Le salaire brut figure dans la fiche employé : ouvrir bo_employees au
--   staff exposerait la rémunération de chacun. Si un jour le secrétariat
--   doit gérer le registre du personnel, la façon propre est de scinder
--   bo_employees (état civil / contrat) d'une table bo_employee_pay
--   (salaire) — PAS d'élargir la policy ci-dessous.
--
--   Même raison pour la piste d'audit : bo_audit() sérialise la ligne
--   entière dans bo_audit_log, lisible par is_backoffice_reader(). Les
--   tables RH utilisent donc bo_audit_rh(), qui ne journalise QUE
--   l'identifiant et l'opération, jamais les montants.
--
-- ------------------------------------------------------------
-- BARÈMES — CE QUI EST CONFIRMÉ ET CE QUI NE L'EST PAS
-- ------------------------------------------------------------
--   [CONFIRMÉ] Barème ITS — CGI 2026, article 125-1) :
--       0 %  pour la tranche inférieure ou égale à     60 000 F
--      10 %  pour la tranche comprise entre  60 001 et 150 000 F
--      15 %  pour la tranche comprise entre 150 001 et 250 000 F
--      19 %  pour la tranche comprise entre 250 001 et 500 000 F
--      30 %  pour la tranche supérieure à             500 000 F
--
--   [CONFIRMÉ] Base imposable — CGI 2026, articles 122 à 124 :
--     l'article 122 retient les montants BRUTS (indemnités de transport
--     incluses) ; l'article 124 énumère limitativement ce qui n'entre pas
--     dans la base (frais de formation, primes d'assurance maladie,
--     sportifs et artistes) et NE PRÉVOIT PAS la déduction de la
--     cotisation CNSS salariale. Le paramètre its_deduct_cnss_employee
--     est donc à FALSE par défaut, conformément au texte. Il reste
--     modifiable si votre expert-comptable applique une autre doctrine.
--
--   [CONFIRMÉ] Redevance ORTB — CGI 2026, article 125-2) :
--     l'impôt est majoré de 1 000 F sur le salaire de mars et de 3 000 F
--     sur celui de juin ; les personnes dont le revenu imposable n'excède
--     pas la première tranche du barème sont exonérées du prélèvement de
--     3 000 F. (Prudence retenue ici : l'exonération est appliquée aux
--     deux mois pour un revenu <= 60 000 F.)
--
--   [CONFIRMÉ] Versement patronal sur salaires (VPS) — CGI 2026 :
--     article 194, taux 4 % (2 % pour l'enseignement privé) ;
--     article 193, base identique à celle de l'ITS ;
--     article 192, sont affranchies les entreprises nouvelles au titre de
--     leur PREMIER EXERCICE pour l'emploi de salariés béninois, et les
--     employeurs pendant DEUX ANS sur les rémunérations du premier emploi
--     d'un salarié béninois déclaré à la CNSS.
--     → vps_enabled est à FALSE par défaut : TamCar, société nouvelle
--       embauchant des Béninois, relève a priori de ces exonérations.
--       À BASCULER À TRUE dès qu'elles cessent de s'appliquer.
--
--   [NON CONFIRMÉ — valeurs par défaut à faire valider par la CNSS]
--     Les taux de sécurité sociale ne figurent PAS dans le CGI : ils
--     relèvent du Code de sécurité sociale et de ses textes d'application.
--     Aucun n'a pu être vérifié sur pièce ici. Ils sont donc paramétrables
--     et pré-remplis avec les valeurs usuellement pratiquées au Bénin :
--       · part salariale (pension)        3,60 %
--       · part patronale pension          6,40 %
--       · prestations familiales          9,00 %
--       · risques professionnels          2,00 %  (varie de 1 à 4 % selon
--                                                  le risque de l'activité —
--                                                  à faire notifier par la CNSS)
--       · plafond mensuel de cotisation   400 000 F, appliqué à la seule
--                                         branche pension par défaut
--     → Corrigez-les dans /rh/paie (ou en SQL sur bo_payroll_settings)
--       dès réception de la notification CNSS. Aucun taux n'est codé en
--       dur dans les fonctions.
--
--   [NON CONFIRMÉ — droit du travail, pas fiscal]
--     24 jours ouvrables de congé par an, acquis à raison de 2 jours par
--     mois de service effectif : règle du Code du travail béninois, non
--     issue du CGI. Paramétrable (leave_days_per_month).
--     Les jours ouvrables sont comptés dimanches exclus ; les jours fériés
--     ne sont PAS gérés (à retrancher à la main le cas échéant).
-- ============================================================

-- ---------- 1. Registre du personnel ----------
create table if not exists public.bo_employees (
  id                 uuid primary key default gen_random_uuid(),
  matricule          text not null unique,
  last_name          text not null,
  first_names        text not null,
  job_title          text,
  birth_date         date,
  id_card_no         text,
  id_card_expiry     date,
  phone              text,
  address            text,
  hired_on           date not null,
  contract_type      text not null default 'cdi'
                     check (contract_type in ('cdi', 'cdd', 'stage', 'prestation')),
  contract_end_on    date,
  trial_end_on       date,
  gross_salary_fcfa  bigint not null default 0 check (gross_salary_fcfa >= 0),
  cnss_no            text,
  status             text not null default 'actif' check (status in ('actif', 'sorti')),
  exit_on            date,
  exit_reason        text,
  notes              text,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists bo_employees_status_idx on public.bo_employees (status);
create index if not exists bo_employees_name_idx on public.bo_employees (last_name, first_names);

drop trigger if exists bo_employees_touch on public.bo_employees;
create trigger bo_employees_touch
  before update on public.bo_employees
  for each row execute function public.bo_touch_updated_at();

alter table public.bo_employees enable row level security;

drop policy if exists bo_employees_select on public.bo_employees;
create policy bo_employees_select on public.bo_employees
  for select using (public.is_admin());

drop policy if exists bo_employees_update on public.bo_employees;
create policy bo_employees_update on public.bo_employees
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists bo_employees_delete on public.bo_employees;
create policy bo_employees_delete on public.bo_employees
  for delete using (public.is_admin());
-- (pas de policy insert : la création passe par bo_create_employee, qui
--  attribue le matricule en base — jamais côté client)

grant select, update, delete on public.bo_employees to authenticated;

-- ---------- 2. Pièces de la GED rattachées à un employé ----------
create table if not exists public.bo_employee_documents (
  employee_id uuid not null references public.bo_employees(id) on delete cascade,
  document_id uuid not null references public.bo_documents(id) on delete cascade,
  note        text,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  primary key (employee_id, document_id)
);

alter table public.bo_employee_documents enable row level security;

drop policy if exists bo_employee_documents_select on public.bo_employee_documents;
create policy bo_employee_documents_select on public.bo_employee_documents
  for select using (public.is_admin());

drop policy if exists bo_employee_documents_insert on public.bo_employee_documents;
create policy bo_employee_documents_insert on public.bo_employee_documents
  for insert with check (public.is_admin());

drop policy if exists bo_employee_documents_delete on public.bo_employee_documents;
create policy bo_employee_documents_delete on public.bo_employee_documents
  for delete using (public.is_admin());

grant select, insert, delete on public.bo_employee_documents to authenticated;

-- ---------- 3. Congés ----------
create table if not exists public.bo_leaves (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.bo_employees(id) on delete cascade,
  kind        text not null default 'annuel'
              check (kind in ('annuel', 'maladie', 'maternite', 'sans_solde', 'exceptionnel')),
  start_on    date not null,
  end_on      date not null,
  days        numeric(5, 1) not null default 0 check (days >= 0),
  reason      text,
  status      text not null default 'demande'
              check (status in ('demande', 'approuve', 'refuse')),
  decided_by  uuid references public.profiles(id),
  decided_at  timestamptz,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  check (end_on >= start_on)
);

create index if not exists bo_leaves_employee_idx on public.bo_leaves (employee_id, start_on desc);
create index if not exists bo_leaves_status_idx on public.bo_leaves (status, start_on);

alter table public.bo_leaves enable row level security;

drop policy if exists bo_leaves_select on public.bo_leaves;
create policy bo_leaves_select on public.bo_leaves
  for select using (public.is_admin());

drop policy if exists bo_leaves_insert on public.bo_leaves;
create policy bo_leaves_insert on public.bo_leaves
  for insert with check (public.is_admin());

drop policy if exists bo_leaves_update on public.bo_leaves;
create policy bo_leaves_update on public.bo_leaves
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists bo_leaves_delete on public.bo_leaves;
create policy bo_leaves_delete on public.bo_leaves
  for delete using (public.is_admin());

grant select, insert, update, delete on public.bo_leaves to authenticated;

-- Jours ouvrables entre deux dates, dimanches exclus (jours fériés non gérés).
create or replace function public.bo_working_days(p_from date, p_to date)
returns int
language sql stable as $$
  select case
    when p_from is null or p_to is null or p_to < p_from then 0
    else (
      select count(*)::int
      from generate_series(p_from, p_to, interval '1 day') d
      where extract(dow from d) <> 0      -- 0 = dimanche
    )
  end;
$$;

grant execute on function public.bo_working_days(date, date) to authenticated;

-- Décompte automatique des jours ouvrables si non fourni à la saisie.
create or replace function public.bo_leaves_fill_days()
returns trigger language plpgsql as $$
begin
  if new.days is null or new.days = 0 then
    new.days := public.bo_working_days(new.start_on, new.end_on);
  end if;
  return new;
end;
$$;

drop trigger if exists bo_leaves_fill_days on public.bo_leaves;
create trigger bo_leaves_fill_days
  before insert or update on public.bo_leaves
  for each row execute function public.bo_leaves_fill_days();

-- ---------- 4. Paramètres de paie (barèmes modifiables) ----------
create table if not exists public.bo_payroll_settings (
  id                          int primary key default 1 check (id = 1),

  -- Sécurité sociale — [NON CONFIRMÉ] : valeurs usuelles, à faire valider
  -- par la notification CNSS de l'entreprise.
  cnss_employee_rate          numeric(6, 5) not null default 0.03600,
  cnss_employer_pension_rate  numeric(6, 5) not null default 0.06400,
  cnss_employer_family_rate   numeric(6, 5) not null default 0.09000,
  cnss_employer_risk_rate     numeric(6, 5) not null default 0.02000,
  cnss_ceiling_fcfa           bigint        not null default 400000,
  cnss_ceiling_on_family      boolean       not null default false,
  cnss_ceiling_on_risk        boolean       not null default false,

  -- ITS — [CONFIRMÉ] CGI 2026 art. 125-1). "to" = null → tranche supérieure.
  its_brackets                jsonb  not null default '[
    {"from": 0,      "to": 60000,  "rate": 0.00},
    {"from": 60000,  "to": 150000, "rate": 0.10},
    {"from": 150000, "to": 250000, "rate": 0.15},
    {"from": 250000, "to": 500000, "rate": 0.19},
    {"from": 500000, "to": null,   "rate": 0.30}
  ]'::jsonb,
  -- [CONFIRMÉ] CGI 2026 art. 122 et 124 : la CNSS salariale n'est pas
  -- déductible de la base ITS → false.
  its_deduct_cnss_employee    boolean not null default false,

  -- Redevance ORTB — [CONFIRMÉ] CGI 2026 art. 125-2).
  ortb_enabled                boolean not null default true,
  ortb_march_fcfa             int not null default 1000,
  ortb_june_fcfa              int not null default 3000,

  -- VPS — [CONFIRMÉ] CGI 2026 art. 193, 194 ; exonérations art. 192.
  vps_enabled                 boolean not null default false,
  vps_rate                    numeric(6, 5) not null default 0.04000,

  -- Congés — [NON CONFIRMÉ] Code du travail, pas le CGI.
  leave_days_per_month        numeric(4, 2) not null default 2.00,

  updated_by                  uuid references public.profiles(id),
  updated_at                  timestamptz not null default now()
);

insert into public.bo_payroll_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists bo_payroll_settings_touch on public.bo_payroll_settings;
create trigger bo_payroll_settings_touch
  before update on public.bo_payroll_settings
  for each row execute function public.bo_touch_updated_at();

alter table public.bo_payroll_settings enable row level security;

drop policy if exists bo_payroll_settings_select on public.bo_payroll_settings;
create policy bo_payroll_settings_select on public.bo_payroll_settings
  for select using (public.is_admin());

drop policy if exists bo_payroll_settings_update on public.bo_payroll_settings;
create policy bo_payroll_settings_update on public.bo_payroll_settings
  for update using (public.is_admin()) with check (public.is_admin());

grant select, update on public.bo_payroll_settings to authenticated;

-- ---------- 5. Bulletins de paie ----------
create table if not exists public.bo_payslips (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references public.bo_employees(id) on delete cascade,
  period              date not null,             -- toujours le 1er du mois
  days_paid           int  not null default 30,
  days_in_month       int  not null default 30,
  gross_fcfa          bigint not null default 0, -- brut du mois (prorata inclus)
  cnss_employee_fcfa  bigint not null default 0, -- retenue salariale
  taxable_fcfa        bigint not null default 0, -- base imposable ITS
  its_fcfa            bigint not null default 0, -- ITS (hors ORTB)
  ortb_fcfa           bigint not null default 0, -- redevance ORTB (mars/juin)
  net_fcfa            bigint not null default 0, -- NET À PAYER
  cnss_employer_fcfa  bigint not null default 0, -- charges patronales CNSS
  vps_fcfa            bigint not null default 0, -- versement patronal sur salaires
  status              text not null default 'brouillon'
                      check (status in ('brouillon', 'valide', 'paye')),
  entry_id            uuid references public.bo_entries(id),
  paid_entry_id       uuid references public.bo_entries(id),
  computed_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  unique (employee_id, period)
);

create index if not exists bo_payslips_period_idx on public.bo_payslips (period desc);
create index if not exists bo_payslips_status_idx on public.bo_payslips (status);

alter table public.bo_payslips enable row level security;

drop policy if exists bo_payslips_select on public.bo_payslips;
create policy bo_payslips_select on public.bo_payslips
  for select using (public.is_admin());

drop policy if exists bo_payslips_delete on public.bo_payslips;
create policy bo_payslips_delete on public.bo_payslips
  for delete using (public.is_admin() and status = 'brouillon');
-- (pas d'insert/update direct : tout passe par les RPC ci-dessous, qui
--  garantissent le calcul et l'unicité mensuelle)

grant select, delete on public.bo_payslips to authenticated;

-- ---------- 6. Piste d'audit RH (sans montants) ----------
create or replace function public.bo_audit_rh()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Volontairement SANS `details` : bo_audit_log est lisible par le staff
  -- et l'expert-comptable, la paie ne doit pas y transiter.
  insert into public.bo_audit_log (actor, action, entity, entity_id, details)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(case when tg_op = 'DELETE' then old.id::text else new.id::text end, '?'),
    jsonb_build_object('confidentiel', true)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists bo_employees_audit on public.bo_employees;
create trigger bo_employees_audit
  after insert or update or delete on public.bo_employees
  for each row execute function public.bo_audit_rh();

drop trigger if exists bo_leaves_audit on public.bo_leaves;
create trigger bo_leaves_audit
  after insert or update or delete on public.bo_leaves
  for each row execute function public.bo_audit_rh();

drop trigger if exists bo_payslips_audit on public.bo_payslips;
create trigger bo_payslips_audit
  after insert or update or delete on public.bo_payslips
  for each row execute function public.bo_audit_rh();

-- ---------- 7. Comptes SYSCOHADA utilisés par la paie ----------
-- (déjà seedés par la migration compta ; réinsérés ici pour que ce fichier
--  soit autoportant)
insert into public.bo_accounts (code, label, class) values
  ('661',  'Rémunérations directes du personnel', 6),
  ('6641', 'Charges sociales — CNSS', 6),
  ('641',  'Impôts et taxes directs (patente)', 6),
  ('422',  'Personnel — rémunérations dues', 4),
  ('431',  'Sécurité sociale (CNSS)', 4),
  ('447',  'État — impôts retenus à la source (ITS, AIB)', 4),
  ('448',  'État — autres impôts et taxes', 4)
on conflict (code) do nothing;

-- ---------- 8. Création d'un employé (matricule EMP-AAAA-NNNN) ----------
create or replace function public.bo_create_employee(
  p_last_name        text,
  p_first_names      text,
  p_hired_on         date,
  p_gross_salary_fcfa bigint,
  p_job_title        text default null,
  p_contract_type    text default 'cdi',
  p_birth_date       date default null,
  p_id_card_no       text default null,
  p_id_card_expiry   date default null,
  p_phone            text default null,
  p_address          text default null,
  p_contract_end_on  date default null,
  p_trial_end_on     date default null,
  p_cnss_no          text default null,
  p_notes            text default null
)
returns public.bo_employees
language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from coalesce(p_hired_on, current_date))::int;
  v_no   int;
  result public.bo_employees;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_last_name), '') = '' or coalesce(trim(p_first_names), '') = '' then
    raise exception 'Nom et prénoms obligatoires' using errcode = 'P0001';
  end if;
  if p_hired_on is null then
    raise exception 'Date d''embauche obligatoire' using errcode = 'P0001';
  end if;
  if p_contract_type = 'cdd' and p_contract_end_on is null then
    raise exception 'Un CDD doit préciser sa date de fin' using errcode = 'P0001';
  end if;

  insert into public.bo_counters as c (kind, year, last_no)
  values ('employee', v_year, 1)
  on conflict (kind, year) do update set last_no = c.last_no + 1
  returning last_no into v_no;

  insert into public.bo_employees
    (matricule, last_name, first_names, job_title, birth_date, id_card_no,
     id_card_expiry, phone, address, hired_on, contract_type, contract_end_on,
     trial_end_on, gross_salary_fcfa, cnss_no, notes, created_by)
  values
    ('EMP-' || v_year || '-' || lpad(v_no::text, 4, '0'),
     upper(trim(p_last_name)), trim(p_first_names),
     nullif(trim(p_job_title), ''), p_birth_date, nullif(trim(p_id_card_no), ''),
     p_id_card_expiry, nullif(trim(p_phone), ''), nullif(trim(p_address), ''),
     p_hired_on, p_contract_type, p_contract_end_on, p_trial_end_on,
     greatest(coalesce(p_gross_salary_fcfa, 0), 0), nullif(trim(p_cnss_no), ''),
     nullif(trim(p_notes), ''), auth.uid())
  returning * into result;

  return result;
end;
$$;

grant execute on function public.bo_create_employee(
  text, text, date, bigint, text, text, date, text, date, text, text,
  date, date, text, text) to authenticated;

-- ---------- 9. Calcul de l'ITS (barème progressif par tranches) ----------
create or replace function public.bo_compute_its(p_taxable bigint)
returns bigint
language plpgsql stable security definer set search_path = public as $$
declare
  v_brackets jsonb;
  v_b        jsonb;
  v_tax      numeric := 0;
  v_from     numeric;
  v_to       numeric;
  v_rate     numeric;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;
  if p_taxable is null or p_taxable <= 0 then return 0; end if;

  select its_brackets into v_brackets from public.bo_payroll_settings where id = 1;

  for v_b in select * from jsonb_array_elements(coalesce(v_brackets, '[]'::jsonb)) loop
    v_from := coalesce((v_b->>'from')::numeric, 0);
    v_to   := coalesce((v_b->>'to')::numeric, 1e15);
    v_rate := coalesce((v_b->>'rate')::numeric, 0);
    if p_taxable::numeric > v_from then
      v_tax := v_tax + (least(p_taxable::numeric, v_to) - v_from) * v_rate;
    end if;
  end loop;

  return round(v_tax)::bigint;
end;
$$;

grant execute on function public.bo_compute_its(bigint) to authenticated;

-- ---------- 10. Génération d'un bulletin ----------
-- Idempotent : un seul bulletin par employé et par mois. Un bulletin
-- 'brouillon' est recalculé ; un bulletin 'valide'/'paye' est protégé.
create or replace function public.bo_generate_payslip(
  p_employee_id uuid,
  p_period      date
)
returns public.bo_payslips
language plpgsql security definer set search_path = public as $$
declare
  emp    public.bo_employees;
  cfg    public.bo_payroll_settings;
  result public.bo_payslips;
  v_start        date;
  v_end          date;
  v_from         date;
  v_to           date;
  v_days         int;
  v_days_month   int;
  v_gross        bigint;
  v_pension_base numeric;
  v_family_base  numeric;
  v_risk_base    numeric;
  v_cnss_emp     bigint;
  v_cnss_er      bigint;
  v_taxable      bigint;
  v_its          bigint;
  v_ortb         bigint := 0;
  v_vps          bigint := 0;
  v_net          bigint;
  v_first_top    numeric;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;

  v_start      := date_trunc('month', p_period)::date;
  v_end        := (v_start + interval '1 month - 1 day')::date;
  v_days_month := (v_end - v_start) + 1;

  select * into emp from public.bo_employees where id = p_employee_id;
  if emp is null then
    raise exception 'Employé introuvable' using errcode = 'P0001';
  end if;

  select * into cfg from public.bo_payroll_settings where id = 1;
  if cfg is null then
    raise exception 'Paramètres de paie absents' using errcode = 'P0001';
  end if;

  -- Prorata : jours de présence dans le mois (embauche ou sortie en cours de mois)
  v_from := greatest(v_start, emp.hired_on);
  v_to   := least(v_end, coalesce(emp.exit_on, v_end));
  v_days := (v_to - v_from) + 1;
  if v_days <= 0 then
    raise exception 'L''employé % n''est pas au registre sur ce mois', emp.matricule
      using errcode = 'P0001';
  end if;

  v_gross := round(emp.gross_salary_fcfa::numeric * v_days / v_days_month)::bigint;

  -- CNSS : plafond appliqué à la branche pension (et, si configuré,
  -- aux prestations familiales / risques professionnels).
  v_pension_base := least(v_gross::numeric, cfg.cnss_ceiling_fcfa::numeric);
  v_family_base  := case when cfg.cnss_ceiling_on_family
                    then least(v_gross::numeric, cfg.cnss_ceiling_fcfa::numeric)
                    else v_gross::numeric end;
  v_risk_base    := case when cfg.cnss_ceiling_on_risk
                    then least(v_gross::numeric, cfg.cnss_ceiling_fcfa::numeric)
                    else v_gross::numeric end;

  v_cnss_emp := round(v_pension_base * cfg.cnss_employee_rate)::bigint;
  v_cnss_er  := round(v_pension_base * cfg.cnss_employer_pension_rate
                    + v_family_base  * cfg.cnss_employer_family_rate
                    + v_risk_base    * cfg.cnss_employer_risk_rate)::bigint;

  -- Base imposable ITS (CGI art. 122/124 : brut, CNSS salariale non déductible)
  v_taxable := case when cfg.its_deduct_cnss_employee
                    then greatest(v_gross - v_cnss_emp, 0)
                    else v_gross end;

  v_its := public.bo_compute_its(v_taxable);

  -- Redevance ORTB (CGI art. 125-2), exonérée sous la 1re tranche du barème
  v_first_top := coalesce((cfg.its_brackets->0->>'to')::numeric, 0);
  if cfg.ortb_enabled and v_taxable::numeric > v_first_top then
    if extract(month from v_start) = 3 then v_ortb := cfg.ortb_march_fcfa; end if;
    if extract(month from v_start) = 6 then v_ortb := cfg.ortb_june_fcfa;  end if;
  end if;

  if cfg.vps_enabled then
    v_vps := round(v_taxable::numeric * cfg.vps_rate)::bigint;
  end if;

  v_net := v_gross - v_cnss_emp - v_its - v_ortb;

  insert into public.bo_payslips
    (employee_id, period, days_paid, days_in_month, gross_fcfa,
     cnss_employee_fcfa, taxable_fcfa, its_fcfa, ortb_fcfa, net_fcfa,
     cnss_employer_fcfa, vps_fcfa, status)
  values
    (emp.id, v_start, v_days, v_days_month, v_gross,
     v_cnss_emp, v_taxable, v_its, v_ortb, v_net, v_cnss_er, v_vps, 'brouillon')
  on conflict (employee_id, period) do update set
    days_paid          = excluded.days_paid,
    days_in_month      = excluded.days_in_month,
    gross_fcfa         = excluded.gross_fcfa,
    cnss_employee_fcfa = excluded.cnss_employee_fcfa,
    taxable_fcfa       = excluded.taxable_fcfa,
    its_fcfa           = excluded.its_fcfa,
    ortb_fcfa          = excluded.ortb_fcfa,
    net_fcfa           = excluded.net_fcfa,
    cnss_employer_fcfa = excluded.cnss_employer_fcfa,
    vps_fcfa           = excluded.vps_fcfa,
    computed_at        = now()
  where bo_payslips.status = 'brouillon'
  returning * into result;

  if result is null then
    raise exception 'Le bulletin de % pour ce mois est déjà validé — extournez l''écriture de paie avant de le recalculer',
      emp.matricule using errcode = 'P0001';
  end if;

  return result;
end;
$$;

grant execute on function public.bo_generate_payslip(uuid, date) to authenticated;

-- Génération de tous les bulletins du mois (employés présents sur la période)
create or replace function public.bo_generate_payroll(p_period date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_start date := date_trunc('month', p_period)::date;
  v_end   date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  v_count int := 0;
  rec     record;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;

  for rec in
    select e.id
    from public.bo_employees e
    where e.hired_on <= v_end
      and (e.exit_on is null or e.exit_on >= v_start)
      and e.gross_salary_fcfa > 0
      and not exists (
        select 1 from public.bo_payslips p
        where p.employee_id = e.id and p.period = v_start
          and p.status <> 'brouillon')
    order by e.matricule
  loop
    perform public.bo_generate_payslip(rec.id, v_start);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.bo_generate_payroll(date) to authenticated;

-- ---------- 11. Comptabilisation de la paie du mois ----------
-- UNE écriture OD par mois, via _bo_insert_entry (équilibre + numérotation).
--   D 661  rémunérations brutes
--   D 6641 charges sociales patronales
--   D 641  VPS (si activé)
--   C 422  net à payer au personnel
--   C 431  CNSS (part salariale + part patronale)
--   C 447  ITS + redevance ORTB retenus à la source
--   C 448  VPS à reverser (si activé)
create or replace function public.bo_post_payroll(p_period date)
returns public.bo_entries
language plpgsql security definer set search_path = public as $$
declare
  v_start   date := date_trunc('month', p_period)::date;
  v_end     date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  v_key     text := 'payroll:' || to_char(v_start, 'YYYY-MM');
  v_gross   bigint;
  v_cnss_e  bigint;
  v_cnss_r  bigint;
  v_its     bigint;
  v_net     bigint;
  v_vps     bigint;
  v_n       int;
  v_lines   jsonb;
  result    public.bo_entries;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.bo_entries where source_key = v_key) then
    raise exception 'La paie de % est déjà comptabilisée', to_char(v_start, 'MM/YYYY')
      using errcode = 'P0001';
  end if;

  select count(*),
         coalesce(sum(gross_fcfa), 0),
         coalesce(sum(cnss_employee_fcfa), 0),
         coalesce(sum(cnss_employer_fcfa), 0),
         coalesce(sum(its_fcfa + ortb_fcfa), 0),
         coalesce(sum(net_fcfa), 0),
         coalesce(sum(vps_fcfa), 0)
    into v_n, v_gross, v_cnss_e, v_cnss_r, v_its, v_net, v_vps
  from public.bo_payslips
  where period = v_start and status = 'brouillon';

  if v_n = 0 then
    raise exception 'Aucun bulletin en brouillon pour % — générez-les d''abord',
      to_char(v_start, 'MM/YYYY') using errcode = 'P0001';
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('account', '661',
      'label', 'Salaires bruts ' || to_char(v_start, 'MM/YYYY'),
      'debit', v_gross, 'credit', 0),
    jsonb_build_object('account', '6641',
      'label', 'Charges patronales CNSS ' || to_char(v_start, 'MM/YYYY'),
      'debit', v_cnss_r, 'credit', 0),
    jsonb_build_object('account', '422',
      'label', 'Net à payer au personnel', 'debit', 0, 'credit', v_net),
    jsonb_build_object('account', '431',
      'label', 'CNSS — parts salariale et patronale',
      'debit', 0, 'credit', v_cnss_e + v_cnss_r),
    jsonb_build_object('account', '447',
      'label', 'ITS retenu à la source', 'debit', 0, 'credit', v_its)
  );

  if v_vps > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account', '641',
        'label', 'Versement patronal sur salaires', 'debit', v_vps, 'credit', 0),
      jsonb_build_object('account', '448',
        'label', 'VPS à reverser', 'debit', 0, 'credit', v_vps));
  end if;

  -- Les lignes à zéro (ex. ITS nul si tous les salaires sont sous 60 000 F)
  -- sont retirées : bo_entry_lines refuse débit ET crédit à zéro.
  select jsonb_agg(l) into v_lines
  from jsonb_array_elements(v_lines) l
  where coalesce((l->>'debit')::bigint, 0) > 0
     or coalesce((l->>'credit')::bigint, 0) > 0;

  result := public._bo_insert_entry(
    'OD', v_end,
    'Paie du personnel — ' || to_char(v_start, 'MM/YYYY')
      || ' (' || v_n || ' bulletin' || case when v_n > 1 then 's' else '' end || ')',
    v_lines, 'manual', v_key, null, null);

  update public.bo_payslips
  set status = 'valide', entry_id = result.id
  where period = v_start and status = 'brouillon';

  return result;
end;
$$;

grant execute on function public.bo_post_payroll(date) to authenticated;

-- Règlement du net : D 422 / C trésorerie, bulletins marqués « payé ».
create or replace function public.bo_mark_payroll_paid(
  p_period          date,
  p_payment_account text,
  p_date            date default current_date
)
returns public.bo_entries
language plpgsql security definer set search_path = public as $$
declare
  v_start   date := date_trunc('month', p_period)::date;
  v_key     text := 'payroll_paid:' || to_char(v_start, 'YYYY-MM');
  v_net     bigint;
  v_n       int;
  v_journal text;
  result    public.bo_entries;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bo_entries where source_key = v_key) then
    raise exception 'Le règlement de la paie de % est déjà enregistré',
      to_char(v_start, 'MM/YYYY') using errcode = 'P0001';
  end if;

  select count(*), coalesce(sum(net_fcfa), 0) into v_n, v_net
  from public.bo_payslips where period = v_start and status = 'valide';

  if v_n = 0 or v_net <= 0 then
    raise exception 'Aucun bulletin validé à régler pour %', to_char(v_start, 'MM/YYYY')
      using errcode = 'P0001';
  end if;

  v_journal := case
    when p_payment_account like '52%' then 'BQ'
    when p_payment_account like '53%' then 'MM'
    when p_payment_account like '57%' then 'CS'
    else 'OD'
  end;

  result := public._bo_insert_entry(
    v_journal, p_date,
    'Règlement des salaires ' || to_char(v_start, 'MM/YYYY'),
    jsonb_build_array(
      jsonb_build_object('account', '422', 'label', 'Net payé au personnel',
                         'debit', v_net, 'credit', 0),
      jsonb_build_object('account', p_payment_account, 'label', 'Règlement des salaires',
                         'debit', 0, 'credit', v_net)),
    'manual', v_key, null, null);

  update public.bo_payslips
  set status = 'paye', paid_entry_id = result.id
  where period = v_start and status = 'valide';

  return result;
end;
$$;

grant execute on function public.bo_mark_payroll_paid(date, text, date) to authenticated;

-- ---------- 12. Décision sur une demande de congé ----------
create or replace function public.bo_decide_leave(p_id uuid, p_status text)
returns public.bo_leaves
language plpgsql security definer set search_path = public as $$
declare
  result public.bo_leaves;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;
  if p_status not in ('approuve', 'refuse', 'demande') then
    raise exception 'Statut invalide' using errcode = 'P0001';
  end if;

  update public.bo_leaves
  set status     = p_status,
      decided_by = case when p_status = 'demande' then null else auth.uid() end,
      decided_at = case when p_status = 'demande' then null else now() end
  where id = p_id
  returning * into result;

  if result is null then
    raise exception 'Demande de congé introuvable' using errcode = 'P0001';
  end if;
  return result;
end;
$$;

grant execute on function public.bo_decide_leave(uuid, text) to authenticated;

-- ---------- 13. Soldes de congés ----------
-- Acquis = leave_days_per_month × mois de service effectif révolus.
-- Pris   = jours des congés annuels approuvés.
create or replace function public.bo_leave_balances()
returns table (
  employee_id    uuid,
  matricule      text,
  employee_name  text,
  hired_on       date,
  months_service int,
  acquired_days  numeric,
  taken_days     numeric,
  balance_days   numeric
)
language sql stable security definer set search_path = public as $$
  select e.id,
         e.matricule,
         e.last_name || ' ' || e.first_names,
         e.hired_on,
         v.months::int,
         round(v.months * s.leave_days_per_month, 1),
         coalesce(v.taken, 0),
         round(v.months * s.leave_days_per_month, 1) - coalesce(v.taken, 0)
  from public.bo_employees e
  cross join public.bo_payroll_settings s
  cross join lateral (
    select
      greatest(
        extract(year  from age(least(current_date, coalesce(e.exit_on, current_date)), e.hired_on)) * 12
      + extract(month from age(least(current_date, coalesce(e.exit_on, current_date)), e.hired_on)),
        0)::numeric as months,
      (select coalesce(sum(l.days), 0)
       from public.bo_leaves l
       where l.employee_id = e.id and l.kind = 'annuel' and l.status = 'approuve') as taken
  ) v
  where public.is_admin() and s.id = 1
  order by e.status, e.matricule;
$$;

grant execute on function public.bo_leave_balances() to authenticated;

-- ---------- 14. Alertes RH (60 prochains jours) ----------
create or replace function public.bo_hr_alerts(p_days int default 60)
returns table (
  employee_id   uuid,
  matricule     text,
  employee_name text,
  kind          text,
  label         text,
  due_date      date,
  days_left     int
)
language sql stable security definer set search_path = public as $$
  with base as (
    select e.id, e.matricule, e.last_name || ' ' || e.first_names as nom,
           'periode_essai'::text as kind,
           'Fin de période d''essai'::text as label,
           e.trial_end_on as due_date
    from public.bo_employees e
    where e.status = 'actif' and e.trial_end_on is not null
    union all
    select e.id, e.matricule, e.last_name || ' ' || e.first_names,
           'fin_cdd', 'Fin de contrat à durée déterminée', e.contract_end_on
    from public.bo_employees e
    where e.status = 'actif' and e.contract_end_on is not null
    union all
    select e.id, e.matricule, e.last_name || ' ' || e.first_names,
           'cni', 'Pièce d''identité à renouveler', e.id_card_expiry
    from public.bo_employees e
    where e.status = 'actif' and e.id_card_expiry is not null
  )
  select b.id, b.matricule, b.nom, b.kind, b.label, b.due_date,
         (b.due_date - current_date)::int
  from base b
  where public.is_admin()
    and b.due_date >= current_date
    and b.due_date <= current_date + coalesce(p_days, 60)
  order by b.due_date;
$$;

grant execute on function public.bo_hr_alerts(int) to authenticated;

-- ---------- 15. Vue liste : bulletin + identité de l'employé ----------
create or replace view public.bo_payslips_view
with (security_invoker = true) as
select p.*,
       e.matricule,
       e.last_name || ' ' || e.first_names as employee_name,
       e.job_title,
       e.cnss_no
from public.bo_payslips p
join public.bo_employees e on e.id = p.employee_id;

grant select on public.bo_payslips_view to authenticated;
