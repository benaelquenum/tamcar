'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Pause d'une semaine (limitée par la formule, prolonge l'expiration).
 */
export async function pauseSubscriptionAction(formData: FormData) {
  const id = String(formData.get('subscription_id') || '');
  if (!id) redirect('/tampass');

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('pause_subscription', {
    p_subscription_id: id,
  });

  if (error) {
    redirect('/tampass?error=' + encodeURIComponent(error.message));
  }
  revalidatePath('/tampass');
  redirect('/tampass?ok=' + encodeURIComponent('Pass mis en pause 7 jours.'));
}

/**
 * Confirmation : le chauffeur est trouvé, le client paie → pass actif.
 */
export async function confirmPaymentAction(formData: FormData) {
  const id = String(formData.get('subscription_id') || '');
  if (!id) redirect('/tampass');

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('confirm_subscription_payment', {
    p_subscription_id: id,
  });

  if (error) {
    redirect('/tampass?error=' + encodeURIComponent(error.message));
  }
  revalidatePath('/tampass');
  redirect(
    '/tampass?ok=' +
      encodeURIComponent('TamPass activé — vos trajets démarrent dès demain !'),
  );
}

/**
 * Annulation d'une demande avant paiement (recherche ou attente de confirmation).
 */
export async function cancelRequestAction(formData: FormData) {
  const id = String(formData.get('subscription_id') || '');
  if (!id) redirect('/tampass');

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('cancel_subscription_request', {
    p_subscription_id: id,
  });

  if (error) {
    redirect('/tampass?error=' + encodeURIComponent(error.message));
  }
  revalidatePath('/tampass');
  redirect('/tampass?ok=' + encodeURIComponent('Demande annulée.'));
}

/**
 * Joker : recrédite un trajet manqué (plafonné par mois selon la formule).
 */
export async function useJokerAction(formData: FormData) {
  const id = String(formData.get('subscription_ride_id') || '');
  if (!id) redirect('/tampass');

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('report_subscription_ride', {
    p_subscription_ride_id: id,
  });

  if (error) {
    redirect('/tampass?error=' + encodeURIComponent(error.message));
  }
  revalidatePath('/tampass');
  redirect('/tampass?ok=' + encodeURIComponent('Trajet recrédité sur votre pass.'));
}
