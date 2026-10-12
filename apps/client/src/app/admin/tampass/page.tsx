import { createServerSupabase } from '@/lib/supabase-server';
import { TamPassAdminView, type PassRow } from './TamPassAdminView';

export const dynamic = 'force-dynamic';

export default async function AdminTamPassPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('admin_tampass_list');
  return <TamPassAdminView rows={(Array.isArray(data) ? data : []) as PassRow[]} />;
}
