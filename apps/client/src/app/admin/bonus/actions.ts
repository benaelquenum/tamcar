'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

/** Modifie un réglage du programme chauffeur (objectifs, paliers de bonus, part du fonds de rachat). */
export async function setProgramRule(formData: FormData) {
  const key = String(formData.get('key') || '');
  const value = Number(formData.get('value'));
  if (!key || !Number.isFinite(value) || value < 0) throw new Error('Valeur invalide');

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_set_program_rule', {
    p_key: key,
    p_value: Math.round(value),
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/bonus');
}
