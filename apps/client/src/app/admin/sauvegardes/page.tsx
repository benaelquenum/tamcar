import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { driveConfigured } from '@/lib/drive';
import { addMonth, monthKey, monthLabel } from '@/lib/months';
import { runBackupNow, runDriveSyncNow } from './actions';

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
  files: { source_files: number; source_bytes: number; copied: number; failed: number; remaining: number } | null;
  drive: { path: string; bytes: number; purged: number } | { error: string } | null;
  error: string | null;
};

type Archive = { month: string; status: 'ok' | 'failed'; rows: number; bytes: number; error: string | null; generated_at: string };

/** Tables de données (hors fichiers auth_*, qui sont les comptes de connexion). */
function dataTables(r: Run): number {
  return r.tables.filter((t) => !t.name.startsWith('auth_')).length;
}
function hasAccounts(r: Run): boolean {
  return r.tables.some((t) => t.name === 'auth_users');
}

const TZ = 'Africa/Porto-Novo';
const SUPABASE_FREE_BYTES = 1_073_741_824; // 1 Go de stockage sur l'offre gratuite, tous fichiers confondus

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} Go`;
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

const DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1ImvQ_wljQOCJ2MhXR_Lbm4Akg9pHxyc5';

export default async function AdminBackupsPage({
  searchParams,
}: {
  searchParams?: { ok?: string; err?: string; drive?: string };
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

  // Drive, archives mensuelles et taille : lus avec le client de service (la page est réservée aux admins par le layout).
  const configured = driveConfigured();
  let archives: Archive[] = [];
  let driveFiles = null as { source_files: number; source_bytes: number; remaining: number } | null;
  let firstMonth: string | null = null;
  if (!notReady) {
    try {
      const admin = createAdminSupabase();
      const [a, f, p] = await Promise.all([
        admin.from('backup_archives').select('month, status, rows, bytes, error, generated_at').order('month', { ascending: false }),
        admin.rpc('backup_drive_files_stats'),
        admin.from('profiles').select('created_at').order('created_at', { ascending: true }).limit(1),
      ]);
      archives = (a.data ?? []) as Archive[];
      driveFiles = (f.data as typeof driveFiles) ?? null;
      const first = (p.data as Array<{ created_at: string }> | null)?.[0]?.created_at;
      firstMonth = first ? monthKey(new Date(first)) : null;
    } catch {
      /* les sections Drive restent vides : la page de sauvegarde continue de fonctionner */
    }
  }
  const archiveByMonth = new Map(archives.map((a) => [a.month, a]));
  const currentMonth = monthKey(new Date());
  const months: string[] = [];
  if (firstMonth) for (let m = currentMonth; m >= firstMonth; m = addMonth(m, -1)) months.push(m);
  const lastDriveRun = runs.find((r) => r.drive && 'path' in r.drive);

  // Stockage Supabase occupé par les sauvegardes : sauvegardes datées (compressées) + copie des fichiers.
  const usedBytes = runs.reduce((s, r) => s + (r.total_bytes ?? 0), 0) + (lastOk?.files?.source_bytes ?? 0);

  return (
    <div>
      <div className="mb-xl flex flex-wrap items-baseline justify-between gap-sm">
        <h1 className="text-2xl font-extrabold text-neutral-900">Sauvegardes</h1>
        <p className="text-sm text-neutral-600">
          Automatique : <strong className="text-neutral-900">tous les jours à 05h00</strong> (heure du Bénin) · conservées 14 jours
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
      {searchParams?.drive && (
        <p role="status" className="mb-md rounded-lg bg-success/10 px-md py-sm text-sm font-semibold text-success">
          Envoi sur Drive terminé : {searchParams.drive}.
        </p>
      )}
      {searchParams?.err && (
        <p role="alert" className="mb-md rounded-lg bg-error/10 px-md py-sm text-sm font-semibold text-error">
          {searchParams.err}
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
                      {ago(lastOk.started_at)} · {dataTables(lastOk)} tables · {fmtNum(lastOk.total_rows)} lignes · {fmtSize(lastOk.total_bytes)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {hasAccounts(lastOk) ? 'Comptes de connexion inclus' : 'Comptes de connexion non inclus'} ·{' '}
                      {lastOk.files
                        ? `${fmtNum(lastOk.files.source_files)} fichiers stockés (${fmtSize(lastOk.files.source_bytes)})${
                            lastOk.files.remaining > 0 ? `, ${fmtNum(lastOk.files.remaining)} restent à copier` : ' tous copiés'
                          }`
                        : 'fichiers stockés non inclus'}
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
                <p className="mt-xs text-[10px] text-neutral-500">
                  Compter quelques secondes{configured ? ' (le fichier de secours part aussi sur Drive).' : '.'}
                </p>
              </form>
            </div>

            <div className="mt-md border-t border-neutral-100 pt-md">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Espace occupé dans Supabase par les sauvegardes</p>
              <div className="mt-xs h-2 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={`h-full ${usedBytes / SUPABASE_FREE_BYTES > 0.5 ? 'bg-warning' : 'bg-primary-500'}`}
                  style={{ width: `${Math.max(1, Math.min(100, (usedBytes / SUPABASE_FREE_BYTES) * 100))}%` }}
                />
              </div>
              <p className="mt-xs text-xs text-neutral-500">
                {fmtSize(usedBytes)} sur les 1 Go de stockage de l&apos;offre gratuite (partagés avec tous les fichiers de la plateforme).
              </p>
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

          <section className="mt-xl rounded-2xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
            <div className="flex flex-wrap items-start justify-between gap-md">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Copie hors Supabase : Google Drive</p>
                {configured ? (
                  <>
                    <p className="mt-xs text-sm font-semibold text-neutral-900">Drive est configuré.</p>
                    <ul className="mt-xs space-y-0.5 text-xs text-neutral-600">
                      <li>
                        Fichier de secours : une copie par semaine (le dimanche), gardée 12 semaines
                        {lastDriveRun ? ` · dernière envoyée le ${fmtDay(lastDriveRun.started_at)}` : ' · aucune envoyée pour l’instant'}.
                      </li>
                      <li>
                        Mémoire : une archive Excel par mois, gardée pour toujours ·{' '}
                        {archives.filter((a) => a.status === 'ok').length} envoyée(s).
                      </li>
                      <li>
                        Fichiers (photos, pièces) :{' '}
                        {driveFiles
                          ? `${fmtNum(driveFiles.source_files - driveFiles.remaining)} / ${fmtNum(driveFiles.source_files)} copiés (${fmtSize(driveFiles.source_bytes)})`
                          : '—'}
                        .
                      </li>
                    </ul>
                    <a href={DRIVE_FOLDER_URL} target="_blank" rel="noreferrer" className="mt-xs inline-block text-xs font-bold text-primary-700 underline">
                      Ouvrir le dossier Drive (compte tamcarbackups)
                    </a>
                  </>
                ) : (
                  <p className="mt-xs max-w-xl text-xs text-neutral-600">
                    Drive n&apos;est pas encore branché. Il faut ajouter dans Vercel (projet client) les variables{' '}
                    <code>DRIVE_BACKUP_URL</code> et <code>DRIVE_BACKUP_SECRET</code>, puis redéployer.
                  </p>
                )}
              </div>
              {configured && (
                <form action={runDriveSyncNow}>
                  <button
                    type="submit"
                    className="rounded-lg border border-primary-500 px-lg py-sm text-sm font-bold text-primary-700 hover:bg-primary-500/5"
                  >
                    Envoyer sur Drive maintenant
                  </button>
                  <p className="mt-xs text-[10px] text-neutral-500">Archives manquantes et fichiers ; automatique chaque nuit à 05h20.</p>
                </form>
              )}
            </div>
          </section>

          {months.length > 0 && (
            <section className="mt-xl overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
              <div className="border-b border-neutral-200 bg-neutral-100 px-md py-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Mémoire : archives mensuelles lisibles (Excel)</p>
                <p className="text-[11px] text-neutral-500">
                  Un classeur par mois, un onglet par table. Conservé pour toujours sur Drive ; téléchargeable ici à tout moment.
                </p>
              </div>
              <table className="w-full">
                <tbody>
                  {months.map((m) => {
                    const a = archiveByMonth.get(m);
                    const isCurrent = m === currentMonth;
                    return (
                      <tr key={m} className="border-b border-neutral-100 last:border-0">
                        <td className="px-md py-sm text-sm font-semibold capitalize text-neutral-900">{monthLabel(m)}</td>
                        <td className="px-md py-sm text-xs text-neutral-600">
                          {isCurrent ? (
                            'En cours : archivée sur Drive le 1er du mois prochain'
                          ) : a?.status === 'ok' ? (
                            <span className="font-semibold text-success">
                              Sur Drive depuis le {fmtDay(a.generated_at)} · {fmtNum(a.rows)} lignes · {fmtSize(a.bytes)}
                            </span>
                          ) : a?.status === 'failed' ? (
                            <span className="font-semibold text-error" title={a.error ?? ''}>Échec d&apos;envoi, nouvel essai cette nuit</span>
                          ) : configured ? (
                            'En attente d’envoi (cette nuit)'
                          ) : (
                            'Drive non configuré'
                          )}
                        </td>
                        <td className="px-md py-sm text-right">
                          <a href={`/admin/sauvegardes/archive?month=${m}`} className="text-xs font-bold text-primary-700 hover:underline">
                            Télécharger (Excel)
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

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
                          {r.drive && 'path' in r.drive && <span className="ml-xs text-[10px] font-semibold text-neutral-500">+ Drive</span>}
                          {r.error && <p className="mt-0.5 max-w-xs truncate text-[10px] text-error" title={r.error}>{r.error}</p>}
                        </td>
                        <td className="px-md py-sm text-right text-sm tabular-nums">{dataTables(r) || '—'}</td>
                        <td className="px-md py-sm text-right text-sm tabular-nums">{fmtNum(r.total_rows)}</td>
                        <td className="px-md py-sm text-right text-sm tabular-nums">{fmtSize(r.total_bytes)}</td>
                        <td className="px-md py-sm text-right text-xs text-neutral-500">{duration(r)}</td>
                        <td className="px-md py-sm text-right">
                          {r.status === 'ok' && (
                            <Link href={`/admin/sauvegardes/${r.id}`} className="text-xs font-bold text-primary-700 hover:underline">
                              Explorer →
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
            Trois couches : le <strong>secours</strong> (sauvegarde quotidienne de toutes les tables, des comptes de connexion sans mots de passe et d&apos;une copie
            des fichiers, gardée 14 jours ici ; une copie par semaine sur Drive pendant 12 semaines), la <strong>mémoire</strong> (archive Excel mensuelle, conservée
            pour toujours) et l&apos;<strong>explorateur</strong> (« Explorer » : parcourir, chercher et exporter n&apos;importe quelle table d&apos;une sauvegarde).
            Les lieux importés d&apos;OpenStreetMap, réimportables, ne sont pas sauvegardés. Hors secrets et jetons d&apos;appareils.
          </p>
        </>
      )}
    </div>
  );
}
