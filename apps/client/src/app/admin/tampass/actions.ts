'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

type State = { error?: string; ok?: string } | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Arrête un abonnement TamPass : les courses non commencées sont annulées, le chauffeur est prévenu, remboursement facultatif. */
export async function adminCancelSubscription(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get('subscription_id') || '');
  if (!UUID_RE.test(id)) return { error: 'Abonnement invalide.' };
  const reason = String(formData.get('reason') || '').trim().slice(0, 200);
  const refund = formData.get('refund') === 'on';
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('admin_cancel_subscription', {
    p_subscription_id: id,
    p_reason: reason || null,
    p_refund: refund,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/tampass');
  const res = (data ?? {}) as { rides_cancelled?: number; refund_fcfa?: number };
  const n = Number(res.rides_cancelled ?? 0);
  const f = Number(res.refund_fcfa ?? 0);
  return {
    ok:
      `Abonnement arrêté. ${n} course${n > 1 ? 's' : ''} à venir annulée${n > 1 ? 's' : ''}` +
      (f > 0 ? `, ${f.toLocaleString('fr-FR').replace(/,/g, ' ')} F recrédités au client.` : '.'),
  };
}
