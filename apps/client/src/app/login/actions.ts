'use server';

import { redirect } from 'next/navigation';
import { formatBeninPhone } from '@/lib/phone';
import { createServerSupabase } from '@/lib/supabase-server';

export async function login(formData: FormData) {
  const rawPhone = String(formData.get('phone') || '');
  const phone = formatBeninPhone(rawPhone);

  if (!phone) {
    redirect('/login?error=' + encodeURIComponent('Numéro invalide. Format attendu : +229 01 XX XX XX XX'));
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
  });

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message));
  }

  redirect('/login/verify?phone=' + encodeURIComponent(phone));
}

export async function logout() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}
