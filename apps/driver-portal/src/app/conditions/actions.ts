'use server';

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { TERMS_APP, TERMS_VERSION } from '@/lib/terms';

/**
 * Enregistre l'acceptation des CGU + Politique de confidentialité
 * (version courante) pour le chauffeur connecté, puis reprend la navigation.
 */
export async function acceptTermsAction(formData: FormData) {
  const next = String(formData.get('next') || '/');
  const accepted = formData.get('accept_terms') === 'on';

  if (!accepted) {
    redirect(
      '/conditions?error=' +
        encodeURIComponent('Vous devez cocher la case pour continuer.') +
        '&next=' +
        encodeURIComponent(next),
    );
  }

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const rows = ['cgu', 'privacy'].map((doc) => ({
    profile_id: user.id,
    doc,
    version: TERMS_VERSION,
    app: TERMS_APP,
  }));

  const { error } = await supabase
    .from('terms_acceptances')
    .upsert(rows, {
      onConflict: 'profile_id,doc,version,app',
      ignoreDuplicates: true,
    });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[driver acceptTermsAction] insert error', error);
    redirect(
      '/conditions?error=' +
        encodeURIComponent('Erreur d’enregistrement, réessayez.') +
        '&next=' +
        encodeURIComponent(next),
    );
  }

  redirect(next.startsWith('/') ? next : '/');
}
