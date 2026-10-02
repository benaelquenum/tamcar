import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

type Run = {
  id: string;
  trigger: 'cron' | 'manual';
  status: string;
  folder: string;
  started_at: string;
  total_rows: number | null;
  total_bytes: number | null;
  tables: Array<{ name: string; rows: number; bytes: number }>;
};

function fmtSize(bytes: number): string {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}
function fmtNum(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export default async function AdminBackupDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data } = await supabase.from('backup_runs').select('*').eq('id', params.id).maybeSingle();
  if (!data) notFound();
  const run = data as Run;

  // Liens signés d'une heure (bucket privé, lecture réservée à l'équipe).
  const paths = [`${run.folder}/manifest.json`, ...run.tables.map((t) => `${run.folder}/${t.name}.json.gz`)];
  const { data: signed } = await supabase.storage.from('backups').createSignedUrls(paths, 3600);
  const urls: Record<string, string> = {};
  for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;

  const sorted = [...run.tables].sort((a, b) => b.rows - a.rows);

  return (
    <div>
      <Link href="/admin/sauvegardes" className="text-xs font-bold text-primary-700 hover:underline">← Sauvegardes</Link>
      <h1 className="mt-md text-2xl font-extrabold text-neutral-900">
        Sauvegarde du {new Date(run.started_at).toLocaleString('fr-FR', {
          timeZone: 'Africa/Porto-Novo', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })}
      </h1>
      <p className="mt-xs text-sm text-neutral-600">
        {run.trigger === 'cron' ? 'Automatique' : 'Manuelle'} · {run.tables.length} tables · {fmtNum(run.total_rows ?? 0)} lignes ·{' '}
        {fmtSize(run.total_bytes ?? 0)} compressés
      </p>
      <p className="mt-xs text-xs text-neutral-500">
        Chaque fichier <code>.json.gz</code> contient les lignes d&apos;une table. Les liens sont valables une heure.
        {urls[`${run.folder}/manifest.json`] && (
          <>
            {' '}
            <a href={urls[`${run.folder}/manifest.json`]} className="font-bold text-primary-700 underline">Manifeste</a>
          </>
        )}
      </p>

      <section className="mt-lg overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        <table className="w-full">
          <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
            <tr>
              <th className="px-md py-sm">Table</th>
              <th className="px-md py-sm text-right">Lignes</th>
              <th className="px-md py-sm text-right">Taille</th>
              <th className="px-md py-sm" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const url = urls[`${run.folder}/${t.name}.json.gz`];
              return (
                <tr key={t.name} className="border-b border-neutral-100 last:border-0">
                  <td className="px-md py-xs font-mono text-xs text-neutral-900">{t.name}</td>
                  <td className="px-md py-xs text-right text-sm tabular-nums">{fmtNum(t.rows)}</td>
                  <td className="px-md py-xs text-right text-xs text-neutral-500">{fmtSize(t.bytes)}</td>
                  <td className="px-md py-xs text-right">
                    {url ? (
                      <a href={url} className="text-xs font-bold text-primary-700 hover:underline">Télécharger</a>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
