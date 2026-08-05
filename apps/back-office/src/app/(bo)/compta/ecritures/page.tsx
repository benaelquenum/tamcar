import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { JOURNAL_LABELS, formatDate, formatFcfa, type BoEntry } from '@/lib/bo';
import { PlusIcon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

type SearchParams = { journal?: string };

export default async function EcrituresPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .maybeSingle();
  const isAdmin = profile?.role === 'admin';

  let query = supabase
    .from('bo_entries_view')
    .select('*')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(150);
  if (searchParams.journal) query = query.eq('journal_code', searchParams.journal);

  const { data: entries } = await query;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">Écritures</h1>
          <p className="mt-xs text-sm text-neutral-600">
            Journal comptable — les écritures sont immuables ; toute correction
            passe par une extourne.
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/compta/ecritures/nouvelle"
            className="flex items-center gap-sm rounded-lg bg-primary-500 px-lg py-md text-sm font-bold text-white shadow-md transition hover:brightness-110"
          >
            <PlusIcon className="h-4 w-4" />
            Nouvelle écriture
          </Link>
        )}
      </div>

      <div className="mt-lg flex flex-wrap gap-sm">
        <Link
          href="/compta/ecritures"
          className={`rounded-full px-lg py-sm text-xs font-bold transition ${
            !searchParams.journal
              ? 'bg-primary-500 text-white'
              : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-100'
          }`}
        >
          Tous
        </Link>
        {Object.entries(JOURNAL_LABELS).map(([code, label]) => (
          <Link
            key={code}
            href={`/compta/ecritures?journal=${code}`}
            className={`rounded-full px-lg py-sm text-xs font-bold transition ${
              searchParams.journal === code
                ? 'bg-primary-500 text-white'
                : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-100'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="mt-lg overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        {((entries ?? []) as BoEntry[]).length === 0 ? (
          <p className="p-xl text-center text-sm text-neutral-500">
            Aucune écriture pour ce filtre.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-lg py-md font-bold">Pièce</th>
                <th className="px-lg py-md font-bold">Date</th>
                <th className="px-lg py-md font-bold">Libellé</th>
                <th className="px-lg py-md text-right font-bold">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {((entries ?? []) as BoEntry[]).map((e) => (
                <tr key={e.id} className="hover:bg-neutral-50">
                  <td className="px-lg py-md font-mono text-xs text-neutral-500">
                    <Link href={`/compta/ecritures/${e.id}`} className="block">
                      {e.entry_no}
                    </Link>
                  </td>
                  <td className="px-lg py-md text-neutral-600">
                    {formatDate(e.entry_date)}
                  </td>
                  <td className="px-lg py-md">
                    <Link href={`/compta/ecritures/${e.id}`} className="block">
                      <span className="font-semibold text-neutral-900">
                        {e.label}
                      </span>
                      {e.reversed_by && (
                        <span className="ml-sm rounded-full bg-warning/10 px-sm py-[2px] text-[10px] font-bold text-warning">
                          Extournée
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-lg py-md text-right font-bold text-neutral-900">
                    {formatFcfa(e.total_fcfa ?? 0)} F
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
