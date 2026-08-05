import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { JOURNAL_LABELS, formatDate, formatFcfa, type BoAccount } from '@/lib/bo';

export const dynamic = 'force-dynamic';

type LedgerRow = {
  entry_id: string;
  entry_no: string;
  entry_date: string;
  journal: string;
  label: string;
  debit_fcfa: number;
  credit_fcfa: number;
};

type SearchParams = { compte?: string; du?: string; au?: string };

export default async function GrandLivrePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();
  const account = searchParams.compte ?? '';

  const [{ data: accounts }, ledgerRes] = await Promise.all([
    supabase
      .from('bo_accounts')
      .select('code, label, class, is_active')
      .eq('is_active', true)
      .order('code'),
    account
      ? supabase.rpc('bo_account_ledger', {
          p_account: account,
          p_from: searchParams.du || null,
          p_to: searchParams.au || null,
        })
      : Promise.resolve({ data: null }),
  ]);

  const rows = ((ledgerRes.data ?? []) as LedgerRow[]) || [];
  let running = 0;

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-neutral-900">Grand livre</h1>
      <p className="mt-xs text-sm text-neutral-600">
        Tous les mouvements d&apos;un compte, avec solde progressif.
      </p>

      <form method="get" className="mt-lg flex flex-wrap items-end gap-sm">
        <div className="min-w-64 flex-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Compte
          </label>
          <select
            name="compte"
            defaultValue={account}
            className="block w-full rounded-lg bg-white px-md py-sm text-sm ring-1 ring-neutral-200"
          >
            <option value="">— choisir un compte —</option>
            {((accounts ?? []) as BoAccount[]).map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.label}
              </option>
            ))}
          </select>
        </div>
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
          Afficher
        </button>
      </form>

      {account && (
        <div className="mt-lg overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
          {rows.length === 0 ? (
            <p className="p-xl text-center text-sm text-neutral-500">
              Aucun mouvement sur ce compte pour la période.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-lg py-md font-bold">Date</th>
                  <th className="px-lg py-md font-bold">Pièce</th>
                  <th className="px-lg py-md font-bold">Libellé</th>
                  <th className="px-lg py-md text-right font-bold">Débit</th>
                  <th className="px-lg py-md text-right font-bold">Crédit</th>
                  <th className="px-lg py-md text-right font-bold">Solde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r, i) => {
                  running += r.debit_fcfa - r.credit_fcfa;
                  return (
                    <tr key={`${r.entry_id}-${i}`} className="hover:bg-neutral-50">
                      <td className="px-lg py-sm text-neutral-600">
                        {formatDate(r.entry_date)}
                      </td>
                      <td className="px-lg py-sm font-mono text-xs text-neutral-500">
                        <Link
                          href={`/compta/ecritures/${r.entry_id}`}
                          className="hover:underline"
                        >
                          {r.entry_no}
                        </Link>
                      </td>
                      <td className="px-lg py-sm text-neutral-800">
                        {r.label}
                        <span className="ml-sm text-[10px] text-neutral-400">
                          {JOURNAL_LABELS[r.journal]}
                        </span>
                      </td>
                      <td className="px-lg py-sm text-right text-neutral-700">
                        {r.debit_fcfa ? formatFcfa(r.debit_fcfa) : ''}
                      </td>
                      <td className="px-lg py-sm text-right text-neutral-700">
                        {r.credit_fcfa ? formatFcfa(r.credit_fcfa) : ''}
                      </td>
                      <td
                        className={`px-lg py-sm text-right font-bold ${running < 0 ? 'text-info' : 'text-neutral-900'}`}
                      >
                        {running < 0
                          ? `${formatFcfa(-running)} C`
                          : `${formatFcfa(running)} D`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
