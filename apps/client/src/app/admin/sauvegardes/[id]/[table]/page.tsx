import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadRun, loadTableRows, MAX_EXPLORE_BYTES } from '@/lib/backupRead';

// Explorateur : parcourir une table d'une sauvegarde de secours (recherche, pages de 50 lignes, CSV).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE_SIZE = 50;

function show(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export default async function BackupTableExplorer({
  params,
  searchParams,
}: {
  params: { id: string; table: string };
  searchParams?: { q?: string; page?: string };
}) {
  const run = await loadRun(params.id);
  const meta = run?.tables.find((t) => t.name === params.table);
  if (!run || !meta) notFound();

  const when = new Date(run.started_at).toLocaleString('fr-FR', {
    timeZone: 'Africa/Porto-Novo', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const backHref = `/admin/sauvegardes/${run.id}`;

  if (meta.bytes > MAX_EXPLORE_BYTES) {
    return (
      <div>
        <Link href={backHref} className="text-xs font-bold text-primary-700 hover:underline">← Sauvegarde du {when}</Link>
        <h1 className="mt-md text-2xl font-extrabold text-neutral-900 font-mono">{params.table}</h1>
        <p className="mt-md rounded-lg bg-warning/10 px-md py-sm text-sm text-neutral-800">
          Cette table est trop volumineuse pour être affichée ici. Téléchargez son fichier depuis la page de la sauvegarde,
          ou ouvrez l&apos;archive mensuelle (Excel).
        </p>
      </div>
    );
  }

  const all = await loadTableRows(run, params.table);
  if (!all) notFound();

  const q = (searchParams?.q ?? '').trim().toLowerCase();
  const rows = q ? all.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : all;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(Math.max(parseInt(searchParams?.page ?? '1', 10) || 1, 1), pages);
  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const cols = all.length > 0 ? Object.keys(all[0]) : [];
  const link = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString()}`;

  return (
    <div>
      <Link href={backHref} className="text-xs font-bold text-primary-700 hover:underline">← Sauvegarde du {when}</Link>
      <div className="mt-md flex flex-wrap items-baseline justify-between gap-sm">
        <h1 className="text-2xl font-extrabold text-neutral-900 font-mono">{params.table}</h1>
        <a href={`/admin/sauvegardes/${run.id}/${params.table}/csv`} className="text-xs font-bold text-primary-700 underline">
          Télécharger en CSV (Excel)
        </a>
      </div>
      <p className="mt-xs text-sm text-neutral-600">
        {all.length.toLocaleString('fr-FR')} lignes dans cette sauvegarde
        {q ? ` · ${rows.length.toLocaleString('fr-FR')} correspondent à « ${searchParams?.q} »` : ''}
      </p>

      <form className="mt-md flex gap-sm" action="">
        <input
          name="q"
          defaultValue={searchParams?.q ?? ''}
          placeholder="Rechercher dans toutes les colonnes"
          className="w-full max-w-md rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary-500 px-lg py-sm text-sm font-bold text-white hover:brightness-110">
          Chercher
        </button>
      </form>

      {cols.length === 0 ? (
        <p className="mt-lg rounded-lg bg-neutral-100 p-md text-sm text-neutral-700">Cette table est vide dans cette sauvegarde.</p>
      ) : (
        <section className="mt-lg overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 bg-neutral-100 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="whitespace-nowrap px-md py-sm">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((r, i) => (
                <tr key={i} className="border-b border-neutral-100 last:border-0">
                  {cols.map((c) => {
                    const s = show(r[c]);
                    return (
                      <td key={c} className="max-w-[260px] truncate px-md py-xs font-mono text-[11px] text-neutral-800" title={s}>
                        {s}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {slice.length === 0 && (
                <tr>
                  <td colSpan={cols.length} className="px-md py-lg text-center text-sm text-neutral-500">Aucune ligne ne correspond.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {pages > 1 && (
        <nav className="mt-md flex items-center gap-md text-xs">
          {page > 1 && <Link href={link(page - 1)} className="font-bold text-primary-700 hover:underline">← Précédent</Link>}
          <span className="text-neutral-500">Page {page} / {pages}</span>
          {page < pages && <Link href={link(page + 1)} className="font-bold text-primary-700 hover:underline">Suivant →</Link>}
        </nav>
      )}
    </div>
  );
}
