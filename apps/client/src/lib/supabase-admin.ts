// Client Supabase avec service_role_key.
// Usage exclusif dans les Server Actions et Server Components admin.
// Ne JAMAIS exposer côté client (sinon toute la RLS est bypassée).

import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAdminSupabase() {
  if (!URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL manquant');
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant (env var Vercel)');
  return createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
