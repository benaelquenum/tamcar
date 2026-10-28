'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function resolveRideEnd(formData: FormData) {
  const id = String(formData.get('id') || '');
  const verdict = String(formData.get('verdict') || '');
  const note = String(formData.get('note') || '').trim();
  const credit = Math.max(0, Math.min(5000, Math.round(Number(formData.get('credit') || 0)) || 0));
  if (!id || !['valid', 'driver_fault'].includes(verdict)) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_resolve_ride_end', {
    p_review_id: id,
    p_verdict: verdict,
    p_note: note || null,
    p_credit_fcfa: credit,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/fins-de-course');
}

const RULE_KEYS = ['end_near_m', 'end_contest_min', 'end_alert_count', 'end_alert_days'];

export async function setEndRule(formData: FormData) {
  const key = String(formData.get('key') || '');
  const value = Math.round(Number(formData.get('value')));
  if (!RULE_KEYS.includes(key) || !Number.isFinite(value) || value < 0) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_set_program_rule', { p_key: key, p_value: value });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/fins-de-course');
}
