import ExcelJS from 'exceljs';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { driveConfigured, drivePing, drivePut } from '@/lib/drive';
import { addMonth, monthKey, monthStart } from '@/lib/months';

// Envoi sur Google Drive (compte de sauvegarde) de ce qui doit rester explorable pour toujours :
//   Memoire/<AAAA-MM>.xlsx  un classeur par mois, un onglet par table, lisible dans Excel / Sheets
//   Fichiers/<bucket>/…     photos et pièces, copiées une seule fois (ou si elles changent)
// Les copies de secours (Secours/…) sont envoyées par lib/backup.ts.
// Reprise automatique : un mois ou un fichier non envoyé est retenté à l'appel suivant (chaque nuit).

type Admin = ReturnType<typeof createAdminSupabase>;

const BATCH = 1000;
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const FILES_CONCURRENCY = 4;
const CELL_LIMIT = 32_000; // une cellule Excel ne dépasse pas 32 767 caractères
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Tables du journal de sauvegarde lui-même : jamais archivées. */
const NOT_ARCHIVED = new Set(['backup_runs', 'backup_archives', 'backup_drive_files']);

/**
 * Tables d'état : leur contenu courant (chauffeurs, véhicules, tarifs, comptes…) est exporté en entier
 * dans chaque archive. Les autres tables qui ont une colonne de date sont des historiques : chaque
 * archive ne contient que les lignes du mois, donc une ligne n'est jamais dupliquée d'un mois à l'autre.
 */
const STATE_TABLES = new Set([
  'profiles', 'drivers', 'vehicles', 'wallets', 'subscriptions', 'subscription_plans',
  'client_favorite_places', 'driver_requests', 'dealer_partners', 'dealer_advances',
  'promo_codes', 'referral_codes', 'checkpoints', 'corridor_prices', 'ops_cities', 'ops_city_managers',
  'home_banners', 'places', 'bo_accounts', 'bo_employees', 'bo_documents', 'bo_employee_documents',
  'bo_deadlines', 'bo_pending_operations',
]);

export type ArchiveSummary = { done: string[]; remaining: number; errors: string[] };
export type DriveFilesSummary = {
  source_files: number;
  source_bytes: number;
  copied: number;
  failed: number;
  remaining: number;
  failed_names: string[];
};
export type DriveSyncResult =
  | { configured: false }
  | { configured: true; folder: string; archive: ArchiveSummary; files: DriveFilesSummary };

// ------------------------------------------------------------ mois
/** Mois révolus, du premier mois de données au mois dernier, qui n'ont pas encore d'archive réussie. */
async function pendingMonths(admin: Admin): Promise<string[]> {
  const last = addMonth(monthKey(new Date()), -1);
  const { data: first } = await admin.from('profiles').select('created_at').order('created_at', { ascending: true }).limit(1);
  const firstAt = (first as Array<{ created_at: string }> | null)?.[0]?.created_at;
  const start = firstAt ? monthKey(new Date(firstAt)) : last;
  const { data: done } = await admin.from('backup_archives').select('month').eq('status', 'ok');
  const doneSet = new Set(((done ?? []) as Array<{ month: string }>).map((r) => r.month));
  const out: string[] = [];
  for (let m = start; m <= last; m = addMonth(m, 1)) if (!doneSet.has(m)) out.push(m);
  return out;
}

// ------------------------------------------------------------ classeur mensuel
type Row = Record<string, unknown>;

function cell(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > CELL_LIMIT ? s.slice(0, CELL_LIMIT) + '…' : s;
}

async function fetchAll(admin: Admin, table: string, from: string | null, to: string | null): Promise<Row[]> {
  const out: Row[] = [];
  for (let offset = 0; ; offset += BATCH) {
    const { data, error } = await admin.rpc('backup_export_readable', {
      p_table: table, p_from: from, p_to: to, p_offset: offset, p_limit: BATCH,
    });
    if (error) throw new Error(`${table} : ${error.message}`);
    const chunk = (Array.isArray(data) ? data : []) as Row[];
    out.push(...chunk);
    if (chunk.length < BATCH) break;
  }
  return out;
}

type TableMeta = { name: string; mode: 'mois' | 'etat'; rows: number };

export async function buildMonth(admin: Admin, ym: string): Promise<{ buffer: Buffer; meta: TableMeta[]; totalRows: number }> {
  const { data: info, error } = await admin.rpc('backup_tables_info');
  if (error) throw new Error('Liste des tables : ' + error.message);
  const tables = ((info ?? []) as Array<{ table_name: string; date_column: string | null }>).filter(
    (t) => !NOT_ARCHIVED.has(t.table_name),
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'TamCar';
  wb.created = new Date();
  const readme = wb.addWorksheet('LISEZ-MOI');
  const index = wb.addWorksheet('Index');

  const from = monthStart(ym);
  const to = monthStart(addMonth(ym, 1));
  const meta: TableMeta[] = [];
  let totalRows = 0;

  for (const t of tables) {
    const mode: 'mois' | 'etat' = t.date_column && !STATE_TABLES.has(t.table_name) ? 'mois' : 'etat';
    const rows = await fetchAll(admin, t.table_name, mode === 'mois' ? from : null, mode === 'mois' ? to : null);
    meta.push({ name: t.table_name, mode, rows: rows.length });
    totalRows += rows.length;
    if (rows.length === 0) continue;

    const ws = wb.addWorksheet(t.table_name.slice(0, 31));
    const cols = Object.keys(rows[0]);
    ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(Math.max(c.length + 2, 12), 40) }));
    for (const r of rows) ws.addRow(cols.map((c) => cell(r[c])));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  }

  const lines = [
    `TamCar — archive du mois ${ym}`,
    `Générée le ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Porto-Novo' })} (heure du Bénin).`,
    '',
    'Chaque onglet est une table de la plateforme (courses, chauffeurs, portefeuilles, comptabilité…).',
    "L'onglet Index liste toutes les tables, leur mode et leur nombre de lignes ; une table vide n'a pas d'onglet.",
    '',
    "Mode « mois » : historique, uniquement les lignes créées pendant ce mois (heure du Bénin). Une ligne figure dans un seul mois.",
    "Mode « etat » : état complet de la table au moment de l'archivage (chauffeurs, véhicules, tarifs, comptes, portefeuilles…).",
    '',
    'Les positions sont séparées en deux colonnes (…_lat et …_lng). Les contenus structurés sont écrits en JSON.',
    "Les mots de passe ne sont jamais exportés. Les lieux importés d'OpenStreetMap ne sont pas inclus (réimportables).",
    'Ce fichier est une copie : ne le modifiez pas, dupliquez-le avant de travailler dessus.',
  ];
  lines.forEach((l) => readme.addRow([l]));
  readme.getColumn(1).width = 120;
  readme.getRow(1).font = { bold: true, size: 14 };

  index.columns = [
    { header: 'table', key: 'name', width: 32 },
    { header: 'mode', key: 'mode', width: 10 },
    { header: 'lignes', key: 'rows', width: 12 },
  ];
  meta.forEach((m) => index.addRow(m));
  index.getRow(1).font = { bold: true };

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, meta, totalRows };
}

/** Génère et envoie les archives des mois révolus manquants, tant qu'il reste du temps. */
export async function runMonthlyArchive(admin: Admin, deadline: number): Promise<ArchiveSummary> {
  const pending = await pendingMonths(admin);
  const done: string[] = [];
  const errors: string[] = [];

  for (const ym of pending) {
    if (Date.now() > deadline - 15_000) break;
    try {
      const { buffer, meta, totalRows } = await buildMonth(admin, ym);
      if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error(`archive trop volumineuse (${Math.round(buffer.length / 1_048_576)} Mo)`);
      await drivePut(`Memoire/${ym}.xlsx`, buffer, XLSX_MIME);
      await admin.from('backup_archives').upsert({
        month: ym, status: 'ok', rows: totalRows, bytes: buffer.length, tables: meta, error: null,
        generated_at: new Date().toISOString(),
      });
      done.push(ym);
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      await admin.from('backup_archives').upsert({
        month: ym, status: 'failed', error: message, generated_at: new Date().toISOString(),
      });
      errors.push(`${ym} : ${message}`);
      break; // inutile d'insister sur les mois suivants : même cause probable, reprise demain
    }
  }
  return { done, remaining: pending.length - done.length, errors };
}

// ------------------------------------------------------------ fichiers
/** Copie sur Drive les fichiers stockés pas encore envoyés (ou modifiés depuis), tant qu'il reste du temps. */
export async function syncFilesToDrive(admin: Admin, deadline: number): Promise<DriveFilesSummary> {
  const { data: todo, error } = await admin.rpc('backup_drive_files_todo', { p_limit: 100 });
  if (error) throw new Error('Liste des fichiers : ' + error.message);
  const queue = (todo ?? []) as Array<{ bucket_id: string; name: string; size: number; updated_at: string }>;

  let copied = 0;
  let next = 0;
  const failed: string[] = [];

  const worker = async () => {
    while (next < queue.length && Date.now() < deadline) {
      const f = queue[next++];
      try {
        if (f.size > MAX_FILE_BYTES) throw new Error('fichier trop volumineux');
        const { data: blob, error: dlErr } = await admin.storage.from(f.bucket_id).download(f.name);
        if (dlErr || !blob) throw new Error(dlErr?.message ?? 'téléchargement impossible');
        const buf = Buffer.from(await blob.arrayBuffer());
        await drivePut(`Fichiers/${f.bucket_id}/${f.name}`, buf, blob.type || 'application/octet-stream');
        await admin.from('backup_drive_files').upsert({
          bucket_id: f.bucket_id, name: f.name, size: buf.length, source_updated_at: f.updated_at,
          synced_at: new Date().toISOString(),
        });
        copied += 1;
      } catch (e) {
        failed.push(`${f.bucket_id}/${f.name} : ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
      }
    }
  };
  await Promise.all(Array.from({ length: FILES_CONCURRENCY }, worker));

  const { data: stats } = await admin.rpc('backup_drive_files_stats');
  const st = (stats ?? {}) as { source_files?: number; source_bytes?: number; remaining?: number };
  return {
    source_files: Number(st.source_files ?? 0),
    source_bytes: Number(st.source_bytes ?? 0),
    copied,
    failed: failed.length,
    remaining: Number(st.remaining ?? 0),
    failed_names: failed.slice(0, 20),
  };
}

// ------------------------------------------------------------ point d'entrée
/** Archives mensuelles puis fichiers, dans un budget de ~50 s (limite de la route : 60 s). */
export async function runDriveSync(): Promise<DriveSyncResult> {
  if (!driveConfigured()) return { configured: false };
  const admin = createAdminSupabase();
  const deadline = Date.now() + 50_000;
  const folder = await drivePing(); // échoue tout de suite si l'adresse ou le mot de passe de liaison sont faux
  const archive = await runMonthlyArchive(admin, deadline);
  const files = await syncFilesToDrive(admin, deadline);
  return { configured: true, folder, archive, files };
}
