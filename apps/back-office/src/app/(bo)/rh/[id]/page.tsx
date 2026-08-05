import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { DOC_KIND_LABELS, formatDate, formatFcfa, type BoDocument } from '@/lib/bo';
import {
  CONTRACT_LABELS,
  EMPLOYEE_STATUS_LABELS,
  LEAVE_KIND_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_STYLES,
  PAYSLIP_STATUS_LABELS,
  PAYSLIP_STATUS_STYLES,
  employeeName,
  formatPeriod,
  type BoEmployee,
  type BoLeave,
  type BoLeaveBalance,
  type BoPayslip,
} from '@/lib/rh';
import { ChevronLeftIcon } from '@/components/Icon';
import { AttachDocumentForm } from './AttachDocumentForm';
import { ExitEmployeeForm } from './ExitEmployeeForm';

export const dynamic = 'force-dynamic';

type AttachedRow = { document_id: string; note: string | null; bo_documents: BoDocument };

export default async function EmployeeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();

  const { data: employee } = await supabase
    .from('bo_employees')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (!employee) notFound();
  const emp = employee as BoEmployee;

  const [{ data: attached }, { data: leaves }, { data: payslips }, { data: balances }, { data: docs }] =
    await Promise.all([
      supabase
        .from('bo_employee_documents')
        .select('document_id, note, bo_documents(*)')
        .eq('employee_id', emp.id),
      supabase
        .from('bo_leaves')
        .select('*')
        .eq('employee_id', emp.id)
        .order('start_on', { ascending: false }),
      supabase
        .from('bo_payslips')
        .select('*')
        .eq('employee_id', emp.id)
        .order('period', { ascending: false }),
      supabase.rpc('bo_leave_balances'),
      supabase
        .from('bo_documents')
        .select('id, reg_number, title, kind')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

  const rows = (attached ?? []) as unknown as AttachedRow[];
  const leaveRows = (leaves ?? []) as BoLeave[];
  const slips = (payslips ?? []) as BoPayslip[];
  const balance = ((balances ?? []) as BoLeaveBalance[]).find(
    (b) => b.employee_id === emp.id,
  );
  const availableDocs = (docs ?? []) as Pick<
    BoDocument,
    'id' | 'reg_number' | 'title' | 'kind'
  >[];
  const attachedIds = new Set(rows.map((r) => r.document_id));

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/rh"
        className="flex w-fit items-center gap-xs text-sm font-semibold text-neutral-500 hover:text-neutral-800"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Personnel
      </Link>

      <div className="mt-lg rounded-xl bg-white p-xl shadow-sm ring-1 ring-neutral-200">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <p className="font-mono text-xs text-neutral-400">{emp.matricule}</p>
            <h1 className="mt-xs text-xl font-extrabold text-neutral-900">
              {employeeName(emp)}
            </h1>
            <p className="mt-xs text-sm text-neutral-500">
              {emp.job_title ?? 'Fonction non renseignée'} —{' '}
              {CONTRACT_LABELS[emp.contract_type]}
            </p>
          </div>
          <span
            className={`rounded-full px-md py-xs text-xs font-bold ${
              emp.status === 'actif'
                ? 'bg-success/10 text-success'
                : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {EMPLOYEE_STATUS_LABELS[emp.status]}
          </span>
        </div>

        <dl className="mt-lg grid grid-cols-2 gap-md text-sm sm:grid-cols-3">
          <Field label="Salaire brut mensuel">
            <span className="font-bold">
              {formatFcfa(emp.gross_salary_fcfa)} F
            </span>
          </Field>
          <Field label="Embauché le">{formatDate(emp.hired_on)}</Field>
          <Field label="Fin de période d'essai">
            {formatDate(emp.trial_end_on)}
          </Field>
          <Field label="Fin de contrat">{formatDate(emp.contract_end_on)}</Field>
          <Field label="Numéro CNSS">{emp.cnss_no ?? '—'}</Field>
          <Field label="Téléphone">{emp.phone ?? '—'}</Field>
          <Field label="Date de naissance">{formatDate(emp.birth_date)}</Field>
          <Field label="Pièce d'identité">
            {emp.id_card_no ?? '—'}
            {emp.id_card_expiry
              ? ` (exp. ${formatDate(emp.id_card_expiry)})`
              : ''}
          </Field>
          <Field label="Adresse">{emp.address ?? '—'}</Field>
          {emp.status === 'sorti' && (
            <Field label="Sortie">
              {formatDate(emp.exit_on)}
              {emp.exit_reason ? ` — ${emp.exit_reason}` : ''}
            </Field>
          )}
        </dl>

        {emp.notes && (
          <div className="mt-lg rounded-lg bg-neutral-50 p-md text-sm text-neutral-700">
            {emp.notes}
          </div>
        )}
      </div>

      {balance && (
        <div className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
            Solde de congés
          </h2>
          <div className="mt-md grid grid-cols-3 gap-md text-sm">
            <div>
              <p className="text-xs text-neutral-400">Acquis</p>
              <p className="mt-xs font-bold text-neutral-900">
                {balance.acquired_days} j
              </p>
              <p className="text-xs text-neutral-400">
                {balance.months_service} mois de service
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Pris</p>
              <p className="mt-xs font-bold text-neutral-900">
                {balance.taken_days} j
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-400">Solde</p>
              <p
                className={`mt-xs font-bold ${balance.balance_days < 0 ? 'text-error' : 'text-success'}`}
              >
                {balance.balance_days} j
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
          Documents rattachés
        </h2>
        {rows.length === 0 ? (
          <p className="mt-md text-sm text-neutral-500">
            Aucune pièce rattachée. Enregistrez d&apos;abord le contrat ou la
            pièce d&apos;identité dans le courrier, puis rattachez-la ici.
          </p>
        ) : (
          <ul className="mt-md divide-y divide-neutral-100">
            {rows.map((r) => (
              <li key={r.document_id} className="py-sm">
                <Link
                  href={`/courrier/${r.document_id}`}
                  className="flex items-center justify-between gap-md hover:opacity-80"
                >
                  <p className="min-w-0 truncate text-sm text-neutral-800">
                    <span className="font-mono text-xs text-neutral-400">
                      {r.bo_documents?.reg_number}
                    </span>{' '}
                    {r.bo_documents?.title}
                  </p>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {r.bo_documents ? DOC_KIND_LABELS[r.bo_documents.kind] : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <AttachDocumentForm
          employeeId={emp.id}
          documents={availableDocs.filter((d) => !attachedIds.has(d.id))}
        />
      </div>

      <div className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
            Historique des congés
          </h2>
          <Link
            href="/rh/conges"
            className="text-xs font-bold text-primary-600 hover:underline"
          >
            Gérer les congés
          </Link>
        </div>
        {leaveRows.length === 0 ? (
          <p className="mt-md text-sm text-neutral-500">Aucun congé enregistré.</p>
        ) : (
          <ul className="mt-md divide-y divide-neutral-100">
            {leaveRows.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-md py-sm"
              >
                <p className="text-sm text-neutral-800">
                  {LEAVE_KIND_LABELS[l.kind]} — du {formatDate(l.start_on)} au{' '}
                  {formatDate(l.end_on)}{' '}
                  <span className="text-neutral-400">({l.days} j ouvrables)</span>
                </p>
                <span
                  className={`shrink-0 rounded-full px-md py-xs text-xs font-bold ${LEAVE_STATUS_STYLES[l.status]}`}
                >
                  {LEAVE_STATUS_LABELS[l.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
            Bulletins de paie
          </h2>
          <Link
            href="/rh/paie"
            className="text-xs font-bold text-primary-600 hover:underline"
          >
            Paie du mois
          </Link>
        </div>
        {slips.length === 0 ? (
          <p className="mt-md text-sm text-neutral-500">
            Aucun bulletin établi pour cet employé.
          </p>
        ) : (
          <ul className="mt-md divide-y divide-neutral-100">
            {slips.map((p) => (
              <li key={p.id} className="py-sm">
                <Link
                  href={`/rh/paie/${p.id}`}
                  className="flex items-center justify-between gap-md hover:opacity-80"
                >
                  <p className="text-sm capitalize text-neutral-800">
                    {formatPeriod(p.period)}
                  </p>
                  <p className="flex shrink-0 items-center gap-md text-xs text-neutral-500">
                    Net{' '}
                    <span className="font-bold text-neutral-900">
                      {formatFcfa(p.net_fcfa)} F
                    </span>
                    <span
                      className={`rounded-full px-md py-xs font-bold ${PAYSLIP_STATUS_STYLES[p.status]}`}
                    >
                      {PAYSLIP_STATUS_LABELS[p.status]}
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {emp.status === 'actif' && <ExitEmployeeForm employeeId={emp.id} />}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-neutral-400">
        {label}
      </dt>
      <dd className="mt-xs text-neutral-800">{children}</dd>
    </div>
  );
}
