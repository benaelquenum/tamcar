import { gzipSync } from 'node:zlib';
import { createAdminSupabase } from '@/lib/supabase-admin';

// Sauvegarde logique des données : toutes les tables du schéma public (via les fonctions
// backup_list_tables / backup_export_table, réservées à la clé de service), un fichier JSON
// compressé par table dans le bucket privé « backups », un manifeste, une ligne dans backup_runs.
// Déclenchée chaque jour à 05h00 (heure du Bénin) par pg_cron, ou à la main depuis l'admin.

const BUCKET = 'backups';
const BATCH = 1000;
const RETENTION_DAYS = 30;

export type BackupTable = { name: string; rows: number; bytes: number };
export type BackupResult = { id: string; folder: string; tables: number; rows: number; bytes: number };

/** 2026-10-03T04:00:05.123Z → 2026-10-03-04-00-05 */
function folderName(d: Date): string {
  return d.toISOString().slice(0, 19).replace(/[T:]/g, '-');
}

export async function runBackup(trigger: 'cron' | 'manual', startedBy: string | null = null): Promise<BackupResult> {
  const admin = createAdminSupabase();
  const startedAt = new Date();
  const folder = folderName(startedAt);

  const { data: run, error: insertErr } = await admin
    .from('backup_runs')
    .insert({ trigger, folder, status: 'running', started_by: startedBy })
    .select('id')
    .single();
  if (insertErr || !run) throw new Error('Journal des sauvegardes : ' + (insertErr?.message ?? 'échec'));
  const runId = (run as { id: string }).id;

  try {
    const { data: list, error: listErr } = await admin.rpc('backup_list_tables');
    if (listErr) throw new Error('Liste des tables : ' + listErr.message);
    const names = ((list ?? []) as Array<{ table_name: string }>).map((r) => r.table_name);
    if (names.length === 0) throw new Error('Aucune table à sauvegarder.');

    const tables: BackupTable[] = [];
    let totalRows = 0;
    let totalBytes = 0;

    for (const name of names) {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += BATCH) {
        const { data, error } = await admin.rpc('backup_export_table', { p_table: name, p_offset: offset, p_limit: BATCH });
        if (error) throw new Error(`${name} : ${error.message}`);
        const chunk = (Array.isArray(data) ? data : []) as unknown[];
        rows.push(...chunk);
        if (chunk.length < BATCH) break;
      }
      const gz = gzipSync(Buffer.from(JSON.stringify(rows)));
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(`${folder}/${name}.json.gz`, gz, { contentType: 'application/gzip', upsert: true });
      if (upErr) throw new Error(`Envoi de ${name} : ${upErr.message}`);
      tables.push({ name, rows: rows.length, bytes: gz.length });
      totalRows += rows.length;
      totalBytes += gz.length;
    }

    const manifest = {
      created_at: startedAt.toISOString(),
      trigger,
      format: 'tamcar-backup/1',
      note: 'Un fichier <table>.json.gz par table du schéma public : tableau JSON de lignes (colonnes géographiques en WKB hexadécimal).',
      total_rows: totalRows,
      tables,
    };
    const { error: manErr } = await admin.storage
      .from(BUCKET)
      .upload(`${folder}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), {
        contentType: 'application/json',
        upsert: true,
      });
    if (manErr) throw new Error('Envoi du manifeste : ' + manErr.message);

    await admin
      .from('backup_runs')
      .update({
        status: 'ok',
        finished_at: new Date().toISOString(),
        total_rows: totalRows,
        total_bytes: totalBytes,
        tables,
      })
      .eq('id', runId);

    await purgeOldBackups().catch(() => undefined); // le nettoyage ne doit jamais faire échouer la sauvegarde

    return { id: runId, folder, tables: tables.length, rows: totalRows, bytes: totalBytes };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin
      .from('backup_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), error: message.slice(0, 500) })
      .eq('id', runId);
    throw e;
  }
}

/** Supprime les sauvegardes de plus de 30 jours (fichiers puis ligne du journal). */
export async function purgeOldBackups(): Promise<number> {
  const admin = createAdminSupabase();
  const limit = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const { data } = await admin.from('backup_runs').select('id, folder').lt('started_at', limit);
  const old = (data ?? []) as Array<{ id: string; folder: string }>;
  for (const r of old) {
    const { data: files } = await admin.storage.from(BUCKET).list(r.folder, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${r.folder}/${f.name}`);
    if (paths.length > 0) await admin.storage.from(BUCKET).remove(paths);
    await admin.from('backup_runs').delete().eq('id', r.id);
  }
  return old.length;
}
