// Envoi vers Google Drive, par le script Apps Script du compte de sauvegarde
// (voir backend/scripts/drive-receiver.gs). Deux variables Vercel, saisies par Terence :
//   DRIVE_BACKUP_URL    adresse de l'application web (se termine par /exec)
//   DRIVE_BACKUP_SECRET mot de passe de liaison (le même que la propriété SECRET du script)
// Sans elles, rien n'est envoyé et l'admin affiche « Drive non configuré ».

const TIMEOUT_MS = 50_000;

export function driveConfigured(): boolean {
  return Boolean(process.env.DRIVE_BACKUP_URL && process.env.DRIVE_BACKUP_SECRET);
}

async function call(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = process.env.DRIVE_BACKUP_URL;
  const secret = process.env.DRIVE_BACKUP_SECRET;
  if (!url || !secret) throw new Error('Drive non configuré');

  // text/plain : pas de pré-requête CORS ; le script lit le corps brut. La réponse passe par une
  // redirection de Google, suivie automatiquement.
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, secret }),
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Réponse Drive illisible (HTTP ${res.status})`);
  }
  if (json.ok !== true) throw new Error(`Drive : ${String(json.error ?? 'refusé')}`.slice(0, 200));
  return json;
}

/** Vérifie la liaison : renvoie le nom du dossier Drive. */
export async function drivePing(): Promise<string> {
  const r = await call({ action: 'ping' });
  return String(r.folder ?? '');
}

/** Dépose un fichier dans le dossier de sauvegarde (les sous-dossiers du chemin sont créés). */
export async function drivePut(path: string, data: Buffer, mime: string): Promise<void> {
  await call({ action: 'put', path, mime, base64: data.toString('base64') });
}

/** Supprime les copies de secours de plus de `keepDays` jours (dossier Secours uniquement). */
export async function drivePurgeSecours(keepDays: number): Promise<number> {
  const r = await call({ action: 'purge', path: 'Secours', keep_days: keepDays });
  return Number(r.purged ?? 0);
}
