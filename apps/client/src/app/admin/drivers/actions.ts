'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function createDriver(formData: FormData) {
  const phone = String(formData.get('phone') || '').trim();
  const full_name = String(formData.get('full_name') || '').trim();
  const application_type = String(formData.get('application_type') || 'cession');
  const license = String(formData.get('license') || '').trim();
  const id_card = String(formData.get('id_card') || '').trim();

  if (!phone || !full_name) throw new Error('Téléphone et nom obligatoires');
  if (application_type !== 'cession' && application_type !== 'proprietaire') {
    throw new Error('Formule invalide');
  }
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_register_driver', {
    p_phone: phone,
    p_full_name: full_name,
    p_application_type: application_type,
    p_license: license || null,
    p_id_card: id_card || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/drivers');
}

export async function suspendDriver(formData: FormData) {
  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || '').trim();
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_suspend_driver', { p_driver_id: id, p_reason: reason || null });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/drivers');
}

export async function unsuspendDriver(formData: FormData) {
  const id = String(formData.get('id') || '');
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_unsuspend_driver', { p_driver_id: id });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/drivers');
}

export async function archiveDriver(formData: FormData) {
  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || 'Archivé par admin').trim();
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_archive_driver', { p_driver_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/drivers');
}
