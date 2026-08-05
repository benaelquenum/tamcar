-- ============================================================
-- TamCar Office — Phase 2b : rôles verrouillés + opérations IA (2026-08-05)
--
--   1. VERROUILLAGE DES RÔLES (décision Terence) : la secrétaire (staff)
--      renseigne des OPÉRATIONS, elle ne passe jamais d'écriture :
--        · bo_post_entry (saisie libre) : réservée à l'admin
--        · bo_reverse_entry (extourne) : réservée à l'admin
--        · bo_record_expense : réservée à l'admin (le staff passe par
--          bo_submit_operation, qui applique le seuil de validation)
--   2. FILE DE VALIDATION : bo_pending_operations. Une opération soumise
--      par le staff est comptabilisée immédiatement si montant ≤ 100 000 F
--      ET confiance IA ≥ 0.75 ; sinon elle attend la décision du fondateur
--      (bo_decide_operation). L'admin est toujours comptabilisé direct.
--   3. La logique d'écriture de dépense passe dans _bo_expense_entry
--      (interne, sans contrôle d'accès) partagée par les deux chemins.
-- ============================================================

-- ---------- 1. Logique de dépense partagée (interne) ----------
create or replace function public._bo_expense_entry(
  p_date            date,
  p_category        text,
  p_amount_fcfa     bigint,
  p_supplier        text,
  p_payment_account text,
  p_document_id     uuid,
  p_notes           text
)
returns public.bo_entries
language plpgsql security definer set search_path = public as $$
declare
  v_cat     public.bo_expense_categories;
  v_journal text;
  v_credit  text;
  v_label   text;
begin
  if p_amount_fcfa is null or p_amount_fcfa <= 0 then
    raise exception 'Montant invalide' using errcode = 'P0001';
  end if;

  select * into v_cat from public.bo_expense_categories where code = p_category;
  if v_cat is null then
    raise exception 'Catégorie % inconnue', p_category using errcode = 'P0001';
  end if;

  if p_payment_account is null or p_payment_account = '' then
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

-- ---------- 2. Verrouillage : admin uniquement ----------
create or replace function public.bo_record_expense(
  p_date            date,
  p_category        text,
  p_amount_fcfa     bigint,
  p_supplier        text default null,
  p_payment_account text default null,
  p_document_id     uuid default null,
  p_notes           text default null
)
returns public.bo_entries
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé au fondateur' using errcode = 'P0001';
  end if;
  return public._bo_expense_entry(p_date, p_category, p_amount_fcfa,
    p_supplier, p_payment_account, p_document_id, p_notes);
end;
$$;

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
  if not public.is_admin() then
    raise exception 'La saisie libre d''écritures est réservée au fondateur'
      using errcode = 'P0001';
  end if;
  if p_journal = 'PL' then
    raise exception 'Le journal PL est réservé aux écritures automatiques'
      using errcode = 'P0001';
  end if;
  return public._bo_insert_entry(p_journal, p_date, p_label, p_lines,
                                 'manual', null, p_document_id, null);
end;
$$;

create or replace function public.bo_reverse_entry(p_entry_id uuid)
returns public.bo_entries
language plpgsql security definer set search_path = public as $$
declare
  e      public.bo_entries;
  v_lines jsonb;
  result public.bo_entries;
begin
  if not public.is_admin() then
    raise exception 'L''extourne est réservée au fondateur' using errcode = 'P0001';
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

-- ---------- 3. File de validation des opérations ----------
create table if not exists public.bo_pending_operations (
  id              uuid primary key default gen_random_uuid(),
  raw_text        text,
  document_id     uuid references public.bo_documents(id),
  category        text not null references public.bo_expense_categories(code),
  amount_fcfa     bigint not null check (amount_fcfa > 0),
  supplier        text,
  op_date         date not null default current_date,
  payment_account text,
  notes           text,
  confidence      numeric,
  status          text not null default 'pending'
                  check (status in ('pending', 'posted', 'rejected')),
  entry_id        uuid references public.bo_entries(id),
  reject_reason   text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  decided_by      uuid references public.profiles(id),
  decided_at      timestamptz
);

create index if not exists bo_pending_ops_status_idx
  on public.bo_pending_operations (status, created_at desc);

alter table public.bo_pending_operations enable row level security;

drop policy if exists bo_pending_ops_select on public.bo_pending_operations;
create policy bo_pending_ops_select on public.bo_pending_operations
  for select using (public.is_backoffice_reader());
-- (écriture uniquement via les RPC security definer)

grant select on public.bo_pending_operations to authenticated;

drop trigger if exists bo_pending_ops_audit on public.bo_pending_operations;
create trigger bo_pending_ops_audit
  after insert or update or delete on public.bo_pending_operations
  for each row execute function public.bo_audit();

-- Soumission d'une opération (staff + admin).
--   Comptabilisation directe si : admin, OU montant ≤ 100 000 F ET
--   confiance ≥ 0.75. Sinon : en attente de validation du fondateur.
create or replace function public.bo_submit_operation(
  p_category        text,
  p_amount_fcfa     bigint,
  p_date            date default current_date,
  p_supplier        text default null,
  p_payment_account text default null,
  p_document_id     uuid default null,
  p_notes           text default null,
  p_raw_text        text default null,
  p_confidence      numeric default null
)
returns public.bo_pending_operations
language plpgsql security definer set search_path = public as $$
declare
  v_direct boolean;
  v_row    public.bo_pending_operations;
  v_entry  public.bo_entries;
begin
  if not public.is_backoffice() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;
  if p_amount_fcfa is null or p_amount_fcfa <= 0 then
    raise exception 'Montant invalide' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.bo_expense_categories where code = p_category) then
    raise exception 'Catégorie % inconnue', p_category using errcode = 'P0001';
  end if;

  v_direct := public.is_admin()
    or (p_amount_fcfa <= 100000 and coalesce(p_confidence, 1) >= 0.75);

  insert into public.bo_pending_operations
    (raw_text, document_id, category, amount_fcfa, supplier, op_date,
     payment_account, notes, confidence, created_by)
  values
    (nullif(trim(coalesce(p_raw_text, '')), ''), p_document_id, p_category,
     p_amount_fcfa, nullif(trim(coalesce(p_supplier, '')), ''),
     coalesce(p_date, current_date),
     nullif(p_payment_account, ''), nullif(trim(coalesce(p_notes, '')), ''),
     p_confidence, auth.uid())
  returning * into v_row;

  if v_direct then
    v_entry := public._bo_expense_entry(
      v_row.op_date, v_row.category, v_row.amount_fcfa, v_row.supplier,
      v_row.payment_account, v_row.document_id, v_row.notes);
    update public.bo_pending_operations
    set status = 'posted', entry_id = v_entry.id,
        decided_by = auth.uid(), decided_at = now()
    where id = v_row.id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

grant execute on function public.bo_submit_operation(text, bigint, date, text, text, uuid, text, text, numeric) to authenticated;

-- Décision du fondateur sur une opération en attente.
create or replace function public.bo_decide_operation(
  p_id      uuid,
  p_approve boolean,
  p_reason  text default null
)
returns public.bo_pending_operations
language plpgsql security definer set search_path = public as $$
declare
  v_row   public.bo_pending_operations;
  v_entry public.bo_entries;
begin
  if not public.is_admin() then
    raise exception 'Réservé au fondateur' using errcode = 'P0001';
  end if;

  select * into v_row from public.bo_pending_operations
  where id = p_id and status = 'pending'
  for update;
  if v_row is null then
    raise exception 'Opération introuvable ou déjà décidée' using errcode = 'P0001';
  end if;

  if p_approve then
    v_entry := public._bo_expense_entry(
      v_row.op_date, v_row.category, v_row.amount_fcfa, v_row.supplier,
      v_row.payment_account, v_row.document_id, v_row.notes);
    update public.bo_pending_operations
    set status = 'posted', entry_id = v_entry.id,
        decided_by = auth.uid(), decided_at = now()
    where id = p_id
    returning * into v_row;
  else
    update public.bo_pending_operations
    set status = 'rejected', reject_reason = nullif(trim(coalesce(p_reason, '')), ''),
        decided_by = auth.uid(), decided_at = now()
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

grant execute on function public.bo_decide_operation(uuid, boolean, text) to authenticated;
