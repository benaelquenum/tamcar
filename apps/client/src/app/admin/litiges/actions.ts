'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function resolveDispute(formData: FormData) {
  const rideId = String(formData.get('ride_id') || '');
  const verdict = String(formData.get('verdict') || '');
  const note = String(formData.get('note') || '').trim() || null;

  if (!rideId) throw new Error('ride_id manquant');
  if (verdict !== 'client' && verdict !== 'driver' && verdict !== 'goodwill') {
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

/** Contrôle qualité : relecture d'une décision automatique. */
export async function auditCase(formData: FormData) {
  const rideId = String(formData.get('ride_id') || '');
  const kind = String(formData.get('kind') || '');
  const ok = String(formData.get('ok') || '') === 'true';
  const note = String(formData.get('note') || '').trim() || null;
  if (!rideId || (kind !== 'client_claim' && kind !== 'driver_contest')) throw new Error('Dossier invalide');

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_audit_case', {
    p_ride_id: rideId,
    p_kind: kind,
    p_ok: ok,
    p_note: note,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/litiges');
}

/** Modifie un seuil des règles automatiques (effet immédiat). */
export async function setDisputeRule(formData: FormData) {
  const key = String(formData.get('key') || '');
  const value = Number(formData.get('value'));
  if (!key || !Number.isFinite(value) || value < 0) throw new Error('Valeur invalide');

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_set_dispute_rule', {
    p_key: key,
    p_value: Math.round(value),
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/litiges');
}
