'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { formatBeninPhone } from '@/lib/phone';
import { createServerSupabase } from '@/lib/supabase-server';
import { TERMS_VERSION } from '@/lib/terms';

/**
 * Sign In — chauffeur existant, email + password.
 * Refuse si le user n'a pas le rôle 'driver' ou 'admin'.
 */
export async function signInAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const next = String(formData.get('next') || '/');

  if (!email || !email.includes('@')) {
    redirect('/login?error=' + encodeURIComponent('Email invalide'));
  }
  if (!password || password.length < 6) {
    redirect(
      '/login?error=' +
        encodeURIComponent('Mot de passe requis (min 6 caractères)'),
    );
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[driver-portal signInAction] Supabase error', error);
    redirect(
      '/login?error=' +
        encodeURIComponent(error.message || 'Email ou mot de passe incorrect'),
    );
  }

  // Vérifie que le user a bien un profil driver ou admin
  if (data.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profile?.role !== 'driver' && profile?.role !== 'admin') {
      await supabase.auth.signOut();
      redirect(
        '/login?error=' +
          encodeURIComponent(
            "Ce compte n'a pas le statut chauffeur. Prends d'abord un rendez-vous sur le site TamCar.",
          ),
      );
    }

    // Gate CGU : si la version courante n'a pas été acceptée → /conditions
    // Fail-open : en cas d'erreur technique (table absente, réseau), on laisse
    // passer plutôt que de bloquer la connexion — le gate resservira ensuite.
    const { count, error: termsError } = await supabase
      .from('terms_acceptances')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', data.user.id)
      .eq('doc', 'cgu')
      .eq('version', TERMS_VERSION);

    if (!termsError && !count) {
      redirect('/conditions?next=' + encodeURIComponent(next));
    }
  }

  redirect(next.startsWith('/') ? next : '/');
}

/**
 * Magic link email (fallback / mot de passe oublié pour un chauffeur existant)
 */
export async function magicLinkAction(formData: FormData) {
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
    console.error('[driver-portal magicLinkAction] Supabase error', error);
    redirect(
      '/login?error=' +
        encodeURIComponent(error.message || 'Erreur envoi lien magique'),
    );
  }

  redirect('/login?sent=' + encodeURIComponent(email));
}

/**
 * Reset password : envoie un email avec lien vers /auth/callback?type=recovery
 * qui redirige ensuite vers /reset-password où l'user définit son nouveau mot de passe.
 */
export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    redirect(
      '/login?error=' +
        encodeURIComponent('Email invalide'),
    );
  }

  const supabase = createServerSupabase();
  const h = headers();
  const origin =
    h.get('origin') ??
    (h.get('x-forwarded-host')
      ? `https://${h.get('x-forwarded-host')}`
      : 'http://localhost:3002');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?type=recovery`,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[requestPasswordResetAction driver-portal] Supabase error', error);
    redirect(
      '/login?error=' +
        encodeURIComponent(error.message || 'Erreur envoi email'),
    );
  }

  redirect('/login?reset_sent=' + encodeURIComponent(email));
}

export async function logout() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * Ancien loginPhone SMS OTP — désactivé tant que Twilio pas configuré prod.
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
  if (error) redirect('/login?error=' + encodeURIComponent(error.message));
  redirect('/login/verify?phone=' + encodeURIComponent(phone));
}

/**
 * Alias magic link pour rétrocompat.
 */
export const loginEmail = magicLinkAction;
