'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

type State = { error?: string; ok?: string } | null;

/** Le retrait a été payé (Mobile Money) : débit définitif + notification au chauffeur. */
export async function markPayoutPaid(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get('id') || '');
  const reference = String(formData.get('reference') || '').trim();
  if (!id) return { error: 'Retrait introuvable.' };
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_mark_payout_paid', {
    p_payout_id: id,
    p_reference: reference || null,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/retraits');
  return { ok: 'Retrait marqué payé : le chauffeur est prévenu.' };
}

/** Appelle la fonction FeexPay de retrait avec le jeton de l'équipe (envoi forcé ou simple vérification du statut). */
async function callPayoutFunction(payoutId: string, mode: 'send' | 'check'): Promise<State> {
  if (!payoutId) return { error: 'Retrait introuvable.' };
  const supabase = createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Session expirée : reconnectez-vous.' };
  const { data, error } = await supabase.functions.invoke('feexpay-payout', {
    body: mode === 'send' ? { payout_id: payoutId, force: true } : { payout_id: payoutId, check: true },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  revalidatePath('/admin/retraits');
  if (error) return { error: `Appel impossible : ${error.message}` };
  const r = (data ?? {}) as { status?: string; reason?: string; error?: string };
  if (r.error) return { error: r.error };
  switch (r.status) {
    case 'paid': return { ok: 'Retrait envoyé et confirmé : le chauffeur est prévenu.' };
    case 'failed': return { ok: `Le virement a échoué${r.reason ? ` (${r.reason})` : ''} : le chauffeur a été recrédité.` };
    case 'processing': return { ok: 'Envoyé à FeexPay : en attente de la confirmation de l’opérateur. Cliquez sur « Vérifier » dans une minute.' };
    case 'hold': return { error: r.reason ? `Non envoyé : ${r.reason}` : 'Non envoyé : voir le motif sur la ligne du retrait.' };
    default: return { error: 'FeexPay n’est pas configuré sur ce serveur (clés absentes) : payez à la main.' };
  }
}

/** Envoie le retrait par FeexPay (virement Mobile Money), même s'il attend une validation : c'est le clic de l'équipe qui vaut validation. */
export async function sendPayoutViaFeexpay(_prev: State, formData: FormData): Promise<State> {
  return callPayoutFunction(String(formData.get('id') || ''), 'send');
}

/** Relit chez FeexPay l'issue d'un retrait déjà parti. */
export async function checkPayout(_prev: State, formData: FormData): Promise<State> {
  return callPayoutFunction(String(formData.get('id') || ''), 'check');
}

/** Le retrait est refusé : le montant est recrédité au chauffeur et il en est informé. */
export async function rejectPayout(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!id) return { error: 'Retrait introuvable.' };
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_reject_payout', {
    p_payout_id: id,
    p_reason: reason || null,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/retraits');
  return { ok: 'Retrait refusé : le montant est recrédité au chauffeur.' };
}
