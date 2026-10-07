'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

/** Paiement reçu hors application (espèces, Mobile Money vers TamCar) : la dette du chauffeur baisse. */
export async function recordDebtPayment(formData: FormData) {
  const driverId = String(formData.get('driver_id') || '');
  const amount = parseInt(String(formData.get('amount') || ''), 10);
  const reference = String(formData.get('reference') || '').trim();
  if (!driverId || !Number.isFinite(amount) || amount < 1) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_record_debt_payment', {
    p_driver_id: driverId,
    p_amount_fcfa: amount,
    p_provider: 'internal',
    p_reference: reference || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/dettes');
}
