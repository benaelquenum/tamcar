import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { formatDate, formatFcfa } from '@/lib/bo';
import {
  ALERT_STYLES,
  CONTRACT_LABELS,
  employeeName,
  type BoEmployee,
  type BoHrAlert,
} from '@/lib/rh';
import {
  AlertIcon,
  ClockIcon,
  UserPlusIcon,
  WalletIcon,
} from '@/components/Icon';

export const dynamic = 'force-dynamic';

export default async function RhPage() {
  const supabase = createServerSupabase();

  const [{ data: employees, error }, { data: alerts }] = await Promise.all([
    supabase
      .from('bo_employees')
      .select('*')
      .order('status', { ascending: true })
      .order('matricule', { ascending: true }),
    supabase.rpc('bo_hr_alerts', { p_days: 60 }),
  ]);

  const all = (employees ?? []) as BoEmployee[];
  const actifs = all.filter((e) => e.status === 'actif');
  const sortis = all.filter((e) => e.status === 'sorti');
  const masse = actifs.reduce((s, e) => s + e.gross_salary_fcfa, 0);
  const hrAlerts = (alerts ?? []) as BoHrAlert[];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">
            Personnel
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Registre des employés, contrats et rémunérations. Ces informations
            sont confidentielles : elles ne sont visibles que par le fondateur.
          </p>
        </div>
        <div className="flex gap-sm">
          <Link
            href="/rh/conges"
            className="flex items-center gap-sm rounded-lg bg-white px-lg py-md text-sm font-bold text-neutral-700 shadow-sm ring-1 ring-neutral-200 transition hover:bg-neutral-50"
          >
            <ClockIcon className="h-4 w-4" />
            Congés
          </Link>
          <Link
            href="/rh/paie"
            className="flex items-center gap-sm rounded-lg bg-neutral-900 px-lg py-md text-sm font-bold text-white transition hover:brightness-110"
          >
            <WalletIcon className="h-4 w-4" />
            Paie du mois
          </Link>
          <Link
            href="/rh/nouveau"
            className="flex items-center gap-sm rounded-lg bg-primary-500 px-lg py-md text-sm font-bold text-white shadow-md transition hover:brightness-110"
          >
            <UserPlusIcon className="h-4 w-4" />
            Embaucher
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-lg rounded-md bg-error/10 p-md text-sm text-error">
          {error.message}
        </div>
      )}

      <div className="mt-xl grid grid-cols-1 gap-lg sm:grid-cols-3">
        <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Effectif
          </p>
          <p className="mt-xs text-2xl font-extrabold text-neutral-900">
            {actifs.length}
          </p>
          <p className="text-xs text-neutral-500">
            {sortis.length} sortie{sortis.length > 1 ? 's' : ''} enregistrée
            {sortis.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Masse salariale brute
          </p>
          <p className="mt-xs text-2xl font-extrabold text-neutral-900">
            {formatFcfa(masse)} F
          </p>
          <p className="text-xs text-neutral-500">par mois, hors charges</p>
        </div>
        <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Coût employeur estimé
          </p>
          <p className="mt-xs text-2xl font-extrabold text-neutral-900">
            {formatFcfa(masse)} F +
          </p>
          <p className="text-xs text-neutral-500">
            charges patronales — chiffre exact dans la paie du mois
          </p>
        </div>
      </div>

      <div className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
        <h2 className="flex items-center gap-sm text-sm font-extrabold uppercase tracking-wider text-neutral-700">
          <AlertIcon className="h-4 w-4" />
          Échéances RH — 60 prochains jours
        </h2>
        {hrAlerts.length === 0 ? (
          <p className="mt-md text-sm text-neutral-500">
            Aucune échéance RH dans les deux prochains mois.
          </p>
        ) : (
          <ul className="mt-md divide-y divide-neutral-100">
            {hrAlerts.map((a) => (
              <li
                key={`${a.employee_id}-${a.kind}`}
                className="flex items-center justify-between gap-md py-sm"
              >
                <p className="min-w-0 truncate text-sm text-neutral-800">
                  <span className="font-mono text-xs text-neutral-400">
                    {a.matricule}
                  </span>{' '}
                  {a.employee_name} — {a.label}
                </p>
                <span
                  className={`shrink-0 rounded-full px-md py-xs text-xs font-bold ${ALERT_STYLES[a.kind]}`}
                >
                  {formatDate(a.due_date)} — dans {a.days_left} j
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EmployeeTable title="Personnel actif" rows={actifs} />
      {sortis.length > 0 && (
        <EmployeeTable title="Sortis des effectifs" rows={sortis} muted />
      )}
    </div>
  );
}

function EmployeeTable({
  title,
  rows,
  muted,
}: {
  title: string;
  rows: BoEmployee[];
  muted?: boolean;
}) {
  return (
    <div className="mt-lg overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
      <div className="border-b border-neutral-100 px-lg py-md">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
          {title}
        </h2>
      </div>
      {rows.length === 0 ? (
        <p className="p-xl text-center text-sm text-neutral-500">
          Aucun employé enregistré. Commencez par « Embaucher ».
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-400">
              <th className="px-lg py-sm">Matricule</th>
              <th className="px-lg py-sm">Nom et prénoms</th>
              <th className="px-lg py-sm">Fonction</th>
              <th className="px-lg py-sm">Contrat</th>
              <th className="px-lg py-sm">Embauché le</th>
              <th className="px-lg py-sm text-right">Brut mensuel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((e) => (
              <tr
                key={e.id}
                className={`transition hover:bg-neutral-50 ${muted ? 'text-neutral-500' : ''}`}
              >
                <td className="px-lg py-md font-mono text-xs text-neutral-400">
                  <Link href={`/rh/${e.id}`} className="hover:underline">
                    {e.matricule}
                  </Link>
                </td>
                <td className="px-lg py-md font-semibold text-neutral-900">
                  <Link href={`/rh/${e.id}`} className="hover:underline">
                    {employeeName(e)}
                  </Link>
                </td>
                <td className="px-lg py-md text-neutral-600">
                  {e.job_title ?? '—'}
                </td>
                <td className="px-lg py-md text-neutral-600">
                  {CONTRACT_LABELS[e.contract_type]}
                  {e.contract_end_on
                    ? ` — fin ${formatDate(e.contract_end_on)}`
                    : ''}
                </td>
                <td className="px-lg py-md text-neutral-600">
                  {formatDate(e.hired_on)}
                </td>
                <td className="px-lg py-md text-right font-bold text-neutral-900">
                  {formatFcfa(e.gross_salary_fcfa)} F
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
