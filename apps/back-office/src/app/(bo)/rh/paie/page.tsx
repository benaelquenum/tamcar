import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { formatFcfa } from '@/lib/bo';
import {
  PAYSLIP_STATUS_LABELS,
  PAYSLIP_STATUS_STYLES,
  formatPeriod,
  monthToPeriod,
  type BoPayslipView,
} from '@/lib/rh';
import { ChevronLeftIcon } from '@/components/Icon';
import { PayrollActions } from './PayrollActions';

export const dynamic = 'force-dynamic';

type SearchParams = { mois?: string };
type Settings = {
  cnss_employee_rate: number;
  cnss_employer_pension_rate: number;
  cnss_employer_family_rate: number;
  cnss_employer_risk_rate: number;
  cnss_ceiling_fcfa: number;
  its_deduct_cnss_employee: boolean;
  vps_enabled: boolean;
  vps_rate: number;
};

const pct = (r: number) =>
  `${(r * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

export default async function PaiePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();

  const today = new Date();
  const month =
    searchParams.mois ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const period = monthToPeriod(month);

  const [{ data: payslips, error }, { data: settings }, { data: headcount }] =
    await Promise.all([
      supabase
        .from('bo_payslips_view')
        .select('*')
        .eq('period', period)
        .order('matricule'),
      supabase.from('bo_payroll_settings').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('bo_employees')
        .select('id', { count: 'exact', head: false })
        .eq('status', 'actif'),
    ]);

  const rows = (payslips ?? []) as BoPayslipView[];
  const cfg = settings as Settings | null;
  const activeCount = (headcount ?? []).length;

  const total = rows.reduce(
    (acc, p) => ({
      gross: acc.gross + p.gross_fcfa,
      cnssEmp: acc.cnssEmp + p.cnss_employee_fcfa,
      its: acc.its + p.its_fcfa + p.ortb_fcfa,
      net: acc.net + p.net_fcfa,
      cnssEr: acc.cnssEr + p.cnss_employer_fcfa,
      vps: acc.vps + p.vps_fcfa,
    }),
    { gross: 0, cnssEmp: 0, its: 0, net: 0, cnssEr: 0, vps: 0 },
  );

  const drafts = rows.filter((p) => p.status === 'brouillon').length;
  const posted = rows.some((p) => p.status !== 'brouillon');
  const allValidated =
    rows.length > 0 && rows.every((p) => p.status === 'valide');
  const entryId = rows.find((p) => p.entry_id)?.entry_id ?? null;

  return (
    <div>
      <Link
        href="/rh"
        className="flex w-fit items-center gap-xs text-sm font-semibold text-neutral-500 hover:text-neutral-800 print:hidden"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Personnel
      </Link>

      <div className="mt-lg flex flex-wrap items-end justify-between gap-md print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">
            Paie du mois
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Génération des bulletins depuis le salaire brut, puis
            comptabilisation en une écriture au journal des opérations diverses.
          </p>
        </div>
        <form method="get" className="flex items-end gap-sm">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Mois de paie
            </label>
            <input
              type="month"
              name="mois"
              defaultValue={month}
              className="mt-xs rounded-lg bg-white px-lg py-sm text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white transition hover:brightness-110"
          >
            Afficher
          </button>
        </form>
      </div>

      {error && (
        <div className="mt-lg rounded-md bg-error/10 p-md text-sm text-error">
          {error.message}
        </div>
      )}

      <PayrollActions
        period={period}
        periodLabel={formatPeriod(period)}
        draftCount={drafts}
        slipCount={rows.length}
        posted={posted}
        allValidated={allValidated}
        entryId={entryId}
        activeCount={activeCount}
      />

      <div className="mt-lg overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        <div className="border-b border-neutral-100 px-lg py-md">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
            Récapitulatif — <span className="capitalize">{formatPeriod(period)}</span>
          </h2>
        </div>
        {rows.length === 0 ? (
          <p className="p-xl text-center text-sm text-neutral-500">
            Aucun bulletin pour ce mois. Lancez « Générer les bulletins ».
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-400">
                  <th className="px-lg py-sm">Employé</th>
                  <th className="px-lg py-sm text-right">Brut</th>
                  <th className="px-lg py-sm text-right">CNSS salarié</th>
                  <th className="px-lg py-sm text-right">ITS</th>
                  <th className="px-lg py-sm text-right">Net à payer</th>
                  <th className="px-lg py-sm text-right">CNSS patronale</th>
                  <th className="px-lg py-sm">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((p) => (
                  <tr key={p.id} className="transition hover:bg-neutral-50">
                    <td className="px-lg py-md">
                      <Link
                        href={`/rh/paie/${p.id}`}
                        className="font-semibold text-neutral-900 hover:underline"
                      >
                        {p.employee_name}
                      </Link>
                      <span className="ml-sm font-mono text-xs text-neutral-400">
                        {p.matricule}
                      </span>
                      {p.days_paid < p.days_in_month && (
                        <span className="ml-sm text-xs text-warning">
                          prorata {p.days_paid}/{p.days_in_month} j
                        </span>
                      )}
                    </td>
                    <td className="px-lg py-md text-right text-neutral-700">
                      {formatFcfa(p.gross_fcfa)}
                    </td>
                    <td className="px-lg py-md text-right text-neutral-700">
                      {formatFcfa(p.cnss_employee_fcfa)}
                    </td>
                    <td className="px-lg py-md text-right text-neutral-700">
                      {formatFcfa(p.its_fcfa + p.ortb_fcfa)}
                    </td>
                    <td className="px-lg py-md text-right font-bold text-neutral-900">
                      {formatFcfa(p.net_fcfa)}
                    </td>
                    <td className="px-lg py-md text-right text-neutral-500">
                      {formatFcfa(p.cnss_employer_fcfa)}
                    </td>
                    <td className="px-lg py-md">
                      <span
                        className={`rounded-full px-md py-xs text-xs font-bold ${PAYSLIP_STATUS_STYLES[p.status]}`}
                      >
                        {PAYSLIP_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-200 bg-neutral-50 font-bold text-neutral-900">
                  <td className="px-lg py-md">Total ({rows.length})</td>
                  <td className="px-lg py-md text-right">
                    {formatFcfa(total.gross)}
                  </td>
                  <td className="px-lg py-md text-right">
                    {formatFcfa(total.cnssEmp)}
                  </td>
                  <td className="px-lg py-md text-right">
                    {formatFcfa(total.its)}
                  </td>
                  <td className="px-lg py-md text-right">
                    {formatFcfa(total.net)}
                  </td>
                  <td className="px-lg py-md text-right">
                    {formatFcfa(total.cnssEr)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mt-lg rounded-xl bg-info/5 p-lg text-sm leading-relaxed text-neutral-700 ring-1 ring-info/20">
          <p className="font-bold text-neutral-900">Coût total employeur</p>
          <p className="mt-xs">
            {formatFcfa(total.gross + total.cnssEr + total.vps)} F pour le mois —
            soit {formatFcfa(total.gross)} F de brut, {formatFcfa(total.cnssEr)} F
            de charges patronales CNSS
            {total.vps > 0 ? ` et ${formatFcfa(total.vps)} F de VPS` : ''}. Le
            personnel perçoit {formatFcfa(total.net)} F ; {formatFcfa(total.cnssEmp + total.cnssEr)} F
            sont dus à la CNSS et {formatFcfa(total.its)} F au Trésor au titre de
            l&apos;ITS.
          </p>
        </div>
      )}

      {cfg && (
        <div className="mt-lg rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200 print:hidden">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-700">
            Barèmes appliqués
          </h2>
          <ul className="mt-md grid grid-cols-1 gap-sm text-sm text-neutral-700 sm:grid-cols-2">
            <li>
              ITS : barème progressif du CGI 2026, article 125 — 0 %, 10 %, 15 %,
              19 %, 30 %.
            </li>
            <li>
              Base imposable :{' '}
              {cfg.its_deduct_cnss_employee
                ? 'brut diminué de la CNSS salariale'
                : 'brut (la CNSS salariale n’est pas déductible — art. 122 et 124)'}
              .
            </li>
            <li>CNSS salarié : {pct(cfg.cnss_employee_rate)} du brut plafonné.</li>
            <li>
              CNSS employeur : pension {pct(cfg.cnss_employer_pension_rate)},
              prestations familiales {pct(cfg.cnss_employer_family_rate)},
              risques professionnels {pct(cfg.cnss_employer_risk_rate)}.
            </li>
            <li>
              Plafond de cotisation : {formatFcfa(cfg.cnss_ceiling_fcfa)} F par
              mois.
            </li>
            <li>
              VPS :{' '}
              {cfg.vps_enabled
                ? `${pct(cfg.vps_rate)} (art. 194)`
                : 'désactivé — exonération des entreprises nouvelles (art. 192)'}
              .
            </li>
          </ul>
          <p className="mt-md text-xs text-neutral-500">
            Les taux CNSS n&apos;ont pas pu être vérifiés sur pièce : ce sont les
            valeurs usuellement pratiquées. Corrigez-les dans la table
            <span className="font-mono"> bo_payroll_settings </span>
            dès réception de la notification de la caisse — aucun taux
            n&apos;est codé en dur dans les calculs.
          </p>
        </div>
      )}
    </div>
  );
}
