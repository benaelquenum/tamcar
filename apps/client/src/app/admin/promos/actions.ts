'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function createPromoCode(formData: FormData) {
  const code = String(formData.get('code') || '').trim().toUpperCase();
  const discountType = String(formData.get('discount_type') || '') as 'percent' | 'fixed';
  const discountValue = parseInt(String(formData.get('discount_value') || '0'), 10);
  const maxUsesTotalRaw = String(formData.get('max_uses_total') || '').trim();
  const maxUsesTotal = maxUsesTotalRaw ? parseInt(maxUsesTotalRaw, 10) : null;
  const maxUsesPerUser = parseInt(String(formData.get('max_uses_per_user') || '1'), 10);
  const validUntilRaw = String(formData.get('valid_until') || '').trim();
  const validUntil = validUntilRaw ? new Date(validUntilRaw).toISOString() : null;
  const description = String(formData.get('description') || '').trim() || null;

  if (!code || !discountValue || (discountType !== 'percent' && discountType !== 'fixed')) {
    throw new Error('Champs obligatoires manquants');
  }
  if (discountType === 'percent' && (discountValue < 1 || discountValue > 90)) {
    throw new Error('% doit être entre 1 et 90');
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from('promo_codes').insert({
    code,
    discount_type: discountType,
    discount_value: discountValue,
    max_uses_total: maxUsesTotal,
    max_uses_per_user: maxUsesPerUser,
    valid_until: validUntil,
    description,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/promos');
}

export async function togglePromoCode(formData: FormData) {
  const code = String(formData.get('code') || '');
  const active = formData.get('active') === 'true';
  if (!code) throw new Error('code manquant');

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('promo_codes')
    .update({ active })
    .eq('code', code);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/promos');
}
