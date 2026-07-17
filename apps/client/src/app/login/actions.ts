'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { formatBeninPhone } from '@/lib/phone';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Sign IN — utilisateur existant, email + password
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
      '/login?tab=signin&error=' +
        encodeURIComponent('Mot de passe requis (min 6 caractères)'),
    );
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[signInAction] Supabase error', error);
    redirect(
      '/login?tab=signin&error=' +
        encodeURIComponent(error.message || 'Email ou mot de passe incorrect'),
    );
  }

  redirect(next.startsWith('/') ? next : '/');
}

/**
 * Sign UP — nouvel utilisateur avec formulaire complet
 */
export async function signUpAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const firstName = String(formData.get('first_name') || '').trim();
  const lastName = String(formData.get('last_name') || '').trim();
  const phoneRaw = String(formData.get('phone') || '').trim();
  const phone = phoneRaw ? formatBeninPhone(phoneRaw) : null;

  if (!email || !email.includes('@')) {
    redirect(
      '/login?tab=signup&error=' + encodeURIComponent('Email invalide'),
    );
  }
  if (!password || password.length < 6) {
    redirect(
      '/login?tab=signup&error=' +
        encodeURIComponent('Mot de passe : minimum 6 caractères'),
    );
  }
  if (!firstName || firstName.length < 2) {
    redirect(
      '/login?tab=signup&error=' + encodeURIComponent('Prénom obligatoire'),
    );
  }
  if (!lastName || lastName.length < 2) {
    redirect(
      '/login?tab=signup&error=' + encodeURIComponent('Nom obligatoire'),
    );
  }
  if (phoneRaw && !phone) {
    redirect(
      '/login?tab=signup&error=' +
        encodeURIComponent('Numéro Bénin invalide (format +229…)'),
    );
  }

  const supabase = createServerSupabase();
  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone },
    },
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[signUpAction] Supabase error', error);
    redirect(
      '/login?tab=signup&error=' +
        encodeURIComponent(error.message || 'Erreur lors de la création'),
    );
  }

  // Le trigger de création de profile s'exécute côté Postgres.
  // On update le profile avec les infos supplémentaires.
  if (data.user) {
    await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone: phone || null,
      })
      .eq('id', data.user.id);

    // Si session déjà établie (Confirm email OFF), on redirige direct
    if (data.session) {
      redirect('/');
    }
  }

  // Sinon (Confirm email ON), on affiche un message d'attente
  redirect('/login?sent=' + encodeURIComponent(email));
}

/**
 * Magic link email (fallback / mot de passe oublié).
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
      : 'http://localhost:3001');

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[magicLinkAction] Supabase error', error);
    redirect(
      '/login?error=' +
        encodeURIComponent(error.message || 'Erreur envoi lien magique'),
    );
  }

  redirect('/login?sent=' + encodeURIComponent(email));
}

/**
 * Reset password : envoie un email avec lien vers /auth/callback?type=recovery
 * puis /reset-password où l'user définit son nouveau mot de passe.
 */
export async function requestPasswordResetAction(formData: FormData) {
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
      : 'http://localhost:3001');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?type=recovery`,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[requestPasswordResetAction client] Supabase error', error);
    redirect(
      '/login?error=' +
        encodeURIComponent(error.message || 'Erreur envoi email'),
    );
  }

  redirect('/login?reset_sent=' + encodeURIComponent(email));
}

/**
 * Logout (bouton compte)
 */
export async function logout() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * Ancien loginPhone (OTP SMS) — conservé pour rétrocompat mais désactivé
 * en pratique tant que Twilio n'est pas configuré en prod.
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
 * Ancien loginEmail (magic link) — alias vers magicLinkAction pour compat
 */
export const loginEmail = magicLinkAction;
