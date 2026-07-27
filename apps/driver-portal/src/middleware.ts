import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { TERMS_VERSION } from '@/lib/terms';

/**
 * Middleware combiné :
 * 1. Rafraîchit la session Supabase (refresh token auto)
 * 2. Bloque les routes protégées si pas d'auth → redirect /login?next=<path>
 * 3. Gate CGU : tant que la version courante n'est pas acceptée, TOUTE requête
 *    protégée est renvoyée vers /conditions (impossible de contourner l'étape).
 */

const PUBLIC_PREFIXES = [
  '/login',
  '/auth',
  '/reset-password',
  '/cgu', // documents légaux consultables sans compte
  '/confidentialite',
];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  supabaseResponse.headers.set('Cache-Control', 'no-store, must-revalidate');

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.headers.set('Cache-Control', 'no-store, must-revalidate');
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // Utilisateur connecté sur /login → home
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Route protégée sans user → login
  if (!user && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Gate CGU (à chaque requête) : utilisateur connecté qui n'a pas accepté la
  // version courante → forcé sur /conditions. Fail-open en cas d'erreur.
  const isTermsExempt = isPublic || pathname.startsWith('/conditions');
  if (user && !isTermsExempt) {
    const { count, error: termsError } = await supabase
      .from('terms_acceptances')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id)
      .eq('doc', 'cgu')
      .eq('version', TERMS_VERSION);
    if (!termsError && !count) {
      const url = new URL('/conditions', request.url);
      if (pathname !== '/') url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|workbox-.*|worker-.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3)$).*)',
  ],
};
