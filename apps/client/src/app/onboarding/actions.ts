'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';

export async function completeOnboarding(formData: FormData) {
  const firstName = String(formData.get('firstName') || '').trim();
  const lastName = String(formData.get('lastName') || '').trim();

  if (!firstName || !lastName) {
    redirect(
      '/onboarding?error=' +
        encodeURIComponent('Prénom et nom requis'),
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: `${firstName} ${lastName}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    redirect('/onboarding?error=' + encodeURIComponent(error.message));
  }

  redirect('/');
}
