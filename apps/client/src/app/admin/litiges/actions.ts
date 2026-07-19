'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function resolveDispute(formData: FormData) {
  const rideId = String(formData.get('ride_id') || '');
  const verdict = String(formData.get('verdict') || '');
  const note = String(formData.get('note') || '').trim() || null;

  if (!rideId) throw new Error('ride_id manquant');
  if (verdict !== 'client' && verdict !== 'driver') {
    throw new Error('Verdict invalide');
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_resolve_cancellation_dispute', {
    p_ride_id: rideId,
    p_verdict: verdict,
    p_admin_note: note,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/litiges');
}

export async function resolveStrikeDispute(formData: FormData) {
  const rideId = String(formData.get('ride_id') || '');
  const upholdRaw = String(formData.get('uphold') || '');
  const note = String(formData.get('note') || '').trim() || null;

  if (!rideId) throw new Error('ride_id manquant');
  if (upholdRaw !== 'true' && upholdRaw !== 'false') {
    throw new Error('Verdict invalide');
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_resolve_strike_dispute', {
    p_ride_id: rideId,
    p_uphold: upholdRaw === 'true',
    p_admin_note: note,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/litiges');
}
