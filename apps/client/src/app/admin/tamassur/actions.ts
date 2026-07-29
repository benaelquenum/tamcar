'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function markTamassurPaid(formData: FormData) {
  const id = String(formData.get('id') || '');
  const method = String(formData.get('method') || 'cash');
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_mark_tamassur_paid', {
    p_id: id,
    p_method: method,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/tamassur');
}
