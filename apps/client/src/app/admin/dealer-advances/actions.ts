'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function refundAdvance(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_refund_dealer_advance', { p_advance_id: id });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/dealer-advances');
}

export async function forfeitAdvance(formData: FormData) {
  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_forfeit_dealer_advance', {
    p_advance_id: id,
    p_reason: reason || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/dealer-advances');
}
