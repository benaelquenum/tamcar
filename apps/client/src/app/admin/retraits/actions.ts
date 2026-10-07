'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

/** Le retrait a été payé (Mobile Money) : débit définitif + notification au chauffeur. */
export async function markPayoutPaid(formData: FormData) {
  const id = String(formData.get('id') || '');
  const reference = String(formData.get('reference') || '').trim();
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_mark_payout_paid', {
    p_payout_id: id,
    p_reference: reference || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/retraits');
}

/** Le retrait est refusé : le montant est recrédité au chauffeur et il en est informé. */
export async function rejectPayout(formData: FormData) {
  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_reject_payout', {
    p_payout_id: id,
    p_reason: reason || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/retraits');
}
