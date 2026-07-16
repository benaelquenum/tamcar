'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { formatBeninPhone } from '@/lib/phone';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Envoi OTP par SMS Twilio (prod / vrai lancement).
 */
export async function loginPhone(formData: FormData) {
  const rawPhone = String(formData.get('phone') || '');
  const phone = formatBeninPhone(rawPhone);

  if (!phone) {
    redirect(
      '/login?error=' +
        encodeURIComponent('Numéro invalide. Format attendu : +229 01 XX XX XX XX'),
    );
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message));
  }

  redirect('/login/verify?phone=' + encodeURIComponent(phone));
}

/**
 * Envoi magic link par email (dev / tests, gratuit).
 * Nécessite NEXT_PUBLIC_AUTH_METHOD=email et redirect URL configurée dans Supabase.
 */
export async function loginEmail(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    redirect('/login?error=' + encodeURIComponent('Email invalide'));
  }

  const supabase = createServerSupabase();
  const h = headers();
  const origin =
    h.get('origin') ??
    (h.get('x-forwarded-host')
      ? `https://${h.get('x-forwarded-host')}`
      : 'http://localhost:3002');

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[loginEmail driver-portal] Supabase error', {
      code: error.code,
      status: error.status,
      name: error.name,
      message: error.message,
    });
    const msg =
      error.message ||
      error.name ||
      `Erreur Supabase (status ${error.status ?? 'inconnu'})`;
    redirect('/login?error=' + encodeURIComponent(msg));
  }

  redirect('/login?sent=' + encodeURIComponent(email));
}

export async function logout() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}
