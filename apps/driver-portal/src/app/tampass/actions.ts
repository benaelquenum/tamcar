'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Acceptation d'une offre TamPass — premier arrivé, premier servi.
 * Le chauffeur devient l'attitré ; le client est notifié pour payer.
 */
export async function acceptOfferAction(formData: FormData) {
  const id = String(formData.get('subscription_id') || '');
  if (!id) redirect('/tampass');

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('tampass_accept_offer', {
    p_subscription_id: id,
  });

  if (error) {
    redirect('/tampass?error=' + encodeURIComponent(error.message));
  }
  revalidatePath('/tampass');
  redirect(
    '/tampass?ok=' +
      encodeURIComponent(
        'Offre acceptée ! Le client a 24 h pour confirmer — vous serez notifié.',
      ),
  );
}
