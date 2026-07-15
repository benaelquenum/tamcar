'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

export async function approveApplication(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('approve_driver_application', { app_id: id });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/candidatures');
  redirect('/admin/candidatures');
}

export async function rejectApplication(formData: FormData) {
  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!id || reason.length < 3) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('reject_driver_application', {
    app_id: id,
    reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/candidatures');
  redirect('/admin/candidatures');
}
