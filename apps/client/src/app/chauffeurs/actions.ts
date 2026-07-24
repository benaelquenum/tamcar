'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

/** Annule une demande de course one-shot avant la réponse du chauffeur. */
export async function cancelOneshotAction(formData: FormData) {
  const id = String(formData.get('request_id') || '');
  if (!id) redirect('/chauffeurs');

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('cancel_oneshot_request', {
    p_request_id: id,
  });
  if (error) {
    redirect('/chauffeurs?error=' + encodeURIComponent(error.message));
  }
  revalidatePath('/chauffeurs');
  redirect('/chauffeurs');
}
