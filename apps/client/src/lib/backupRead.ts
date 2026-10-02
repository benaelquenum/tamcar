import { gunzipSync } from 'node:zlib';
import { createServerSupabase } from '@/lib/supabase-server';

// Lecture d'une table dans une sauvegarde de secours (bucket privé « backups », lecture admin),
// pour l'explorateur et l'export CSV de l'admin.

export const MAX_EXPLORE_BYTES = 20 * 1024 * 1024;

export type BackupRunLite = {
  id: string;
  folder: string;
  started_at: string;
  trigger: 'cron' | 'manual';
  tables: Array<{ name: string; rows: number; bytes: number }>;
};

export async function loadRun(id: string): Promise<BackupRunLite | null> {
  const supabase = createServerSupabase();
  const { data } = await supabase.from('backup_runs').select('id, folder, started_at, trigger, tables').eq('id', id).eq('status', 'ok').maybeSingle();
  return (data as BackupRunLite | null) ?? null;
}

/** Lignes d'une table de la sauvegarde ; null si le fichier est introuvable. */
export async function loadTableRows(run: BackupRunLite, table: string): Promise<Array<Record<string, unknown>> | null> {
  if (!run.tables.some((t) => t.name === table)) return null; // liste blanche : seulement les tables de cette sauvegarde
  const supabase = createServerSupabase();
  const { data, error } = await supabase.storage.from('backups').download(`${run.folder}/${table}.json.gz`);
  if (error || !data) return null;
  const parsed = JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString('utf8')) as unknown;
  return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : null;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV lisible dans Excel français (séparateur « ; », BOM UTF-8). */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '﻿';
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(';'), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(';'))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
