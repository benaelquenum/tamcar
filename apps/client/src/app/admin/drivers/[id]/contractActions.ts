'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

type State = { error?: string; ok?: string } | null;

const REASONS = ['panne', 'maladie', 'autre'];

/** Jours non travaillés (panne, maladie) : rien n'est prélevé et le contrat est prolongé d'autant. */
export async function excuseDays(_prev: State, formData: FormData): Promise<State> {
  const driverId = String(formData.get('driver_id') || '');
  const from = String(formData.get('from') || '');
  const to = String(formData.get('to') || '') || from;
  const reason = String(formData.get('reason') || '');
  const note = String(formData.get('note') || '').trim();
  if (!driverId) return { error: 'Chauffeur introuvable.' };
  if (!from) return { error: 'Indiquez le premier jour.' };
  if (!REASONS.includes(reason)) return { error: 'Choisissez un motif.' };
  if (to < from) return { error: 'La fin doit être après le début.' };
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('admin_excuse_driver_days', {
    p_driver_id: driverId,
    p_from: from,
    p_to: to,
    p_reason: reason,
    p_note: note || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/drivers/${driverId}`);
  const r = (data ?? {}) as { added?: number; refunded_fcfa?: number };
  const added = r.added ?? 0;
  const refunded = r.refunded_fcfa ?? 0;
  if (added === 0) return { ok: 'Ces jours étaient déjà enregistrés (les dimanches sont ignorés).' };
  return {
    ok: `${added} jour${added > 1 ? 's' : ''} enregistré${added > 1 ? 's' : ''}, contrat prolongé d'autant${
      refunded > 0 ? ` ; ${refunded} F déjà prélevés ont été remboursés` : ''
    }.`,
  };
}

export async function removeExcusedDay(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get('id') || '');
  const driverId = String(formData.get('driver_id') || '');
  if (!id) return { error: 'Jour introuvable.' };
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_remove_excused_day', { p_id: id });
  if (error) return { error: error.message };
  revalidatePath(`/admin/drivers/${driverId}`);
  return { ok: 'Jour retiré.' };
}

/**
 * Versement reçu HORS application (espèces ou Mobile Money) : il compte dans la part de TamCar du jour.
 * Objectif atteint -> épargne créditée, manque déjà prélevé remboursé ; le tableau de bord du chauffeur se met à jour seul.
 */
export async function declareOfflinePayment(_prev: State, formData: FormData): Promise<State> {
  const driverId = String(formData.get('driver_id') || '');
  const day = String(formData.get('day') || '');
  const amount = Math.floor(Number(formData.get('amount') || 0));
  const method = String(formData.get('method') || '');
  const note = String(formData.get('note') || '').trim();
  if (!driverId) return { error: 'Chauffeur introuvable.' };
  if (!day) return { error: 'Indiquez le jour concerné.' };
  if (!(amount >= 1)) return { error: 'Indiquez le montant reçu.' };
  if (method !== 'cash' && method !== 'mobile_money') return { error: 'Choisissez espèces ou Mobile Money.' };
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('admin_declare_offline_payment', {
    p_driver_id: driverId,
    p_day: day,
    p_amount: amount,
    p_method: method,
    p_note: note || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/drivers/${driverId}`);
  const r = (data ?? {}) as { reached?: boolean; part_fcfa?: number; target_fcfa?: number; saved_fcfa?: number };
  const fmt = (n: number) => n.toLocaleString('fr-FR');
  if (r.reached) {
    return { ok: `Enregistré. Objectif atteint (${fmt(r.part_fcfa ?? 0)} F sur ${fmt(r.target_fcfa ?? 0)} F) : l'épargne du jour est créditée et le chauffeur est prévenu.` };
  }
  return {
    ok: `Enregistré. Part de TamCar du jour : ${fmt(r.part_fcfa ?? 0)} F sur ${fmt(r.target_fcfa ?? 0)} F, objectif pas encore atteint.`,
  };
}

/** Date de début de la cession (remise du véhicule). À défaut, le premier prélèvement TamAssur sert de repère. */
export async function setCessionStart(_prev: State, formData: FormData): Promise<State> {
  const driverId = String(formData.get('driver_id') || '');
  const date = String(formData.get('start_on') || '');
  if (!driverId) return { error: 'Chauffeur introuvable.' };
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_set_cession_start', { p_driver_id: driverId, p_date: date || null });
  if (error) return { error: error.message };
  revalidatePath(`/admin/drivers/${driverId}`);
  return { ok: date ? 'Date de début enregistrée.' : 'Date de début effacée (repère : premier prélèvement TamAssur).' };
}
