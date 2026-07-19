'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `Tam${out}!`;
}

export type CreateDriverState = {
  ok: boolean;
  error?: string;
  credentials?: { email: string; password: string; phone: string; full_name: string };
};

export async function createDriver(_prev: CreateDriverState | undefined, formData: FormData): Promise<CreateDriverState> {
  try {
    const result = await createDriverImpl(formData);
    return { ok: true, credentials: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

async function createDriverImpl(formData: FormData): Promise<{ email: string; password: string; phone: string; full_name: string }> {
  const phone_raw = String(formData.get('phone') || '').trim();
  const email_raw = String(formData.get('email') || '').trim().toLowerCase();
  const full_name = String(formData.get('full_name') || '').trim();
  const application_type = String(formData.get('application_type') || 'cession');
  const license = String(formData.get('license') || '').trim();
  const id_card = String(formData.get('id_card') || '').trim();

  if (!full_name) throw new Error('Nom complet obligatoire');
  if (!phone_raw && !email_raw) throw new Error('Téléphone ou email obligatoire');
  if (application_type !== 'cession' && application_type !== 'proprietaire') {
    throw new Error('Formule invalide');
  }

  // Email requis pour le login initial. Génère un email .tamcar.local si non fourni.
  const email = email_raw || `chauffeur-${Date.now().toString(36)}@tamcar.local`;
  const phone = phone_raw || null;
  const password = generatePassword();

  const admin = createAdminSupabase();

  // 1. Crée le user auth (le trigger handle_new_user insère profiles auto)
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    phone: phone || undefined,
    email_confirm: true,
    phone_confirm: phone ? true : undefined,
    user_metadata: { full_name },
  });
  if (authErr) throw new Error(`Création user : ${authErr.message}`);
  if (!authData.user) throw new Error('User auth non créé');

  const userId = authData.user.id;

  // 2. Update profile role → driver + set phone au cas où le trigger l'a raté
  await admin
    .from('profiles')
    .update({ full_name, phone, role: 'driver' })
    .eq('id', userId);

  // 3. Crée la row drivers
  const { error: drvErr } = await admin.from('drivers').upsert({
    profile_id: userId,
    application_type,
    license_number: license || null,
    id_card_number: id_card || null,
    status: 'active',
    kyc_status: 'approved',
  }, { onConflict: 'profile_id' });
  if (drvErr) throw new Error(`Création chauffeur : ${drvErr.message}`);

  revalidatePath('/admin/drivers');
  return { email, password, phone: phone || '', full_name };
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
