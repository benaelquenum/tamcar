'use server';

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { TERMS_APP, TERMS_VERSION } from '@/lib/terms';

function safeNext(next: string): string {
  return next.startsWith('/espace') && !next.startsWith('//') ? next : '/espace';
}

/**
 * Enregistre l'acceptation des CGU + politique de confidentialité (version courante) pour le partenaire
 * connecté, puis reprend la navigation. Une ligne par document : preuve horodatée et versionnée.
 */
export async function acceptTermsAction(formData: FormData) {
  const next = safeNext(String(formData.get('next') || '/espace'));
  const back = (msg: string) => '/conditions?erreur=' + encodeURIComponent(msg) + '&next=' + encodeURIComponent(next);

  if (formData.get('accept_terms') !== 'on') redirect(back('Cochez la case pour continuer.'));

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/connexion');

  const rows = ['cgu', 'privacy'].map((doc) => ({ profile_id: user.id, doc, version: TERMS_VERSION, app: TERMS_APP }));
  const { error } = await supabase
    .from('terms_acceptances')
    .upsert(rows, { onConflict: 'profile_id,doc,version,app', ignoreDuplicates: true });
  if (error) redirect(back('Enregistrement impossible, réessayez.'));

  redirect(next);
}
