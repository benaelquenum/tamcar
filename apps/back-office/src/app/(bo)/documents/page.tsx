import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import {
  DOC_KIND_LABELS,
  DOC_STATUS_LABELS,
  DOC_STATUS_STYLES,
  formatDate,
  type BoDocKind,
  type BoDocument,
} from '@/lib/bo';
import { PlusIcon, SearchIcon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

type SearchParams = { q?: string; type?: string };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();
  const q = (searchParams.q ?? '').trim();

  let query = supabase
    .from('bo_documents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.type) query = query.eq('kind', searchParams.type);
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,correspondent.ilike.%${q}%,reg_number.ilike.%${q}%`,
    );
  }

  const { data: docs } = await query;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">
            Coffre documentaire
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Tous les documents de l&apos;entreprise, numérotés et retrouvables.
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

      <form method="get" className="mt-lg flex flex-wrap gap-sm">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-md top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Rechercher par objet, correspondant ou numéro…"
            className="w-full rounded-lg bg-white py-md pl-2xl pr-lg text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          name="type"
          defaultValue={searchParams.type ?? ''}
          className="rounded-lg bg-white px-lg py-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Tous les types</option>
          {(Object.keys(DOC_KIND_LABELS) as BoDocKind[]).map((k) => (
            <option key={k} value={k}>
              {DOC_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-neutral-900 px-lg py-md text-sm font-bold text-white transition hover:brightness-110"
        >
          Filtrer
        </button>
      </form>

      <div className="mt-lg overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        {(docs ?? []).length === 0 ? (
          <p className="p-xl text-center text-sm text-neutral-500">
            Aucun document trouvé.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-lg py-md font-bold">N°</th>
                <th className="px-lg py-md font-bold">Objet</th>
                <th className="px-lg py-md font-bold">Type</th>
                <th className="px-lg py-md font-bold">Enregistré le</th>
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
                    <Link href={`/courrier/${doc.id}`} className="block font-semibold text-neutral-900">
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-lg py-md text-neutral-600">
                    {DOC_KIND_LABELS[doc.kind]}
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
