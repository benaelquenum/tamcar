'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

/** Annule une location VIP (le client, avant qu'elle ne commence). */
export async function cancelRentalAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '');
  if (!id) redirect('/reservations');

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('cancel_vehicle_rental', { p_id: id });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('cancel_vehicle_rental error:', error.message);
    redirect(`/reservations?rental_error=${encodeURIComponent(error.message.slice(0, 160))}`);
  }
  revalidatePath('/reservations');
  redirect('/reservations?rental=cancelled');
}
