import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  DOC_KIND_LABELS,
  DOC_STATUS_LABELS,
  DOC_STATUS_STYLES,
  formatDate,
  type BoDocument,
} from '@/lib/bo';
import { PlusIcon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

type SearchParams = { statut?: string; sens?: string };

export default async function CourrierPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();

  let query = supabase
    .from('bo_documents')
    .select('*')
    .in('kind', ['courrier_arrivee', 'courrier_depart'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.statut) query = query.eq('status', searchParams.statut);
  if (searchParams.sens === 'arrivee') query = query.eq('kind', 'courrier_arrivee');
  if (searchParams.sens === 'depart') query = query.eq('kind', 'courrier_depart');

  const { data: docs } = await query;

  const filters = [
    { href: '/courrier', label: 'Tout', active: !searchParams.statut && !searchParams.sens },
    { href: '/courrier?sens=arrivee', label: 'Arrivée', active: searchParams.sens === 'arrivee' },
    { href: '/courrier?sens=depart', label: 'Départ', active: searchParams.sens === 'depart' },
    { href: '/courrier?statut=a_traiter', label: 'À traiter', active: searchParams.statut === 'a_traiter' },
    { href: '/courrier?statut=traite', label: 'Traités', active: searchParams.statut === 'traite' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">
            Registre du courrier
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Tout document entrant ou sortant est scanné, numéroté et classé ici.
          </p>
        </div>
        <Link
          href="/courrier/nouveau"
          className="flex items-center gap-sm rounded-lg bg-primary-500 px-lg py-md text-sm font-bold text-white shadow-md transition hover:brightness-110"
        >
          <PlusIcon className="h-4 w-4" />
          Enregistrer
        </Link>
      </div>

      <div className="mt-lg flex flex-wrap gap-sm">
        {filters.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className={`rounded-full px-lg py-sm text-xs font-bold transition ${
              f.active
                ? 'bg-primary-500 text-white'
                : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-100'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mt-lg overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        {(docs ?? []).length === 0 ? (
          <p className="p-xl text-center text-sm text-neutral-500">
            Aucun courrier enregistré pour ce filtre.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-lg py-md font-bold">N°</th>
                <th className="px-lg py-md font-bold">Objet</th>
                <th className="px-lg py-md font-bold">Correspondant</th>
                <th className="px-lg py-md font-bold">Date</th>
                <th className="px-lg py-md font-bold">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {(docs as BoDocument[]).map((doc) => (
                <tr key={doc.id} className="hover:bg-neutral-50">
                  <td className="px-lg py-md font-mono text-xs text-neutral-500">
                    <Link href={`/courrier/${doc.id}`} className="block">
                      {doc.reg_number}
                    </Link>
                  </td>
                  <td className="px-lg py-md">
                    <Link href={`/courrier/${doc.id}`} className="block">
                      <span className="font-semibold text-neutral-900">
                        {doc.title}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {DOC_KIND_LABELS[doc.kind]}
                      </span>
                    </Link>
                  </td>
                  <td className="px-lg py-md text-neutral-600">
                    {doc.correspondent ?? '—'}
                  </td>
                  <td className="px-lg py-md text-neutral-600">
                    {formatDate(doc.logged_on)}
                  </td>
                  <td className="px-lg py-md">
                    <span
                      className={`rounded-full px-md py-xs text-xs font-bold ${DOC_STATUS_STYLES[doc.status]}`}
                    >
                      {DOC_STATUS_LABELS[doc.status]}
                    </span>
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
