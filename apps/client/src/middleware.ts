import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware combiné :
 * 1. Rafraîchit la session Supabase (refresh token auto)
 * 2. Bloque les routes protégées si pas d'auth → redirect /login?next=<path>
 *
 * Pattern officiel : https://supabase.com/docs/guides/auth/server-side/nextjs
 */

const PUBLIC_PREFIXES = [
  '/login',
  '/auth', // callback OTP + magic link
  '/devenir-chauffeur', // funnel candidat chauffeur (public marketing)
  '/driver', // page informative "L'espace chauffeur a déménagé"
];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT : ne pas retirer, garantit le refresh du token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // Utilisateur connecté qui va sur /login → redirect vers home
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Route protégée sans utilisateur → redirect /login
  if (!user && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Toutes routes sauf assets statiques + PWA manifest + service worker
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|workbox-.*|worker-.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
