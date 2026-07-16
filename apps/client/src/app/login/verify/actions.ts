'use server';

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

export async function verify(formData: FormData) {
  const phone = String(formData.get('phone') || '');
  const token = String(formData.get('token') || '').replace(/\D/g, '');

  if (!phone.startsWith('+229')) {
    redirect('/login?error=' + encodeURIComponent('Session expirée, recommence.'));
  }
  if (token.length !== 6) {
    redirect(
      '/login/verify?phone=' +
        encodeURIComponent(phone) +
        '&error=' +
        encodeURIComponent('Code à 6 chiffres attendu.'),
    );
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });

  if (error) {
    redirect(
      '/login/verify?phone=' +
        encodeURIComponent(phone) +
        '&error=' +
        encodeURIComponent(error.message),
    );
  }

  // Route selon le rôle
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role === 'driver') {
      // App chauffeur dédiée sur URL séparée
      redirect(process.env.NEXT_PUBLIC_DRIVER_URL || 'http://localhost:3002');
    }
    if (profile?.role === 'admin') redirect('/admin/rides');
  }
  redirect('/');
}

export async function resend(formData: FormData) {
  const phone = String(formData.get('phone') || '');
  if (!phone.startsWith('+229')) {
    redirect('/login?error=' + encodeURIComponent('Session expirée, recommence.'));
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (error) {
    redirect(
      '/login/verify?phone=' +
        encodeURIComponent(phone) +
        '&error=' +
        encodeURIComponent(error.message),
    );
  }

  redirect(
    '/login/verify?phone=' + encodeURIComponent(phone) + '&resent=1',
  );
}
