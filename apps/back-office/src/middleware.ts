import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware TamCar Office :
 * 1. Rafraîchit la session Supabase (refresh token auto)
 * 2. Bloque tout si pas d'auth → /login
 * 3. Gate rôle : seuls admin / staff / accountant entrent — les comptes
 *    client, chauffeur ou partenaire véhicule sont refusés (fail-closed).
 */

const PUBLIC_PREFIXES = ['/login', '/auth'];

const ALLOWED_ROLES = ['admin', 'staff', 'accountant'];

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

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (!user && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Gate rôle — fail-closed : sans profil lisible ou rôle autorisé, on sort.
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      await supabase.auth.signOut();
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'forbidden');
      return NextResponse.redirect(loginUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
