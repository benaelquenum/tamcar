import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware minimal — le check d'auth + rôle se fait dans chaque page
 * (Server Components) via `getCurrentProfile()`. Ici on force juste les
 * en-têtes cache pour éviter le stale post-login.
 *
 * Note : les routes /login/**, /auth/**, /_next/**, /favicon, statics sont
 * exemptées via `matcher` ci-dessous.
 */
export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store, must-revalidate');
  return res;
}

export const config = {
  matcher: [
    // Toutes les routes sauf : login, auth callback, statics, favicon, manifest
    '/((?!login|auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons).*)',
  ],
};
