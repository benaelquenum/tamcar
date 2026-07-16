import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Handler du callback magic link email.
 * Supabase redirige ici avec `?code=...` après clic sur le lien de l'email.
 * On l'échange contre une session et on redirige vers /.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Lien invalide ou expiré')}`,
    );
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Si next est explicite, on le respecte ; sinon on route selon le rôle.
  if (nextParam) return NextResponse.redirect(`${origin}${nextParam}`);

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role === 'driver') {
      // App chauffeur dédiée
      const driverPortalUrl =
        process.env.NEXT_PUBLIC_DRIVER_URL || 'http://localhost:3002';
      return NextResponse.redirect(driverPortalUrl);
    }
    if (profile?.role === 'admin') return NextResponse.redirect(`${origin}/admin/rides`);
  }
  return NextResponse.redirect(`${origin}/`);
}
