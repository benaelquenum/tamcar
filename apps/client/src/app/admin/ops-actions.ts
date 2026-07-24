'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function acknowledgeSosAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('id requis');
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_ack_sos', { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

export async function resolveSosAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const note = String(formData.get('note') || '').trim();
  if (!id) throw new Error('id requis');
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_resolve_sos', {
    p_id: id,
    p_note: note || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

export async function reassignRideAction(formData: FormData) {
  const rideId = String(formData.get('ride_id') || '');
  const driverId = String(formData.get('driver_id') || '');
  if (!rideId || !driverId) throw new Error('Course et chauffeur requis');
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_reassign_ride', {
    p_ride_id: rideId,
    p_driver_id: driverId,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/rides');
  revalidatePath('/admin');
}

export async function cancelRideAction(formData: FormData) {
  const rideId = String(formData.get('ride_id') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!rideId) throw new Error('Course requise');
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_cancel_ride', {
    p_ride_id: rideId,
    p_reason: reason || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/rides');
  revalidatePath('/admin');
}
