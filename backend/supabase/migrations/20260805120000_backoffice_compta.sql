-- ============================================================
-- TamCar Office — Phase 2 : moteur comptable + trésorerie (2026-08-05)
--
--   Comptabilité en partie double sur plan SYSCOHADA révisé :
--     1. bo_accounts   : plan de comptes seedé (~90 comptes TamCar)
--     2. bo_journals   : AC achats, VE ventes, BQ banque, CS caisse,
--                        MM mobile money, OD divers, PL plateforme
--     3. bo_entries + bo_entry_lines : écritures équilibrées, numérotées
--        par journal+année, IMMUABLES (correction par extourne uniquement)
--     4. bo_record_expense : saisie assistée d'une dépense (catégorie →
--        compte de charge, mode de paiement → compte de trésorerie)
--     5. bo_sync_platform : génération AUTOMATIQUE des écritures des flux
--        plateforme (wallets) — 1 écriture de synthèse par jour :
--          · chaque wallet = compte de tiers (client 4191, revenus 4671,
--            épargne 4672, rachat 4674)
--          · contrepartie par type : argent encaissé/décaissé → 5318,
--            assurance conducteur → 4676, retraits TamAssur → 4677,
--            tout le reste → 4718 (liaison)
--          · le solde résiduel du 4718 du jour = commission TamCar
--            → soldé vers 7061 (produit). Équilibre garanti.
--     6. États : bo_trial_balance (balance), bo_account_ledger (grand
--        livre), bo_treasury_position (soldes trésorerie),
--        bo_platform_float (encours wallets plateforme)
-- ============================================================

-- ---------- 1. Plan de comptes ----------
create table if not exists public.bo_accounts (
  code       text primary key,
  label      text not null,
  class      int  not null check (class between 1 and 9),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.bo_accounts enable row level security;

drop policy if exists bo_accounts_select on public.bo_accounts;
create policy bo_accounts_select on public.bo_accounts
  for select using (public.is_backoffice_reader());

drop policy if exists bo_accounts_write on public.bo_accounts;
create policy bo_accounts_write on public.bo_accounts
  for insert with check (public.is_backoffice());

drop policy if exists bo_accounts_update on public.bo_accounts;
create policy bo_accounts_update on public.bo_accounts
  for update using (public.is_backoffice()) with check (public.is_backoffice());

grant select, insert, update on public.bo_accounts to authenticated;

insert into public.bo_accounts (code, label, class) values
  -- Classe 1 — financement permanent
  ('101',  'Capital social', 1),
  ('104',  'Primes liées au capital', 1),
  ('109',  'Apporteurs, capital souscrit non appelé', 1),
  ('111',  'Réserve légale', 1),
  ('118',  'Autres réserves', 1),
  ('121',  'Report à nouveau créditeur', 1),
  ('129',  'Report à nouveau débiteur', 1),
  ('131',  'Résultat net — bénéfice', 1),
  ('139',  'Résultat net — perte', 1),
  ('141',  'Subventions d''investissement', 1),
  ('162',  'Emprunts auprès des établissements de crédit', 1),
  ('165',  'Dépôts et cautionnements reçus', 1),
  ('168',  'Autres emprunts et dettes', 1),
  ('173',  'Dettes de location-acquisition — mobilier', 1),
  ('191',  'Provisions pour risques et charges', 1),
  -- Classe 2 — actif immobilisé
  ('211',  'Frais de développement', 2),
  ('212',  'Brevets, licences et droits similaires', 2),
  ('213',  'Logiciels et sites internet', 2),
  ('215',  'Fonds commercial', 2),
  ('221',  'Terrains', 2),
  ('231',  'Bâtiments', 2),
  ('235',  'Aménagements et agencements', 2),
  ('2441', 'Matériel de bureau', 2),
  ('2442', 'Matériel informatique', 2),
  ('2444', 'Mobilier de bureau', 2),
  ('2451', 'Matériel de transport — tricycles', 2),
  ('2452', 'Matériel de transport — motos', 2),
  ('2458', 'Matériel de transport — autres véhicules', 2),
  ('252',  'Avances versées sur immobilisations corporelles', 2),
  ('275',  'Dépôts et cautionnements versés', 2),
  ('2813', 'Amortissements — logiciels', 2),
  ('2835', 'Amortissements — aménagements', 2),
  ('2844', 'Amortissements — matériel et mobilier', 2),
  ('2845', 'Amortissements — matériel de transport', 2),
  -- Classe 4 — tiers
  ('401',  'Fournisseurs', 4),
  ('4081', 'Fournisseurs — factures non parvenues', 4),
  ('4091', 'Fournisseurs — avances et acomptes versés', 4),
  ('411',  'Clients', 4),
  ('4181', 'Clients — factures à établir', 4),
  ('4191', 'Clients — avances reçues (wallets TamCar Crédit)', 4),
  ('421',  'Personnel — avances et acomptes', 4),
  ('422',  'Personnel — rémunérations dues', 4),
  ('431',  'Sécurité sociale (CNSS)', 4),
  ('441',  'État — impôt sur les bénéfices', 4),
  ('443',  'État — TVA facturée', 4),
  ('445',  'État — TVA récupérable', 4),
  ('447',  'État — impôts retenus à la source (ITS, AIB)', 4),
  ('448',  'État — autres impôts et taxes', 4),
  ('462',  'Associés — comptes courants', 4),
  ('4671', 'Chauffeurs et partenaires — comptes Revenus', 4),
  ('4672', 'Chauffeurs — épargne TamAssur', 4),
  ('4673', 'Partenaires véhicule — parts à reverser', 4),
  ('4674', 'Chauffeurs — séquestre rachat', 4),
  ('4676', 'Assurance conducteur collectée', 4),
  ('4677', 'Épargne TamAssur — retraits à payer', 4),
  ('4718', 'Plateforme — compte de liaison', 4),
  ('476',  'Charges constatées d''avance', 4),
  ('477',  'Produits constatés d''avance', 4),
  -- Classe 5 — trésorerie
  ('5211', 'Banque principale', 5),
  ('5218', 'Autres comptes bancaires', 5),
  ('5311', 'Mobile Money — MTN', 5),
  ('5312', 'Mobile Money — Moov', 5),
  ('5313', 'Mobile Money — Celtiis', 5),
  ('5318', 'Agrégateur de paiement (FeexPay / FedaPay)', 5),
  ('571',  'Caisse', 5),
  ('585',  'Virements de fonds internes', 5),
  -- Classe 6 — charges
  ('6051', 'Fournitures non stockables — eau, énergie', 6),
  ('6052', 'Carburants et lubrifiants', 6),
  ('6055', 'Fournitures de bureau', 6),
  ('6058', 'Autres achats', 6),
  ('618',  'Autres frais de transport et déplacements', 6),
  ('622',  'Locations et charges locatives', 6),
  ('624',  'Entretien, réparations et maintenance', 6),
  ('625',  'Primes d''assurance', 6),
  ('627',  'Publicité, publications, relations publiques', 6),
  ('6281', 'Frais de télécommunications et internet', 6),
  ('6288', 'Hébergement et services numériques', 6),
  ('631',  'Frais bancaires', 6),
  ('6318', 'Frais Mobile Money et agrégateurs', 6),
  ('632',  'Rémunérations d''intermédiaires et de conseils', 6),
  ('633',  'Frais de formation', 6),
  ('638',  'Autres charges externes', 6),
  ('641',  'Impôts et taxes directs (patente)', 6),
  ('646',  'Droits d''enregistrement', 6),
  ('648',  'Autres impôts et taxes (redevances ANATT…)', 6),
  ('658',  'Charges diverses', 6),
  ('661',  'Rémunérations directes du personnel', 6),
  ('6641', 'Charges sociales — CNSS', 6),
  ('668',  'Autres charges sociales', 6),
  ('671',  'Intérêts des emprunts', 6),
  ('681',  'Dotations aux amortissements d''exploitation', 6),
  -- Classe 7 — produits
  ('7061', 'Commissions sur courses', 7),
  ('7062', 'Frais de service et de mise en relation', 7),
  ('7063', 'Pass mobilité (TamPass)', 7),
  ('7065', 'Revenus de flotte (location-vente)', 7),
  ('7068', 'Autres prestations de services', 7),
  ('707',  'Produits accessoires', 7),
  ('758',  'Produits divers', 7),
  ('771',  'Intérêts et produits financiers', 7),
  -- Classe 8 — HAO et impôt
  ('831',  'Charges hors activités ordinaires', 8),
  ('841',  'Produits hors activités ordinaires', 8),
  ('891',  'Impôts sur les bénéfices', 8)
on conflict (code) do nothing;

-- ---------- 2. Journaux ----------
create table if not exists public.bo_journals (
  code  text primary key,
  label text not null
);

alter table public.bo_journals enable row level security;

drop policy if exists bo_journals_select on public.bo_journals;
create policy bo_journals_select on public.bo_journals
  for select using (public.is_backoffice_reader());

grant select on public.bo_journals to authenticated;

insert into public.bo_journals (code, label) values
  ('AC', 'Achats'),
  ('VE', 'Ventes et prestations'),
  ('BQ', 'Banque'),
  ('CS', 'Caisse'),
  ('MM', 'Mobile Money'),
  ('OD', 'Opérations diverses'),
  ('PL', 'Plateforme (automatique)')
on conflict (code) do nothing;

-- ---------- 3. Écritures ----------
create table if not exists public.bo_entries (
  id           uuid primary key default gen_random_uuid(),
  journal_code text not null references public.bo_journals(code),
  entry_no     text not null unique,
  entry_date   date not null,
  label        text not null,
  document_id  uuid references public.bo_documents(id),
  source       text not null default 'manual'
               check (source in ('manual', 'expense', 'platform', 'reversal')),
  source_key   text,
  reverses     uuid references public.bo_entries(id),
  reversed_by  uuid references public.bo_entries(id),
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

create unique index if not exists bo_entries_source_key_idx
  on public.bo_entries (source_key) where source_key is not null;
create index if not exists bo_entries_date_idx on public.bo_entries (entry_date desc);
create index if not exists bo_entries_journal_idx on public.bo_entries (journal_code);

create table if not exists public.bo_entry_lines (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.bo_entries(id) on delete cascade,
  line_no      int  not null,
  account_code text not null references public.bo_accounts(code),
  label        text,
  debit_fcfa   bigint not null default 0 check (debit_fcfa >= 0),
  credit_fcfa  bigint not null default 0 check (credit_fcfa >= 0),
  check (debit_fcfa = 0 or credit_fcfa = 0),
  check (debit_fcfa > 0 or credit_fcfa > 0)
);

create index if not exists bo_entry_lines_entry_idx on public.bo_entry_lines (entry_id);
create index if not exists bo_entry_lines_account_idx on public.bo_entry_lines (account_code);

-- RLS : lecture back-office élargie ; AUCUNE écriture directe (tout passe
-- par les RPC security definer → équilibre et numérotation garantis,
-- pas de policy update/delete → écritures immuables, correction par extourne).
alter table public.bo_entries enable row level security;
alter table public.bo_entry_lines enable row level security;

drop policy if exists bo_entries_select on public.bo_entries;
create policy bo_entries_select on public.bo_entries
  for select using (public.is_backoffice_reader());

drop policy if exists bo_entry_lines_select on public.bo_entry_lines;
create policy bo_entry_lines_select on public.bo_entry_lines
  for select using (public.is_backoffice_reader());

grant select on public.bo_entries, public.bo_entry_lines to authenticated;

-- Piste d'audit sur les écritures
drop trigger if exists bo_entries_audit on public.bo_entries;
create trigger bo_entries_audit
  after insert or update or delete on public.bo_entries
  for each row execute function public.bo_audit();

-- Vue liste : écriture + total mouvement
create or replace view public.bo_entries_view
with (security_invoker = true) as
select e.*,
       coalesce((select sum(l.debit_fcfa) from public.bo_entry_lines l
                 where l.entry_id = e.id), 0) as total_fcfa,
       (select count(*) from public.bo_entry_lines l
        where l.entry_id = e.id) as line_count
from public.bo_entries e;

grant select on public.bo_entries_view to authenticated;

-- Insertion interne : valide, numérote, équilibre. Jamais exposée.
create or replace function public._bo_insert_entry(
  p_journal    text,
  p_date       date,
  p_label      text,
  p_lines      jsonb,          -- [{account, label, debit, credit}]
  p_source     text default 'manual',
  p_source_key text default null,
  p_document_id uuid default null,
  p_reverses   uuid default null
)
returns public.bo_entries
language plpgsql security definer set search_path = public as $$
declare
  v_year   int := extract(year from p_date)::int;
  v_no     int;
  v_line   jsonb;
  v_i      int := 0;
  v_debit  bigint := 0;
  v_credit bigint := 0;
  result   public.bo_entries;
begin
  if p_label is null or trim(p_label) = '' then
    raise exception 'Libellé obligatoire' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) < 2 then
    raise exception 'Une écriture comporte au moins 2 lignes' using errcode = 'P0001';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_debit  := v_debit  + coalesce((v_line->>'debit')::bigint, 0);
    v_credit := v_credit + coalesce((v_line->>'credit')::bigint, 0);
    if not exists (select 1 from public.bo_accounts
                   where code = v_line->>'account' and is_active) then
      raise exception 'Compte % inconnu ou inactif', v_line->>'account'
        using errcode = 'P0001';
    end if;
  end loop;

  if v_debit <> v_credit or v_debit = 0 then
    raise exception 'Écriture déséquilibrée : débits % / crédits %', v_debit, v_credit
      using errcode = 'P0001';
  end if;

  insert into public.bo_counters as c (kind, year, last_no)
  values ('piece:' || p_journal, v_year, 1)
  on conflict (kind, year) do update set last_no = c.last_no + 1
  returning last_no into v_no;

  insert into public.bo_entries
    (journal_code, entry_no, entry_date, label, document_id,
     source, source_key, reverses, created_by)
  values
    (p_journal,
     p_journal || '-' || v_year || '-' || lpad(v_no::text, 4, '0'),
     p_date, trim(p_label), p_document_id, p_source, p_source_key,
     p_reverses, auth.uid())
  returning * into result;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_i := v_i + 1;
    insert into public.bo_entry_lines
      (entry_id, line_no, account_code, label, debit_fcfa, credit_fcfa)
    values
      (result.id, v_i, v_line->>'account',
       nullif(trim(coalesce(v_line->>'label', '')), ''),
       coalesce((v_line->>'debit')::bigint, 0),
       coalesce((v_line->>'credit')::bigint, 0));
  end loop;

  return result;
end;
$$;

-- Saisie libre (journal OD ou autre) — réservée admin + staff
create or replace function public.bo_post_entry(
  p_journal     text,
  p_date        date,
  p_label       text,
  p_lines       jsonb,
  p_document_id uuid default null
)
returns public.bo_entries
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_backoffice() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;
  if p_journal = 'PL' then
    raise exception 'Le journal PL est réservé aux écritures automatiques'
      using errcode = 'P0001';
  end if;
  return public._bo_insert_entry(p_journal, p_date, p_label, p_lines,
                                 'manual', null, p_document_id, null);
end;
$$;

grant execute on function public.bo_post_entry(text, date, text, jsonb, uuid) to authenticated;

-- Extourne (contre-passation) : seule façon de corriger une écriture
create or replace function public.bo_reverse_entry(p_entry_id uuid)
returns public.bo_entries
language plpgsql security definer set search_path = public as $$
declare
  e      public.bo_entries;
  v_lines jsonb;
  result public.bo_entries;
begin
  if not public.is_backoffice() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;

  select * into e from public.bo_entries where id = p_entry_id;
  if e is null then raise exception 'Écriture introuvable' using errcode = 'P0001'; end if;
  if e.reversed_by is not null then
    raise exception 'Écriture déjà extournée' using errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_build_object(
           'account', l.account_code,
           'label',   coalesce(l.label, 'Extourne'),
           'debit',   l.credit_fcfa,
           'credit',  l.debit_fcfa) order by l.line_no)
  into v_lines
  from public.bo_entry_lines l where l.entry_id = e.id;

  result := public._bo_insert_entry(
    e.journal_code, current_date,
    'EXTOURNE ' || e.entry_no || ' — ' || e.label,
    v_lines, 'reversal', null, e.document_id, e.id);

  update public.bo_entries set reversed_by = result.id where id = e.id;
  return result;
end;
$$;

grant execute on function public.bo_reverse_entry(uuid) to authenticated;

-- ---------- 4. Saisie assistée des dépenses ----------
create table if not exists public.bo_expense_categories (
  code         text primary key,
  label        text not null,
  account_code text not null references public.bo_accounts(code),
  sort         int  not null default 100
);

alter table public.bo_expense_categories enable row level security;

drop policy if exists bo_expense_categories_select on public.bo_expense_categories;
create policy bo_expense_categories_select on public.bo_expense_categories
  for select using (public.is_backoffice_reader());

grant select on public.bo_expense_categories to authenticated;

insert into public.bo_expense_categories (code, label, account_code, sort) values
  ('loyer',          'Loyer et charges des bureaux',            '622',  10),
  ('eau_energie',    'Eau et électricité',                      '6051', 20),
  ('carburant',      'Carburant',                               '6052', 30),
  ('fournitures',    'Fournitures de bureau',                   '6055', 40),
  ('entretien',      'Entretien et réparations',                '624',  50),
  ('assurances',     'Assurances',                              '625',  60),
  ('marketing',      'Marketing et communication',              '627',  70),
  ('telecom',        'Téléphone, internet, SMS',                '6281', 80),
  ('numerique',      'Hébergement et services numériques',      '6288', 90),
  ('frais_bancaires','Frais bancaires',                         '631',  100),
  ('frais_momo',     'Frais Mobile Money / agrégateur',         '6318', 110),
  ('honoraires',     'Honoraires et commissions',               '632',  120),
  ('deplacements',   'Transports et déplacements',              '618',  130),
  ('impots_taxes',   'Impôts, taxes et redevances (ANATT…)',    '648',  140),
  ('salaires',       'Salaires (net payé)',                     '661',  150),
  ('cnss',           'Cotisations CNSS',                        '6641', 160),
  ('autres',         'Autres dépenses',                         '658',  170)
on conflict (code) do nothing;

-- Dépense : débit compte de charge, crédit trésorerie (ou 401 si à crédit).
create or replace function public.bo_record_expense(
  p_date            date,
  p_category        text,
  p_amount_fcfa     bigint,
  p_supplier        text default null,
  p_payment_account text default null,   -- 5211/5311/5312/571… ; null = à crédit (401)
  p_document_id     uuid default null,
  p_notes           text default null
)
returns public.bo_entries
language plpgsql security definer set search_path = public as $$
declare
  v_cat     public.bo_expense_categories;
  v_journal text;
  v_credit  text;
  v_label   text;
begin
  if not public.is_backoffice() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;
  if p_amount_fcfa is null or p_amount_fcfa <= 0 then
    raise exception 'Montant invalide' using errcode = 'P0001';
  end if;

  select * into v_cat from public.bo_expense_categories where code = p_category;
  if v_cat is null then
    raise exception 'Catégorie % inconnue', p_category using errcode = 'P0001';
  end if;

  if p_payment_account is null then
    v_credit := '401'; v_journal := 'AC';
  else
    v_credit := p_payment_account;
    v_journal := case
      when p_payment_account like '52%' then 'BQ'
      when p_payment_account like '53%' then 'MM'
      when p_payment_account like '57%' then 'CS'
      else 'OD'
    end;
  end if;

  v_label := v_cat.label
    || coalesce(' — ' || nullif(trim(p_supplier), ''), '')
    || coalesce(' (' || nullif(trim(p_notes), '') || ')', '');

  return public._bo_insert_entry(
    v_journal, p_date, v_label,
    jsonb_build_array(
      jsonb_build_object('account', v_cat.account_code,
                         'label', nullif(trim(p_supplier), ''),
                         'debit', p_amount_fcfa, 'credit', 0),
      jsonb_build_object('account', v_credit,
                         'label', nullif(trim(p_supplier), ''),
                         'debit', 0, 'credit', p_amount_fcfa)
    ),
    'expense', null, p_document_id, null);
end;
$$;

grant execute on function public.bo_record_expense(date, text, bigint, text, text, uuid, text) to authenticated;

-- ---------- 5. Synchronisation des flux plateforme ----------
-- 1 écriture PL par jour. Idempotent (source_key 'platform:<jour>').
create or replace function public.bo_sync_platform(
  p_through date default (now() at time zone 'Africa/Porto-Novo')::date - 1
)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_day    date;
  v_count  int := 0;
  v_lines  jsonb;
  v_dr4718 bigint;
  v_cr4718 bigint;
  rec      record;
begin
  if not public.is_backoffice() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;

  for v_day in
    select distinct (t.created_at at time zone 'Africa/Porto-Novo')::date
    from public.wallet_transactions t
    where t.status = 'success'
      and (t.created_at at time zone 'Africa/Porto-Novo')::date <= p_through
      and not exists (
        select 1 from public.bo_entries e
        where e.source_key = 'platform:' ||
              ((t.created_at at time zone 'Africa/Porto-Novo')::date)::text)
    order by 1
  loop
    v_lines := '[]'::jsonb;
    v_dr4718 := 0;
    v_cr4718 := 0;

    for rec in
      select t.type::text as tx_type,
             w.kind::text as wallet_kind,
             sum(case when t.amount_fcfa > 0 then t.amount_fcfa else 0 end)::bigint as credited,
             sum(case when t.amount_fcfa < 0 then -t.amount_fcfa else 0 end)::bigint as debited
      from public.wallet_transactions t
      join public.wallets w on w.id = t.wallet_id
      where t.status = 'success'
        and (t.created_at at time zone 'Africa/Porto-Novo')::date = v_day
      group by 1, 2
    loop
      declare
        v_wallet_acc text := case rec.wallet_kind
          when 'tamcar_credit'  then '4191'
          when 'tamcar_revenus' then '4671'
          when 'tamcar_epargne' then '4672'
          when 'tamcar_rachat'  then '4674'
          else '4671'
        end;
        v_other text := case rec.tx_type
          when 'topup'               then '5318'
          when 'debt_settlement'     then '5318'
          when 'withdrawal'          then '5318'
          when 'insurance_premium'   then '4676'
          when 'tamassur_withdrawal' then '4677'
          else '4718'
        end;
        v_lbl text;
      begin
        v_lbl := rec.tx_type || ' (' || rec.wallet_kind || ')';

        -- Wallet crédité (avoir du tiers augmente) : C wallet / D contrepartie
        if rec.credited > 0 then
          v_lines := v_lines
            || jsonb_build_array(
                 jsonb_build_object('account', v_other, 'label', v_lbl,
                                    'debit', rec.credited, 'credit', 0),
                 jsonb_build_object('account', v_wallet_acc, 'label', v_lbl,
                                    'debit', 0, 'credit', rec.credited));
          if v_other = '4718' then v_dr4718 := v_dr4718 + rec.credited; end if;
        end if;

        -- Wallet débité (avoir du tiers diminue) : D wallet / C contrepartie
        if rec.debited > 0 then
          v_lines := v_lines
            || jsonb_build_array(
                 jsonb_build_object('account', v_wallet_acc, 'label', v_lbl,
                                    'debit', rec.debited, 'credit', 0),
                 jsonb_build_object('account', v_other, 'label', v_lbl,
                                    'debit', 0, 'credit', rec.debited));
          if v_other = '4718' then v_cr4718 := v_cr4718 + rec.debited; end if;
        end if;
      end;
    end loop;

    if jsonb_array_length(v_lines) = 0 then continue; end if;

    -- Solde du compte de liaison = commission TamCar du jour → 7061
    if v_cr4718 > v_dr4718 then
      v_lines := v_lines
        || jsonb_build_array(
             jsonb_build_object('account', '4718',
               'label', 'Commission plateforme du jour', 'debit', v_cr4718 - v_dr4718, 'credit', 0),
             jsonb_build_object('account', '7061',
               'label', 'Commission plateforme du jour', 'debit', 0, 'credit', v_cr4718 - v_dr4718));
    elsif v_dr4718 > v_cr4718 then
      v_lines := v_lines
        || jsonb_build_array(
             jsonb_build_object('account', '7061',
               'label', 'Régularisation commissions', 'debit', v_dr4718 - v_cr4718, 'credit', 0),
             jsonb_build_object('account', '4718',
               'label', 'Régularisation commissions', 'debit', 0, 'credit', v_dr4718 - v_cr4718));
    end if;

    perform public._bo_insert_entry(
      'PL', v_day, 'Activité plateforme du ' || to_char(v_day, 'DD/MM/YYYY'),
      v_lines, 'platform', 'platform:' || v_day::text, null, null);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.bo_sync_platform(date) to authenticated;

-- ---------- 6. États ----------
-- Balance générale sur période
create or replace function public.bo_trial_balance(
  p_from date default null,
  p_to   date default null
)
returns table (
  account_code  text,
  account_label text,
  class         int,
  total_debit   bigint,
  total_credit  bigint,
  balance_fcfa  bigint            -- positif = solde débiteur
)
language sql stable security definer set search_path = public as $$
  select a.code, a.label, a.class,
         coalesce(sum(l.debit_fcfa), 0)::bigint,
         coalesce(sum(l.credit_fcfa), 0)::bigint,
         (coalesce(sum(l.debit_fcfa), 0) - coalesce(sum(l.credit_fcfa), 0))::bigint
  from public.bo_accounts a
  join public.bo_entry_lines l on l.account_code = a.code
  join public.bo_entries e on e.id = l.entry_id
  where public.is_backoffice_reader()
    and (p_from is null or e.entry_date >= p_from)
    and (p_to   is null or e.entry_date <= p_to)
  group by a.code, a.label, a.class
  having coalesce(sum(l.debit_fcfa), 0) <> 0 or coalesce(sum(l.credit_fcfa), 0) <> 0
  order by a.code;
$$;

grant execute on function public.bo_trial_balance(date, date) to authenticated;

-- Grand livre d'un compte
create or replace function public.bo_account_ledger(
  p_account text,
  p_from    date default null,
  p_to      date default null
)
returns table (
  entry_id    uuid,
  entry_no    text,
  entry_date  date,
  journal     text,
  label       text,
  debit_fcfa  bigint,
  credit_fcfa bigint
)
language sql stable security definer set search_path = public as $$
  select e.id, e.entry_no, e.entry_date, e.journal_code,
         coalesce(l.label, e.label),
         l.debit_fcfa::bigint, l.credit_fcfa::bigint
  from public.bo_entry_lines l
  join public.bo_entries e on e.id = l.entry_id
  where public.is_backoffice_reader()
    and l.account_code = p_account
    and (p_from is null or e.entry_date >= p_from)
    and (p_to   is null or e.entry_date <= p_to)
  order by e.entry_date, e.entry_no, l.line_no;
$$;

grant execute on function public.bo_account_ledger(text, date, date) to authenticated;

-- Position de trésorerie (comptes classe 5, hors virements internes)
create or replace function public.bo_treasury_position()
returns table (
  account_code  text,
  account_label text,
  balance_fcfa  bigint
)
language sql stable security definer set search_path = public as $$
  select a.code, a.label,
         (coalesce(sum(l.debit_fcfa), 0) - coalesce(sum(l.credit_fcfa), 0))::bigint
  from public.bo_accounts a
  left join public.bo_entry_lines l on l.account_code = a.code
  left join public.bo_entries e on e.id = l.entry_id
  where public.is_backoffice_reader()
    and a.class = 5 and a.code <> '585'
  group by a.code, a.label
  order by a.code;
$$;

grant execute on function public.bo_treasury_position() to authenticated;

-- Encours des wallets plateforme (float) — information temps réel
create or replace function public.bo_platform_float()
returns table (kind text, balance_fcfa bigint, wallet_count int)
language sql stable security definer set search_path = public as $$
  select w.kind::text, coalesce(sum(w.balance_fcfa), 0)::bigint, count(*)::int
  from public.wallets w
  where public.is_backoffice_reader()
  group by w.kind
  order by w.kind;
$$;

grant execute on function public.bo_platform_float() to authenticated;
