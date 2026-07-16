import { cache } from 'react';
import { createServerSupabase } from './supabase-server';

export type TamCarProfile = {
  id: string;
  phone: string | null;
  full_name: string;
  role: 'client' | 'driver' | 'dealer' | 'admin';
  avatar_url: string | null;
};

/**
 * Retourne l'utilisateur authentifié (ou null).
 * Mémoisé par React `cache` pour ne pas relancer plusieurs auth.getUser()
 * dans le même render tree.
 */
export const getCurrentUser = cache(async () => {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Retourne le profil TamCar du user authentifié (ou null).
 */
export const getCurrentProfile = cache(async (): Promise<TamCarProfile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, phone, full_name, role, avatar_url')
    .eq('id', user.id)
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('getCurrentProfile error:', error.message);
    return null;
  }
  return data as TamCarProfile;
});

/**
 * Extrait le prénom du full_name (premier mot).
 * "Terence Beniraphael" → "Terence" | null → null
 */
export function firstNameOf(profile: TamCarProfile | null): string | null {
  if (!profile?.full_name) return null;
  return profile.full_name.trim().split(/\s+/)[0] || null;
}
