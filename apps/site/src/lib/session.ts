import { cache } from 'react';
import { createServerSupabase } from './supabase-server';

export type TamCarProfile = {
  id: string;
  phone: string | null;
  full_name: string;
  role: 'client' | 'driver' | 'dealer' | 'admin';
  avatar_url: string | null;
};

/** Utilisateur authentifié (ou null). Mémoïsé pour ne pas relancer auth.getUser() dans le même rendu. */
export const getCurrentUser = cache(async () => {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Profil TamCar de l'utilisateur authentifié (ou null). */
export const getCurrentProfile = cache(async (): Promise<TamCarProfile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, phone, full_name, role, avatar_url')
    .eq('id', user.id)
    .single();
  if (error) return null;
  return data as TamCarProfile;
});
