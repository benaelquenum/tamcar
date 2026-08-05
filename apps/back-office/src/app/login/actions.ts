'use server';

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

const ALLOWED_ROLES = ['admin', 'staff', 'accountant'];

/**
 * Sign In — réservé aux comptes back-office (admin, staff, accountant).
 */
export async function signInAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const next = String(formData.get('next') || '/');

  if (!email || !password) {
    redirect('/login?error=missing');
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect('/login?error=credentials');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    await supabase.auth.signOut();
    redirect('/login?error=forbidden');
  }

  redirect(next.startsWith('/') ? next : '/');
}

export async function signOutAction() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}
