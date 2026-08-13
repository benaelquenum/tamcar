'use server';

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Accepte une course puis file dessus.
 *
 * L'erreur est RETOURNÉE, pas levée : Next efface le message des
 * exceptions de server action en production. Le chauffeur voyait « An
 * error occurred in the Server Components render… » au lieu de la vraie
 * raison — « Déjà prise par un autre chauffeur », « Solde insuffisant »,
 * « Course déjà annulée » —, c'est-à-dire au moment précis où il doit
 * décider s'il en cherche une autre.
 */
export async function acceptRideAction(
  rideId: string,
): Promise<{ error: string } | void> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('accept_ride', { ride_id: rideId });
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('[accept_ride]', error?.message, error?.details, error?.hint);
    return {
      error: error?.message?.trim() || "Impossible d'accepter cette course",
    };
  }
  redirect(`/ride/${(data as { id: string }).id}`);
}
