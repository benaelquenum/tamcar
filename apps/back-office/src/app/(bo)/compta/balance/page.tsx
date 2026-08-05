import { createServerSupabase } from '@/lib/supabase-server';
import { formatFcfa } from '@/lib/bo';

export const dynamic = 'force-dynamic';

type BalanceRow = {
  account_code: string;
  account_label: string;
  class: number;
  total_debit: number;
  total_credit: number;
  balance_fcfa: number;
};

type SearchParams = { du?: string; au?: string };

const CLASS_LABELS: Record<number, string> = {
  1: 'Classe 1 — Financement permanent',
  2: 'Classe 2 — Actif immobilisé',
  3: 'Classe 3 — Stocks',
  4: 'Classe 4 — Tiers',
  5: 'Classe 5 — Trésorerie',
  6: 'Classe 6 — Charges',
  7: 'Classe 7 — Produits',
  8: 'Classe 8 — HAO et impôt',
};

export default async function BalancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('bo_trial_balance', {
    p_from: searchParams.du || null,
    p_to: searchParams.au || null,
  });

  const rows = (data ?? []) as BalanceRow[];
  const totalDebit = rows.reduce((s, r) => s + r.total_debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.total_credit, 0);

  const byClass = new Map<number, BalanceRow[]>();
  for (const r of rows) {
    const list = byClass.get(r.class) ?? [];
    list.push(r);
    byClass.set(r.class, list);
  }

  // Résultat provisoire = produits (7) − charges (6) ± HAO (8)
  const produits = rows
    .filter((r) => r.class === 7)
    .reduce((s, r) => s - r.balance_fcfa, 0);
  const charges = rows
    .filter((r) => r.class === 6)
    .reduce((s, r) => s + r.balance_fcfa, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">
            Balance générale
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Tous les comptes mouvementés — contrôle : total débits = total
            crédits.
          </p>
        </div>
        <form method="get" className="flex items-end gap-sm">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Du
            </label>
            <input
              type="date"
              name="du"
              defaultValue={searchParams.du ?? ''}
              className="block rounded-lg bg-white px-md py-sm text-sm ring-1 ring-neutral-200"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Au
            </label>
            <input
              type="date"
              name="au"
              defaultValue={searchParams.au ?? ''}
              className="block rounded-lg bg-white px-md py-sm text-sm ring-1 ring-neutral-200"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white"
          >
            Filtrer
          </button>
        </form>
      </div>

      <div className="mt-lg grid grid-cols-1 gap-lg sm:grid-cols-3">
        <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Total mouvements
          </p>
          <p className="mt-sm text-xl font-extrabold text-neutral-900">
            {formatFcfa(totalDebit)} F
          </p>
          <p
            className={`text-xs font-bold ${totalDebit === totalCredit ? 'text-success' : 'text-error'}`}
          >
            {totalDebit === totalCredit
              ? 'Équilibrée (débits = crédits)'
              : 'DÉSÉQUILIBRE — à investiguer'}
          </p>
        </div>
        <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Produits (classe 7)
          </p>
          <p className="mt-sm text-xl font-extrabold text-neutral-900">
            {formatFcfa(produits)} F
          </p>
        </div>
        <div className="rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Résultat provisoire
          </p>
          <p
            className={`mt-sm text-xl font-extrabold ${produits - charges >= 0 ? 'text-success' : 'text-error'}`}
          >
            {formatFcfa(produits - charges)} F
          </p>
          <p className="text-xs text-neutral-400">
            produits − charges (avant HAO et IS)
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-xl rounded-xl bg-white p-xl text-center text-sm text-neutral-500 shadow-sm ring-1 ring-neutral-200">
          Aucun mouvement sur la période.
        </p>
      ) : (
        Array.from(byClass.entries())
          .sort(([a], [b]) => a - b)
          .map(([cls, list]) => (
            <div
              key={cls}
              className="mt-lg overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200"
            >
              <p className="bg-neutral-50 px-lg py-sm text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                {CLASS_LABELS[cls] ?? `Classe ${cls}`}
              </p>
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {list.map((r) => (
                    <tr key={r.account_code} className="hover:bg-neutral-50">
                      <td className="px-lg py-sm">
                        <a
                          href={`/compta/grand-livre?compte=${r.account_code}`}
                          className="hover:underline"
                        >
                          <span className="font-mono text-xs text-neutral-400">
                            {r.account_code}
                          </span>{' '}
                          {r.account_label}
                        </a>
                      </td>
                      <td className="w-36 px-lg py-sm text-right text-neutral-600">
                        {formatFcfa(r.total_debit)}
                      </td>
                      <td className="w-36 px-lg py-sm text-right text-neutral-600">
                        {formatFcfa(r.total_credit)}
                      </td>
                      <td
                        className={`w-40 px-lg py-sm text-right font-bold ${r.balance_fcfa < 0 ? 'text-info' : 'text-neutral-900'}`}
                      >
                        {r.balance_fcfa < 0
                          ? `${formatFcfa(-r.balance_fcfa)} C`
                          : `${formatFcfa(r.balance_fcfa)} D`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
      )}
    </div>
  );
}
