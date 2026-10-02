import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { runBackupNow } from './actions';

// La sauvegarde manuelle exporte toutes les tables : on laisse jusqu'à 60 s.
export const maxDuration = 60;

type Run = {
  id: string;
  trigger: 'cron' | 'manual';
  status: 'running' | 'ok' | 'failed';
  folder: string;
  started_at: string;
  finished_at: string | null;
  total_rows: number | null;
  total_bytes: number | null;
  tables: Array<{ name: string; rows: number; bytes: number }>;
  error: string | null;
};

const TZ = 'Africa/Porto-Novo';

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function fmtSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}
function fmtNum(n: number | null): string {
  return n == null ? '—' : n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
function ago(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return `il y a ${Math.max(1, min)} min`;
  if (min < 2880) return `il y a ${Math.floor(min / 60)} h`;
  return `il y a ${Math.floor(min / 1440)} jours`;
}
function duration(r: Run): string {
  if (!r.finished_at) return '—';
  const s = Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

const STATUS = {
  ok: { label: 'Réussie', cls: 'bg-success/15 text-success' },
  failed: { label: 'Échec', cls: 'bg-error/15 text-error' },
  running: { label: 'En cours', cls: 'bg-warning/15 text-warning' },
} as const;

export default async function AdminBackupsPage({
  searchParams,
}: {
  searchParams?: { ok?: string; err?: string };
}) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('backup_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(40);
  const runs = (data ?? []) as Run[];
  const notReady = Boolean(error && /does not exist|schema cache|relation/i.test(error.message));
  const lastOk = runs.find((r) => r.status === 'ok');
  const lateHours = lastOk ? (Date.now() - new Date(lastOk.started_at).getTime()) / 3_600_000 : null;
  const late = lateHours === null || lateHours > 26;

  return (
    <div>
      <div className="mb-xl flex flex-wrap items-baseline justify-between gap-sm">
        <h1 className="text-2xl font-extrabold text-neutral-900">Sauvegardes</h1>
        <p className="text-sm text-neutral-600">
          Automatique : <strong className="text-neutral-900">tous les jours à 05h00</strong> (heure du Bénin) · conservées 30 jours
        </p>
      </div>

      {notReady && (
        <div className="rounded-xl bg-white p-xl text-sm text-neutral-700 shadow-sm ring-1 ring-warning/40">
          Les sauvegardes ne sont pas encore activées en base : la migration <code>20261002170000_daily_backup.sql</code> reste à passer.
        </div>
      )}

      {searchParams?.ok && (
        <p role="status" className="mb-md rounded-lg bg-success/10 px-md py-sm text-sm font-semibold text-success">
          Sauvegarde terminée.
        </p>
      )}
      {searchParams?.err && (
        <p role="alert" className="mb-md rounded-lg bg-error/10 px-md py-sm text-sm font-semibold text-error">
          La sauvegarde a échoué : {searchParams.err}
        </p>
      )}

      {!notReady && (
        <>
          <section className={`rounded-2xl bg-white p-lg shadow-sm ring-1 ${late ? 'ring-warning/50' : 'ring-neutral-200'}`}>
            <div className="flex flex-wrap items-center justify-between gap-md">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Dernière sauvegarde réussie</p>
                {lastOk ? (
                  <>
                    <p className="mt-xs text-xl font-extrabold text-neutral-900">{fmtDateTime(lastOk.started_at)}</p>
                    <p className="text-xs text-neutral-500">
                      {ago(lastOk.started_at)} · {lastOk.tables.length} tables · {fmtNum(lastOk.total_rows)} lignes · {fmtSize(lastOk.total_bytes)}
                    </p>
                  </>
                ) : (
                  <p className="mt-xs text-sm font-semibold text-warning">Aucune sauvegarde réussie pour l&apos;instant.</p>
                )}
                {late && lastOk && (
                  <p className="mt-xs text-xs font-semibold text-warning">
                    Plus de 26 heures : la sauvegarde automatique de 05h00 n&apos;a pas abouti. Vérifiez le détail ci-dessous.
                  </p>
                )}
              </div>
              <form action={runBackupNow}>
                <button
                  type="submit"
                  className="rounded-lg bg-primary-500 px-lg py-sm text-sm font-bold text-white shadow-sm hover:brightness-110"
                >
                  Sauvegarder maintenant
                </button>
                <p className="mt-xs text-[10px] text-neutral-500">Compter quelques secondes.</p>
              </form>
            </div>

            {runs.length === 0 && (
              <div className="mt-md rounded-lg bg-neutral-100 p-md text-xs text-neutral-700">
                <p className="font-bold text-neutral-900">Pour déclencher la sauvegarde automatique de 05h00, une seule fois :</p>
                <pre className="mt-xs overflow-x-auto rounded-md bg-white p-sm text-[11px] text-neutral-800 ring-1 ring-neutral-200">{`insert into public._push_settings (key, value)
values ('backup_url', 'https://<votre-domaine-client>/api/cron/backup')
on conflict (key) do update set value = excluded.value, updated_at = now();`}</pre>
                <p className="mt-xs">
                  Remplacez l&apos;adresse par celle de votre site client, puis lancez une première sauvegarde avec le bouton ci-dessus.
                </p>
              </div>
            )}
          </section>

          {runs.length > 0 && (
            <section className="mt-xl overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
              <table className="w-full">
                <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
                  <tr>
                    <th className="px-md py-sm">Date</th>
                    <th className="px-md py-sm">Origine</th>
                    <th className="px-md py-sm">Statut</th>
                    <th className="px-md py-sm text-right">Tables</th>
                    <th className="px-md py-sm text-right">Lignes</th>
                    <th className="px-md py-sm text-right">Taille</th>
                    <th className="px-md py-sm text-right">Durée</th>
                    <th className="px-md py-sm" />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => {
                    const st = STATUS[r.status];
                    return (
                      <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                        <td className="px-md py-sm text-sm text-neutral-900">{fmtDateTime(r.started_at)}</td>
                        <td className="px-md py-sm text-xs text-neutral-600">{r.trigger === 'cron' ? 'Automatique' : 'Manuelle'}</td>
                        <td className="px-md py-sm">
                          <span className={`rounded-full px-sm py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                          {r.error && <p className="mt-0.5 max-w-xs truncate text-[10px] text-error" title={r.error}>{r.error}</p>}
                        </td>
                        <td className="px-md py-sm text-right text-sm tabular-nums">{r.tables.length || '—'}</td>
                        <td className="px-md py-sm text-right text-sm tabular-nums">{fmtNum(r.total_rows)}</td>
                        <td className="px-md py-sm text-right text-sm tabular-nums">{fmtSize(r.total_bytes)}</td>
                        <td className="px-md py-sm text-right text-xs text-neutral-500">{duration(r)}</td>
                        <td className="px-md py-sm text-right">
                          {r.status === 'ok' && (
                            <Link href={`/admin/sauvegardes/${r.id}`} className="text-xs font-bold text-primary-700 hover:underline">
                              Fichiers →
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          <p className="mt-lg text-xs text-neutral-500">
            Cette sauvegarde exporte les données de toutes les tables de la plateforme (courses, chauffeurs, portefeuilles, locations…),
            hors secrets et jetons d&apos;appareils. Elle complète les sauvegardes physiques quotidiennes de Supabase (Database → Backups).
          </p>
        </>
      )}
    </div>
  );
}
