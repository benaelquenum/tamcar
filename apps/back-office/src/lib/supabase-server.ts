import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Client Supabase pour Server Components / Server Actions / Route Handlers.
 * Utilise les cookies Next.js pour la gestion de session côté serveur.
 * Appeler DANS un context serveur uniquement (throw sinon).
 */
export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components ne peuvent pas set les cookies — silent OK,
            // le middleware s'occupera du refresh.
          }
        },
      },
    },
  );
}
