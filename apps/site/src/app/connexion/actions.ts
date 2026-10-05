'use server';

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

/** Chemin de retour : interne uniquement (jamais un domaine tiers). */
function safeNext(next: string): string {
  return next.startsWith('/espace') && !next.startsWith('//') ? next : '/espace';
}

/**
 * Connexion d'un partenaire véhicule avec les identifiants remis par TamCar. Les autres profils
 * (clients, chauffeurs) n'ont rien à faire ici : ils ont leurs applications.
 */
export async function signInAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const next = safeNext(String(formData.get('next') || '/espace'));

  if (!email || !email.includes('@') || !password) {
    redirect('/connexion?erreur=' + encodeURIComponent('Saisissez votre adresse e-mail et votre mot de passe.'));
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    redirect('/connexion?erreur=' + encodeURIComponent('Adresse e-mail ou mot de passe incorrect.'));
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
  if (!profile || (profile.role !== 'dealer' && profile.role !== 'admin')) {
    await supabase.auth.signOut();
    redirect('/connexion?erreur=role');
  }

  redirect(next);
}

export async function signOutAction() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  redirect('/connexion');
}
