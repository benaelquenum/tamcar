'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

async function callTransition(rpc: string, rideId: string) {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc(rpc, { ride_id: rideId });
  if (error) throw new Error(error.message);
  revalidatePath(`/ride/${rideId}`);
}

export async function markArrivedAction(rideId: string, distanceM?: number) {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('driver_arrived', {
    ride_id: rideId,
    distance_m: typeof distanceM === 'number' ? Math.round(distanceM) : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/ride/${rideId}`);
}

export async function startRideAction(rideId: string) {
  await callTransition('driver_start_ride', rideId);
}

export async function completeRideAction(rideId: string) {
  await callTransition('driver_complete_ride', rideId);
}
