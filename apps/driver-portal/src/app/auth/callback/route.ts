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

  // Portail chauffeur : vérifie le rôle. Non-driver → sign out + message.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'driver' && profile?.role !== 'admin') {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          "Ce compte n'a pas de statut chauffeur. Prends d'abord un rendez-vous.",
        )}`,
      );
    }
  }
  return NextResponse.redirect(`${origin}${nextParam ?? '/'}`);
}
