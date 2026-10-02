'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { runBackup } from '@/lib/backup';

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
