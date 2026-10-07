'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

type State = { error?: string; ok?: string } | null;

/** Paiement reçu hors application (espèces, Mobile Money vers TamCar) : la dette du chauffeur baisse. */
export async function recordDebtPayment(_prev: State, formData: FormData): Promise<State> {
  const driverId = String(formData.get('driver_id') || '');
  const amount = parseInt(String(formData.get('amount') || ''), 10);
  const reference = String(formData.get('reference') || '').trim();
  if (!driverId) return { error: 'Chauffeur introuvable.' };
  if (!Number.isFinite(amount) || amount < 1) return { error: 'Indiquez un montant valide.' };
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_record_debt_payment', {
    p_driver_id: driverId,
    p_amount_fcfa: amount,
    p_provider: 'internal',
    p_reference: reference || null,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/dettes');
  return { ok: 'Paiement enregistré.' };
}
