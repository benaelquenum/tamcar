-- ============================================================
-- TamCar Office — Socle back-office administratif (2026-08-05)
--
--   Phase 1 du chantier « digitalisation secrétariat / trésorerie /
--   compta / RH » (app apps/back-office, plateforme autonome).
--   Ce socle pose :
--     1. Les rôles back-office : 'staff' (secrétaire) et 'accountant'
--        (expert-comptable, lecture seule) ajoutés à user_role.
--     2. La GED : bo_documents (registre courrier + coffre documentaire),
--        numérotation automatique par type et par année (bo_counters),
--        création via RPC bo_create_document (numéro attribué en base,
--        jamais côté client).
--     3. L'échéancier réglementaire : bo_deadlines + bo_complete_deadline
--        (les échéances récurrentes se reprogramment automatiquement).
--     4. La piste d'audit : bo_audit_log alimentée par triggers sur
--        toutes les tables back-office (qui a fait quoi, quand).
--     5. Le bucket Storage privé 'backoffice' + policies.
--
--   NOTE enum : les nouvelles valeurs de user_role ne sont jamais
--   utilisées comme littéraux enum dans ce script (comparaisons via
--   role::text) pour rester exécutable en une seule transaction.
-- ============================================================

-- ---------- 1. Rôles ----------
alter type public.user_role add value if not exists 'staff';
alter type public.user_role add value if not exists 'accountant';

-- Écriture back-office : fondateur (admin) + secrétariat (staff)
create or replace function public.is_backoffice()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role::text in ('admin', 'staff')
  );
$$;

-- Lecture back-office : + expert-comptable (accountant)
create or replace function public.is_backoffice_reader()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role::text in ('admin', 'staff', 'accountant')
  );
$$;

grant execute on function public.is_backoffice() to authenticated;
grant execute on function public.is_backoffice_reader() to authenticated;

-- ---------- 2. GED : documents + numérotation ----------
create table if not exists public.bo_documents (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in (
                  'courrier_arrivee', 'courrier_depart', 'piece_comptable',
                  'contrat', 'administratif', 'autre')),
  reg_number    text not null unique,
  title         text not null,
  correspondent text,
  doc_date      date,
  logged_on     date not null default current_date,
  storage_path  text,
  mime_type     text,
  size_bytes    int,
  notes         text,
  status        text not null default 'a_traiter'
                check (status in ('a_traiter', 'en_cours', 'traite', 'archive')),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists bo_documents_kind_idx on public.bo_documents (kind);
create index if not exists bo_documents_status_idx on public.bo_documents (status);
create index if not exists bo_documents_created_idx on public.bo_documents (created_at desc);

-- Compteurs de numérotation par type + année (CA-2026-0001, CD-2026-0001…)
create table if not exists public.bo_counters (
  kind    text not null,
  year    int  not null,
  last_no int  not null default 0,
  primary key (kind, year)
);

create or replace function public.bo_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bo_documents_touch on public.bo_documents;
create trigger bo_documents_touch
  before update on public.bo_documents
  for each row execute function public.bo_touch_updated_at();

-- Création d'un document : numéro attribué en base, insertion atomique.
create or replace function public.bo_create_document(
  p_kind         text,
  p_title        text,
  p_correspondent text default null,
  p_doc_date     date default null,
  p_storage_path text default null,
  p_mime_type    text default null,
  p_size_bytes   int default null,
  p_notes        text default null
)
returns public.bo_documents
language plpgsql security definer set search_path = public as $$
declare
  v_year   int := extract(year from current_date)::int;
  v_no     int;
  v_prefix text;
  result   public.bo_documents;
begin
  if not public.is_backoffice() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;

  v_prefix := case p_kind
    when 'courrier_arrivee' then 'CA'
    when 'courrier_depart'  then 'CD'
    when 'piece_comptable'  then 'PC'
    when 'contrat'          then 'CT'
    when 'administratif'    then 'AD'
    else 'DV'
  end;

  insert into public.bo_counters as c (kind, year, last_no)
  values (p_kind, v_year, 1)
  on conflict (kind, year) do update set last_no = c.last_no + 1
  returning last_no into v_no;

  insert into public.bo_documents
    (kind, reg_number, title, correspondent, doc_date,
     storage_path, mime_type, size_bytes, notes, created_by)
  values
    (p_kind,
     v_prefix || '-' || v_year || '-' || lpad(v_no::text, 4, '0'),
     p_title, nullif(trim(p_correspondent), ''), p_doc_date,
     p_storage_path, p_mime_type, p_size_bytes,
     nullif(trim(p_notes), ''), auth.uid())
  returning * into result;

  return result;
end;
$$;

grant execute on function public.bo_create_document(text, text, text, date, text, text, int, text) to authenticated;

-- RLS documents : lecture élargie (accountant), écriture staff/admin,
-- insertion UNIQUEMENT via la RPC (pas de policy insert → numérotation garantie),
-- suppression réservée à l'admin.
alter table public.bo_documents enable row level security;

drop policy if exists bo_documents_select on public.bo_documents;
create policy bo_documents_select on public.bo_documents
  for select using (public.is_backoffice_reader());

drop policy if exists bo_documents_update on public.bo_documents;
create policy bo_documents_update on public.bo_documents
  for update using (public.is_backoffice()) with check (public.is_backoffice());

drop policy if exists bo_documents_delete on public.bo_documents;
create policy bo_documents_delete on public.bo_documents
  for delete using (public.is_admin());

alter table public.bo_counters enable row level security;
-- (aucune policy : la table n'est touchée que par la RPC security definer)

grant select, update, delete on public.bo_documents to authenticated;

-- ---------- 3. Échéancier réglementaire ----------
create table if not exists public.bo_deadlines (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  category    text not null default 'Autre',
  due_date    date not null,
  amount_fcfa int,
  recurrence  text not null default 'none'
              check (recurrence in ('none', 'monthly', 'quarterly', 'yearly')),
  notes       text,
  status      text not null default 'pending' check (status in ('pending', 'done')),
  done_at     timestamptz,
  document_id uuid references public.bo_documents(id),
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists bo_deadlines_due_idx on public.bo_deadlines (status, due_date);

alter table public.bo_deadlines enable row level security;

drop policy if exists bo_deadlines_select on public.bo_deadlines;
create policy bo_deadlines_select on public.bo_deadlines
  for select using (public.is_backoffice_reader());

drop policy if exists bo_deadlines_insert on public.bo_deadlines;
create policy bo_deadlines_insert on public.bo_deadlines
  for insert with check (public.is_backoffice());

drop policy if exists bo_deadlines_update on public.bo_deadlines;
create policy bo_deadlines_update on public.bo_deadlines
  for update using (public.is_backoffice()) with check (public.is_backoffice());

drop policy if exists bo_deadlines_delete on public.bo_deadlines;
create policy bo_deadlines_delete on public.bo_deadlines
  for delete using (public.is_admin());

grant select, insert, update, delete on public.bo_deadlines to authenticated;

-- Marquer une échéance faite ; si récurrente, reprogramme la suivante.
create or replace function public.bo_complete_deadline(p_id uuid)
returns public.bo_deadlines
language plpgsql security definer set search_path = public as $$
declare
  d      public.bo_deadlines;
  result public.bo_deadlines;
begin
  if not public.is_backoffice() then
    raise exception 'Accès refusé' using errcode = 'P0001';
  end if;

  update public.bo_deadlines
  set status = 'done', done_at = now()
  where id = p_id and status = 'pending'
  returning * into d;

  if d is null then
    raise exception 'Échéance introuvable ou déjà faite' using errcode = 'P0001';
  end if;

  if d.recurrence <> 'none' then
    insert into public.bo_deadlines
      (label, category, due_date, amount_fcfa, recurrence, notes, created_by)
    values
      (d.label, d.category,
       d.due_date + case d.recurrence
         when 'monthly'   then interval '1 month'
         when 'quarterly' then interval '3 months'
         else                  interval '1 year'
       end,
       d.amount_fcfa, d.recurrence, d.notes, auth.uid())
    returning * into result;
    return result;
  end if;

  return d;
end;
$$;

grant execute on function public.bo_complete_deadline(uuid) to authenticated;

-- ---------- 4. Piste d'audit ----------
create table if not exists public.bo_audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor     uuid,
  action    text not null,            -- insert / update / delete
  entity    text not null,            -- bo_documents / bo_deadlines
  entity_id text not null,
  details   jsonb
);

create index if not exists bo_audit_log_at_idx on public.bo_audit_log (at desc);

alter table public.bo_audit_log enable row level security;

drop policy if exists bo_audit_select on public.bo_audit_log;
create policy bo_audit_select on public.bo_audit_log
  for select using (public.is_backoffice_reader());
-- (insertion uniquement via trigger security definer, aucune policy d'écriture)

grant select on public.bo_audit_log to authenticated;

create or replace function public.bo_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.bo_audit_log (actor, action, entity, entity_id, details)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(
      case when tg_op = 'DELETE' then old.id::text else new.id::text end, '?'),
    case
      when tg_op = 'UPDATE' then jsonb_build_object('avant', to_jsonb(old), 'apres', to_jsonb(new))
      when tg_op = 'DELETE' then to_jsonb(old)
      else to_jsonb(new)
    end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists bo_documents_audit on public.bo_documents;
create trigger bo_documents_audit
  after insert or update or delete on public.bo_documents
  for each row execute function public.bo_audit();

drop trigger if exists bo_deadlines_audit on public.bo_deadlines;
create trigger bo_deadlines_audit
  after insert or update or delete on public.bo_deadlines
  for each row execute function public.bo_audit();

-- ---------- 5. Storage : coffre documentaire privé ----------
insert into storage.buckets (id, name, public)
values ('backoffice', 'backoffice', false)
on conflict (id) do nothing;

drop policy if exists bo_storage_insert on storage.objects;
create policy bo_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'backoffice' and public.is_backoffice());

drop policy if exists bo_storage_select on storage.objects;
create policy bo_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'backoffice' and public.is_backoffice_reader());

drop policy if exists bo_storage_delete on storage.objects;
create policy bo_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'backoffice' and public.is_admin());
