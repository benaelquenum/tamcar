'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Client Supabase pour Client Components.
 * Singleton — un seul par tab navigateur.
 */
export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
