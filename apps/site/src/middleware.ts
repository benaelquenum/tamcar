import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Session de l'espace partenaire : rafraîchit le jeton, renvoie vers /connexion si on n'est pas connecté,
 * et vers /espace si on est déjà connecté. Les pages publiques du site ne passent pas par ici.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && pathname.startsWith('/espace')) {
    const url = new URL('/connexion', request.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  if (user && pathname === '/connexion' && !request.nextUrl.searchParams.has('erreur')) {
    return NextResponse.redirect(new URL('/espace', request.url));
  }
  return response;
}

export const config = {
  matcher: ['/espace/:path*', '/connexion'],
};
