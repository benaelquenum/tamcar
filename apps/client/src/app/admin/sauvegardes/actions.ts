'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { runBackup } from '@/lib/backup';
import { runDriveSync } from '@/lib/driveSync';

/** Lance une sauvegarde complète tout de suite (équipe TamCar uniquement). */
export async function runBackupNow(): Promise<void> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') redirect('/');

  let message: string | null = null;
  try {
    await runBackup('manual', profile.id);
  } catch (e) {
    message = e instanceof Error ? e.message : 'La sauvegarde a échoué.';
  }
  revalidatePath('/admin/sauvegardes');
  if (message) redirect(`/admin/sauvegardes?err=${encodeURIComponent(message.slice(0, 200))}`);
  redirect('/admin/sauvegardes?ok=1');
}

/** Envoie sur Drive les archives mensuelles manquantes et les fichiers pas encore copiés. */
export async function runDriveSyncNow(): Promise<void> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'admin') redirect('/');

  let message: string | null = null;
  let summary = '';
  try {
    const r = await runDriveSync();
    if (!r.configured) {
      message = 'Drive n’est pas configuré (variables DRIVE_BACKUP_URL et DRIVE_BACKUP_SECRET dans Vercel).';
    } else {
      const errs = [...r.archive.errors, ...r.files.failed_names];
      summary =
        `${r.archive.done.length} archive(s) mensuelle(s) envoyée(s)` +
        (r.archive.remaining > 0 ? `, ${r.archive.remaining} restante(s)` : '') +
        ` · ${r.files.copied} fichier(s) copié(s)` +
        (r.files.remaining > 0 ? `, ${r.files.remaining} restant(s)` : '');
      if (errs.length > 0) message = errs[0];
    }
  } catch (e) {
    message = e instanceof Error ? e.message : 'L’envoi sur Drive a échoué.';
  }
  revalidatePath('/admin/sauvegardes');
  if (message) redirect(`/admin/sauvegardes?err=${encodeURIComponent(message.slice(0, 200))}`);
  redirect(`/admin/sauvegardes?drive=${encodeURIComponent(summary)}`);
}
