import { createServerSupabase } from '@/lib/supabase-server';
import { PublicTrackView, type PublicTrackRow } from './PublicTrackView';

// Page PUBLIQUE (sans compte) : suivi de course via token partagé.
// Les données sont limitées côté RPC (ni téléphones, ni prix).
export default async function PublicTrackPage({ params }: { params: { token: string } }) {
  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('public_ride_track', { p_token: params.token });
  const row = (Array.isArray(data) ? data[0] : null) as PublicTrackRow | null;

  return <PublicTrackView token={params.token} initial={row ?? null} />;
}
