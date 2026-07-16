'use server';

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

export async function acceptRideAction(rideId: string) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('accept_ride', { ride_id: rideId });
  if (error || !data) {
    throw new Error(error?.message ?? 'Impossible d\'accepter cette course');
  }
  redirect(`/ride/${(data as { id: string }).id}`);
}
