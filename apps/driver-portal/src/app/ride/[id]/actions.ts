'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Ces actions RETOURNENT l'erreur au lieu de la lever.
 *
 * Next efface le message des exceptions de server action en production et
 * le remplace par « An error occurred in the Server Components render… ».
 * Le chauffeur voyait donc ce pavé anglais à la place de la vraie cause —
 * « Vous êtes trop loin du point de départ », « Course déjà démarrée »… —
 * en pleine course, au moment où il a le moins le temps de chercher.
 */
export type ActionResult = { error: string } | void;

function toResult(message: string | undefined): ActionResult {
  return { error: message?.trim() || 'Erreur inconnue' };
}

async function callTransition(rpc: string, rideId: string): Promise<ActionResult> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc(rpc, { ride_id: rideId });
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`[${rpc}]`, error.message, error.details, error.hint);
    return toResult(error.message);
  }
  revalidatePath(`/ride/${rideId}`);
}

export async function markArrivedAction(
  rideId: string,
  distanceM?: number,
): Promise<ActionResult> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('driver_arrived', {
    ride_id: rideId,
    distance_m: typeof distanceM === 'number' ? Math.round(distanceM) : null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[driver_arrived]', error.message, error.details, error.hint);
    return toResult(error.message);
  }
  revalidatePath(`/ride/${rideId}`);
}

export async function startRideAction(rideId: string): Promise<ActionResult> {
  return callTransition('driver_start_ride', rideId);
}

export async function completeRideAction(rideId: string): Promise<ActionResult> {
  return callTransition('driver_complete_ride', rideId);
}
