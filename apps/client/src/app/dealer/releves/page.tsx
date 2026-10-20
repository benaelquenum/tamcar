import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  CAT_LABEL,
  fmt,
  frDate,
  monthLabel,
  previewParam,
  type DealerStatementPayout,
  type DealerStatementRow,
  type DealerSummary,
} from '../lib';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Mois voisin d'un « 2026-10 » (delta = ±1) → « 2026-09 ». */
function shiftMonth(ym: string, delta: number): string {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

/**
 * Relevé mensuel par véhicule (contrat de partenariat, article 9.8) : jours actifs, Part du Partenaire, solde du Fonds,
 * versements, retenues et frais. Ni le prix des courses ni la rémunération du Chauffeur n'y figurent (article 14.2).
 */
export default async function DealerStatementPage({
  searchParams,
}: {
  searchParams: { as?: string | string[]; m?: string };
}) {
  const supabase = createServerSupabase();
  const as = previewParam(searchParams.as);
  const who = { p_dealer_id: as };
  const currentMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Porto-Novo' }).slice(0, 7);
  const ym = searchParams.m && MONTH.test(searchParams.m) && searchParams.m <= currentMonth ? searchParams.m : currentMonth;
  const p_month = `${ym}-01`;

  const [{ data: sData }, { data: rData }, { data: pData }] = await Promise.all([
    supabase.rpc('dealer_my_summary', who),
    supabase.rpc('dealer_my_statement', { ...who, p_month }),
    supabase.rpc('dealer_my_statement_payouts', { ...who, p_month }),
  ]);
  const summary = (Array.isArray(sData) ? sData[0] : sData) as DealerSummary | null;
  const rows = (rData ?? []) as DealerStatementRow[];
  const payouts = (pData ?? []) as DealerStatementPayout[];

  const totalShare = rows.reduce((s, r) => s + Number(r.share_fcfa), 0);
  const totalFund = rows.reduce((s, r) => s + Number(r.fund_total_fcfa), 0);
  const totalDays = rows.reduce((s, r) => s + r.active_days, 0);
  const totalRides = rows.reduce((s, r) => s + r.rides, 0);
  const paidGross = payouts.reduce((s, p) => s + p.amount_fcfa, 0);
  const paidAib = payouts.reduce((s, p) => s + p.aib_fcfa, 0);
  const paidFees = payouts.reduce((s, p) => s + p.fee_fcfa, 0);
  const paidNet = payouts.reduce((s, p) => s + p.net_fcfa, 0);

  const link = (m: string) => `/dealer/releves?m=${m}${as ? `&as=${encodeURIComponent(as)}` : ''}`;
  const monthName = monthLabel(p_month);

  return (
    <div className="space-y-xl">
      <div className="flex flex-wrap items-center justify-between gap-md print:hidden">
        <h1 className="text-2xl font-extrabold text-neutral-900">Relevé mensuel</h1>
        <div className="flex flex-wrap items-center gap-sm">
          <Link href={link(shiftMonth(ym, -1))} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-bold text-neutral-800 hover:border-primary-500">
            ← {monthLabel(`${shiftMonth(ym, -1)}-01`, false)}
          </Link>
          {ym < currentMonth && (
            <Link href={link(shiftMonth(ym, 1))} className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-bold text-neutral-800 hover:border-primary-500">
              {monthLabel(`${shiftMonth(ym, 1)}-01`, false)} →
            </Link>
          )}
          <PrintButton />
        </div>
      </div>

      <section className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200 print:shadow-none print:ring-0">
        <div className="mb-md flex flex-wrap items-baseline justify-between gap-sm border-b border-neutral-200 pb-md">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Relevé du Partenaire</p>
            <p className="text-lg font-extrabold capitalize text-neutral-900">{monthName}</p>
          </div>
          <p className="text-sm text-neutral-700">{summary?.company_name ?? ''}</p>
        </div>

        {rows.length === 0 ? (
          <p className="py-lg text-center text-sm text-neutral-600">Aucun véhicule enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead className="border-b border-neutral-200 text-left text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="py-sm pr-md">Véhicule</th>
                  <th className="px-md py-sm text-right">Jours actifs</th>
                  <th className="px-md py-sm text-right">Courses</th>
                  <th className="px-md py-sm text-right">Part du Partenaire</th>
                  <th className="py-sm pl-md text-right">Solde du Fonds</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.vehicle_id} className="border-b border-neutral-100">
                    <td className="py-sm pr-md">
                      <p className="font-semibold text-neutral-900">
                        {r.brand} {r.model}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {r.plate_number} · TamCar {CAT_LABEL[r.category] ?? r.category}
                      </p>
                    </td>
                    <td className="px-md py-sm text-right">{r.active_days}</td>
                    <td className="px-md py-sm text-right">{r.rides}</td>
                    <td className="px-md py-sm text-right font-semibold text-primary-700">{fmt(r.share_fcfa)} F</td>
                    <td className="py-sm pl-md text-right">{fmt(r.fund_total_fcfa)} F</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-extrabold text-neutral-900">
                  <td className="pt-sm pr-md">Total</td>
                  <td className="px-md pt-sm text-right">{totalDays}</td>
                  <td className="px-md pt-sm text-right">{totalRides}</td>
                  <td className="px-md pt-sm text-right text-primary-700">{fmt(totalShare)} F</td>
                  <td className="pl-md pt-sm text-right">{fmt(totalFund)} F</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-md text-[11px] leading-relaxed text-neutral-500">
          Le solde du Fonds est celui constitué sur chaque véhicule à la fin du mois ; il sert au prix de cession en fin de contrat.
        </p>
      </section>

      <section className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200 print:shadow-none print:ring-0">
        <h2 className="mb-md text-sm font-bold uppercase tracking-wider text-neutral-500">Versements du mois, retenues et frais</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun versement réglé en {monthName}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead className="border-b border-neutral-200 text-left text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="py-sm pr-md">Date</th>
                  <th className="px-md py-sm text-right">Montant demandé</th>
                  <th className="px-md py-sm text-right">AIB retenu</th>
                  <th className="px-md py-sm text-right">Frais de transaction</th>
                  <th className="px-md py-sm text-right">Net versé</th>
                  <th className="py-sm pl-md">Facture / référence</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p, i) => (
                  <tr key={i} className="border-b border-neutral-100">
                    <td className="py-sm pr-md">{frDate(p.decided_at)}</td>
                    <td className="px-md py-sm text-right">{fmt(p.amount_fcfa)} F</td>
                    <td className="px-md py-sm text-right">{fmt(p.aib_fcfa)} F</td>
                    <td className="px-md py-sm text-right">{fmt(p.fee_fcfa)} F</td>
                    <td className="px-md py-sm text-right font-semibold text-primary-700">{fmt(p.net_fcfa)} F</td>
                    <td className="py-sm pl-md text-xs text-neutral-600">
                      {p.invoice_number ?? '—'}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-extrabold text-neutral-900">
                  <td className="pt-sm pr-md">Total</td>
                  <td className="px-md pt-sm text-right">{fmt(paidGross)} F</td>
                  <td className="px-md pt-sm text-right">{fmt(paidAib)} F</td>
                  <td className="px-md pt-sm text-right">{fmt(paidFees)} F</td>
                  <td className="px-md pt-sm text-right text-primary-700">{fmt(paidNet)} F</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-neutral-500">
        Les relevés mensuels font foi, sauf erreur manifeste. Vous disposez de trente (30) jours pour contester un relevé par écrit ; TamCar répond sous quinze (15) jours
        (article 9.8 du contrat de partenariat). Document confidentiel, réservé au Partenaire.
      </p>
    </div>
  );
}
