import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { formatDate, formatFcfa } from '@/lib/bo';
import {
  CONTRACT_LABELS,
  PAYSLIP_STATUS_LABELS,
  PAYSLIP_STATUS_STYLES,
  formatPeriod,
  type BoEmployee,
  type BoPayslipView,
} from '@/lib/rh';
import { ChevronLeftIcon } from '@/components/Icon';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

export default async function BulletinPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();

  const { data } = await supabase
    .from('bo_payslips_view')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (!data) notFound();
  const p = data as BoPayslipView;

  const { data: emp } = await supabase
    .from('bo_employees')
    .select('*')
    .eq('id', p.employee_id)
    .maybeSingle();
  const employee = emp as BoEmployee | null;

  const retenues = p.cnss_employee_fcfa + p.its_fcfa + p.ortb_fcfa;

  return (
    <div className="mx-auto max-w-3xl pb-2xl">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/rh/paie"
          className="flex w-fit items-center gap-xs text-sm font-semibold text-neutral-500 hover:text-neutral-800"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Paie du mois
        </Link>
        <PrintButton />
      </div>

      <div className="mt-lg rounded-xl bg-white p-xl shadow-sm ring-1 ring-neutral-200 print:shadow-none print:ring-0">
        <div className="flex flex-wrap items-start justify-between gap-md border-b border-neutral-200 pb-lg">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Bulletin de paie
            </p>
            <h1 className="mt-xs text-xl font-extrabold capitalize text-neutral-900">
              {formatPeriod(p.period)}
            </h1>
            <p className="mt-xs text-sm text-neutral-500">
              TamCar SARL — Porto-Novo, République du Bénin
            </p>
          </div>
          <span
            className={`rounded-full px-md py-xs text-xs font-bold ${PAYSLIP_STATUS_STYLES[p.status]}`}
          >
            {PAYSLIP_STATUS_LABELS[p.status]}
          </span>
        </div>

        <dl className="mt-lg grid grid-cols-2 gap-md text-sm sm:grid-cols-3">
          <Field label="Employé">
            <span className="font-bold">{p.employee_name}</span>
          </Field>
          <Field label="Matricule">{p.matricule}</Field>
          <Field label="Numéro CNSS">{p.cnss_no ?? '—'}</Field>
          <Field label="Fonction">{p.job_title ?? '—'}</Field>
          <Field label="Contrat">
            {employee ? CONTRACT_LABELS[employee.contract_type] : '—'}
          </Field>
          <Field label="Embauché le">
            {employee ? formatDate(employee.hired_on) : '—'}
          </Field>
          <Field label="Jours payés">
            {p.days_paid} / {p.days_in_month}
          </Field>
          <Field label="Calculé le">{formatDate(p.computed_at)}</Field>
          <Field label="Écriture comptable">
            {p.entry_id ? (
              <Link
                href={`/compta/ecritures/${p.entry_id}`}
                className="font-semibold text-primary-600 hover:underline print:text-neutral-800"
              >
                Voir l&apos;écriture
              </Link>
            ) : (
              '—'
            )}
          </Field>
        </dl>

        <table className="mt-xl w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-bold uppercase tracking-wider text-neutral-400">
              <th className="py-sm">Libellé</th>
              <th className="py-sm text-right">Base</th>
              <th className="py-sm text-right">Gain</th>
              <th className="py-sm text-right">Retenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            <tr>
              <td className="py-md text-neutral-800">Salaire brut du mois</td>
              <td className="py-md text-right text-neutral-500">
                {p.days_paid < p.days_in_month
                  ? `${p.days_paid}/${p.days_in_month} j`
                  : '—'}
              </td>
              <td className="py-md text-right font-semibold text-neutral-900">
                {formatFcfa(p.gross_fcfa)}
              </td>
              <td className="py-md text-right text-neutral-400">—</td>
            </tr>
            <tr>
              <td className="py-md text-neutral-800">
                Cotisation CNSS — part salariale
              </td>
              <td className="py-md text-right text-neutral-500">
                {formatFcfa(p.gross_fcfa)}
              </td>
              <td className="py-md text-right text-neutral-400">—</td>
              <td className="py-md text-right font-semibold text-neutral-900">
                {formatFcfa(p.cnss_employee_fcfa)}
              </td>
            </tr>
            <tr>
              <td className="py-md text-neutral-800">
                Impôt sur les traitements et salaires (ITS)
              </td>
              <td className="py-md text-right text-neutral-500">
                {formatFcfa(p.taxable_fcfa)}
              </td>
              <td className="py-md text-right text-neutral-400">—</td>
              <td className="py-md text-right font-semibold text-neutral-900">
                {formatFcfa(p.its_fcfa)}
              </td>
            </tr>
            {p.ortb_fcfa > 0 && (
              <tr>
                <td className="py-md text-neutral-800">
                  Redevance ORTB (CGI art. 125-2)
                </td>
                <td className="py-md text-right text-neutral-400">—</td>
                <td className="py-md text-right text-neutral-400">—</td>
                <td className="py-md text-right font-semibold text-neutral-900">
                  {formatFcfa(p.ortb_fcfa)}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 text-neutral-700">
              <td className="py-md font-bold">Totaux</td>
              <td />
              <td className="py-md text-right font-bold">
                {formatFcfa(p.gross_fcfa)}
              </td>
              <td className="py-md text-right font-bold">
                {formatFcfa(retenues)}
              </td>
            </tr>
            <tr className="border-t-2 border-neutral-900">
              <td className="py-lg text-base font-extrabold text-neutral-900">
                NET À PAYER
              </td>
              <td />
              <td />
              <td className="py-lg text-right text-base font-extrabold text-neutral-900">
                {formatFcfa(p.net_fcfa)} F
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-xl rounded-lg bg-neutral-50 p-lg text-xs text-neutral-600 print:bg-white print:ring-1 print:ring-neutral-200">
          <p className="font-bold uppercase tracking-wider text-neutral-500">
            Charges patronales (non retenues sur le salaire)
          </p>
          <p className="mt-xs">
            Cotisations CNSS à la charge de l&apos;employeur :{' '}
            <span className="font-bold text-neutral-900">
              {formatFcfa(p.cnss_employer_fcfa)} F
            </span>
            {p.vps_fcfa > 0 ? (
              <>
                {' '}
                — versement patronal sur salaires :{' '}
                <span className="font-bold text-neutral-900">
                  {formatFcfa(p.vps_fcfa)} F
                </span>
              </>
            ) : null}
            . Coût total employeur :{' '}
            <span className="font-bold text-neutral-900">
              {formatFcfa(p.gross_fcfa + p.cnss_employer_fcfa + p.vps_fcfa)} F
            </span>
            .
          </p>
        </div>

        <div className="mt-xl hidden grid-cols-2 gap-2xl pt-xl text-xs text-neutral-500 print:grid">
          <div className="border-t border-neutral-300 pt-sm">
            Signature de l&apos;employeur
          </div>
          <div className="border-t border-neutral-300 pt-sm">
            Signature du salarié (bon pour reçu)
          </div>
        </div>
      </div>
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
