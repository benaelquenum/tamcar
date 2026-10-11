import { createServerSupabase } from '@/lib/supabase-server';
import { GadgetsView, rounds, type Award, type Kind, type RankRow } from './GadgetsView';

export const dynamic = 'force-dynamic';

export default async function AdminGadgetsPage({ searchParams }: { searchParams: { tour?: string } }) {
  const supabase = createServerSupabase();
  const all = rounds();
  const round = all.find((x) => x.id === searchParams.tour) ?? all[0];

  const [{ data: drivers }, { data: clients }, { data: awardsData }, { data: rules }] = await Promise.all([
    supabase.rpc('admin_gadget_ranking', { p_kind: 'driver', p_from: round.from, p_to: round.to }),
    supabase.rpc('admin_gadget_ranking', { p_kind: 'client', p_from: round.from, p_to: round.to }),
    supabase
      .from('gadget_awards')
      // « profiles!profile_id » : la table a deux liens vers profiles (le gagnant et celui qui a validé)
      .select('id, kind, rank, gadget, value_fcfa, status, note, delivered_at, profile:profiles!profile_id(full_name, phone)')
      .eq('round_from', round.from)
      .order('kind')
      .order('rank'),
    supabase.from('program_rules').select('key, value').like('key', 'gadget_%'),
  ]);

  const r = Object.fromEntries(((rules ?? []) as { key: string; value: number }[]).map((x) => [x.key, x.value])) as Record<string, number>;
  const rankings: Record<Kind, RankRow[]> = {
    driver: (Array.isArray(drivers) ? drivers : []) as RankRow[],
    client: (Array.isArray(clients) ? clients : []) as RankRow[],
  };
  const awards = (awardsData ?? []) as unknown as Award[];

  return <GadgetsView round={round} all={all} r={r} rankings={rankings} awards={awards} />;
}
