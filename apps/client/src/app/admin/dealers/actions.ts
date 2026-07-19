'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function createDealer(formData: FormData) {
  const phone = String(formData.get('phone') || '').trim();
  const full_name = String(formData.get('full_name') || '').trim();
  const company_name = String(formData.get('company_name') || '').trim();
  const rccm = String(formData.get('rccm') || '').trim();
  const share_pct = parseFloat(String(formData.get('share_pct') || '25'));
  const is_shareholder = String(formData.get('is_shareholder') || '') === 'on';
  const shareholder_pct_raw = String(formData.get('shareholder_pct') || '').trim();

  if (!phone || !full_name || !company_name) {
    throw new Error('Téléphone, nom et raison sociale obligatoires');
  }
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_register_dealer', {
    p_phone: phone,
    p_full_name: full_name,
    p_company_name: company_name,
    p_rccm: rccm || null,
    p_share_pct: share_pct,
    p_is_shareholder: is_shareholder,
    p_shareholder_pct: shareholder_pct_raw ? parseFloat(shareholder_pct_raw) : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/dealers');
}

export async function archiveDealer(formData: FormData) {
  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || 'Archivé par admin').trim();
  if (!id) throw new Error('id requis');
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_archive_dealer', {
    p_dealer_id: id,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/dealers');
}
