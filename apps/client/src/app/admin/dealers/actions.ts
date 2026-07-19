'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `Tam${out}!`;
}

export type CreateDealerState = {
  ok: boolean;
  error?: string;
  credentials?: { email: string; password: string; phone: string; full_name: string; company_name: string };
};

export async function createDealer(_prev: CreateDealerState | undefined, formData: FormData): Promise<CreateDealerState> {
  try {
    const r = await createDealerImpl(formData);
    return { ok: true, credentials: r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

async function createDealerImpl(formData: FormData): Promise<{ email: string; password: string; phone: string; full_name: string; company_name: string }> {
  const phone_raw = String(formData.get('phone') || '').trim();
  const email_raw = String(formData.get('email') || '').trim().toLowerCase();
  const full_name = String(formData.get('full_name') || '').trim();
  const company_name = String(formData.get('company_name') || '').trim();
  const rccm = String(formData.get('rccm') || '').trim();
  const share_pct = parseFloat(String(formData.get('share_pct') || '25'));
  const is_shareholder = String(formData.get('is_shareholder') || '') === 'on';
  const shareholder_pct_raw = String(formData.get('shareholder_pct') || '').trim();

  if (!full_name || !company_name) throw new Error('Nom et raison sociale obligatoires');
  if (!phone_raw && !email_raw) throw new Error('Téléphone ou email obligatoire');

  const email = email_raw || `dealer-${Date.now().toString(36)}@tamcar.local`;
  const phone = phone_raw || null;
  const password = generatePassword();

  const admin = createAdminSupabase();

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

  await admin
    .from('profiles')
    .update({ full_name, phone, role: 'dealer' })
    .eq('id', userId);

  const { error: dpErr } = await admin.from('dealer_partners').upsert({
    profile_id: userId,
    company_name,
    rccm: rccm || null,
    dealer_share_pct: share_pct,
    is_shareholder,
    shareholder_pct: shareholder_pct_raw ? parseFloat(shareholder_pct_raw) : null,
  }, { onConflict: 'profile_id' });
  if (dpErr) throw new Error(`Création concessionnaire : ${dpErr.message}`);

  revalidatePath('/admin/dealers');
  return { email, password, phone: phone || '', full_name, company_name };
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
