'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

async function callTransition(rpc: string, rideId: string) {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc(rpc, { ride_id: rideId });
  if (error) throw new Error(error.message);
  revalidatePath(`/driver/ride/${rideId}`);
  revalidatePath(`/ride/${rideId}`);
}

export async function markArrivedAction(rideId: string) {
  await callTransition('driver_arrived', rideId);
}

export async function startRideAction(rideId: string) {
  await callTransition('driver_start_ride', rideId);
}

export async function completeRideAction(rideId: string) {
  await callTransition('driver_complete_ride', rideId);
}
