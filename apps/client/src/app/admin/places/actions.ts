'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function approvePlace(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('verify_place', { place_id: id });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('approvePlace error:', error.message);
  }
  revalidatePath('/admin/places');
}

export async function rejectPlace(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('reject_place', { place_id: id });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('rejectPlace error:', error.message);
  }
  revalidatePath('/admin/places');
}
