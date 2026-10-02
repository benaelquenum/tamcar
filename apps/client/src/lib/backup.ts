import { gzipSync } from 'node:zlib';
import { createAdminSupabase } from '@/lib/supabase-admin';

// Sauvegarde logique des données : toutes les tables du schéma public (via les fonctions
// backup_list_tables / backup_export_table, réservées à la clé de service), un fichier JSON
// compressé par table dans le bucket privé « backups », un manifeste, une ligne dans backup_runs.
// S'y ajoutent les comptes de connexion (schéma auth, SANS mots de passe ni jetons : fichiers
// auth_users / auth_identities) et une copie miroir des fichiers stockés (backups/files/<bucket>/…,
// copiés une seule fois, hors fonds de carte). Les sauvegardes datées sont conservées 30 jours ;
// le miroir de fichiers n'est jamais purgé.
// Déclenchée chaque jour à 05h00 (heure du Bénin) par pg_cron, ou à la main depuis l'admin.

const BUCKET = 'backups';
const BATCH = 1000;
const RETENTION_DAYS = 30;
// La route dispose de 60 s : on cesse de lancer des copies de fichiers passé ce délai (le reste
// est repris à la sauvegarde suivante).
const FILES_BUDGET_MS = 40_000;
const FILES_PER_RUN = 500;
const FILES_CONCURRENCY = 5;

export type BackupTable = { name: string; rows: number; bytes: number };
export type BackupFiles = {
  source_files: number;
  source_bytes: number;
  copied: number;
  failed: number;
  remaining: number;
  failed_names: string[];
};
export type BackupResult = {
  id: string;
  folder: string;
  tables: number;
  rows: number;
  bytes: number;
  files: BackupFiles | null;
};

type AdminClient = ReturnType<typeof createAdminSupabase>;

/** Copie dans le miroir les fichiers stockés absents ou modifiés depuis leur dernière copie. */
async function mirrorFiles(admin: AdminClient, startedAtMs: number): Promise<BackupFiles> {
  const { data: todo, error: todoErr } = await admin.rpc('backup_files_todo', { p_limit: FILES_PER_RUN });
  if (todoErr) throw new Error('Liste des fichiers : ' + todoErr.message);
  const queue = (todo ?? []) as Array<{ bucket_id: string; name: string; size: number }>;

  let copied = 0;
  const failedNames: string[] = [];
  let next = 0;

  const worker = async () => {
    while (next < queue.length && Date.now() - startedAtMs < FILES_BUDGET_MS) {
      const f = queue[next++];
      const dest = `files/${f.bucket_id}/${f.name}`;
      const src = admin.storage.from(f.bucket_id);
      let { error } = await src.copy(f.name, dest, { destinationBucket: BUCKET });
      if (error && /exist|duplicate/i.test(error.message)) {
        // Fichier modifié depuis la dernière copie : on remplace l'ancienne version du miroir.
        await admin.storage.from(BUCKET).remove([dest]);
        ({ error } = await src.copy(f.name, dest, { destinationBucket: BUCKET }));
      }
      if (error) failedNames.push(`${f.bucket_id}/${f.name} : ${error.message}`.slice(0, 200));
      else copied += 1;
    }
  };
  await Promise.all(Array.from({ length: FILES_CONCURRENCY }, worker));

  const { data: stats } = await admin.rpc('backup_files_stats');
  const st = (stats ?? {}) as { source_files?: number; source_bytes?: number; remaining?: number };
  return {
    source_files: Number(st.source_files ?? 0),
    source_bytes: Number(st.source_bytes ?? 0),
    copied,
    failed: failedNames.length,
    remaining: Number(st.remaining ?? 0),
    failed_names: failedNames.slice(0, 20),
  };
}

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

    // Lit une source par lots de BATCH lignes, la compresse et l'envoie dans le dossier du jour.
    const saveSource = async (
      name: string,
      fetchChunk: (offset: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
    ) => {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += BATCH) {
        const { data, error } = await fetchChunk(offset);
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
    };

    for (const name of names) {
      await saveSource(name, (offset) => admin.rpc('backup_export_table', { p_table: name, p_offset: offset, p_limit: BATCH }));
    }
    // Comptes de connexion (schéma auth) : sans mots de passe hachés ni jetons.
    for (const kind of ['users', 'identities'] as const) {
      await saveSource(`auth_${kind}`, (offset) => admin.rpc('backup_export_auth', { p_kind: kind, p_offset: offset, p_limit: BATCH }));
    }

    // Copie miroir des fichiers stockés. Un échec ici ne doit pas faire perdre les données déjà sauvegardées :
    // il est consigné dans le journal et affiché dans l'admin.
    let files: BackupFiles | null = null;
    let filesError: string | null = null;
    try {
      files = await mirrorFiles(admin, startedAt.getTime());
      if (files.failed > 0) filesError = `${files.failed} fichier(s) non copié(s) : ${files.failed_names[0]}`;
    } catch (e) {
      filesError = 'Copie des fichiers : ' + (e instanceof Error ? e.message : String(e));
    }

    const manifest = {
      created_at: startedAt.toISOString(),
      trigger,
      format: 'tamcar-backup/1',
      note:
        'Un fichier <table>.json.gz par table du schéma public : tableau JSON de lignes (colonnes géographiques en WKB hexadécimal). ' +
        'auth_users et auth_identities : comptes de connexion, sans mots de passe ni jetons. ' +
        'Fichiers stockés : copie miroir dans backups/files/<bucket>/<chemin>.',
      total_rows: totalRows,
      tables,
      files,
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
        files,
        error: filesError ? filesError.slice(0, 500) : null,
      })
      .eq('id', runId);

    await purgeOldBackups().catch(() => undefined); // le nettoyage ne doit jamais faire échouer la sauvegarde

    return { id: runId, folder, tables: tables.length, rows: totalRows, bytes: totalBytes, files };
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
