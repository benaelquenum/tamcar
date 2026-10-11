'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

type State = { error?: string; ok?: string } | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Enregistre les bénéficiaires de la semaine (une seule fois) et les prévient par notification. */
export async function validateDataBundleWeek(_prev: State, formData: FormData): Promise<State> {
  const week = String(formData.get('week') || '');
  if (!DATE_RE.test(week)) return { error: 'Semaine invalide.' };
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('admin_data_bundle_validate', { p_week_start: week });
  if (error) return { error: error.message };
  revalidatePath('/admin/forfaits-internet');
  const n = Number(data ?? 0);
  return {
    ok:
      n > 0
        ? `${n} bénéficiaire${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''} et prévenu${n > 1 ? 's' : ''}. Téléchargez le fichier pour l’opérateur.`
        : 'Aucun nouveau bénéficiaire : la semaine était déjà validée, ou aucun chauffeur n’est éligible.',
  };
}

/** L'opérateur a activé les forfaits de la semaine : on le note et les chauffeurs en sont prévenus. */
export async function markDataBundlesSent(_prev: State, formData: FormData): Promise<State> {
  const week = String(formData.get('week') || '');
  if (!DATE_RE.test(week)) return { error: 'Semaine invalide.' };
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('admin_data_bundle_mark_sent', { p_week_start: week });
  if (error) return { error: error.message };
  revalidatePath('/admin/forfaits-internet');
  const n = Number(data ?? 0);
  return { ok: n > 0 ? `${n} forfait${n > 1 ? 's' : ''} marqué${n > 1 ? 's' : ''} comme activé${n > 1 ? 's' : ''} : les chauffeurs sont prévenus.` : 'Rien à marquer pour cette semaine.' };
}
