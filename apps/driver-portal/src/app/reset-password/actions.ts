'use server';

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('password_confirm') || '');

  if (password.length < 6) {
    redirect(
      '/reset-password?error=' +
        encodeURIComponent('Mot de passe : minimum 6 caractères'),
    );
  }
  if (password !== confirm) {
    redirect(
      '/reset-password?error=' +
        encodeURIComponent('Les 2 mots de passe ne correspondent pas'),
    );
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[updatePasswordAction driver-portal] Supabase error', error);
    redirect(
      '/reset-password?error=' +
        encodeURIComponent(error.message || 'Erreur lors de la mise à jour'),
    );
  }

  // Après update, on force un logout pour que le user se reconnecte proprement
  await supabase.auth.signOut();
  redirect(
    '/login?error=' +
      encodeURIComponent('Mot de passe mis à jour, reconnecte-toi.'),
  );
}
