import { createServerSupabase } from '@/lib/supabase-server';
import { DataBundlesView, bundleWeeks, type BundleRow } from './DataBundlesView';

export const dynamic = 'force-dynamic';

export default async function AdminDataBundlesPage({ searchParams }: { searchParams: { semaine?: string } }) {
  const supabase = createServerSupabase();
  const { data: startData } = await supabase.rpc('data_bundle_start');
  const startIso = typeof startData === 'string' ? startData : '2027-07-01';
  const weeks = bundleWeeks(startIso);
  const week = weeks.find((w) => w.id === searchParams.semaine) ?? weeks[0];

  const [{ data: rankData }, { data: awardsData }, { data: rules }] = await Promise.all([
    supabase.rpc('admin_data_bundle_ranking', { p_week_start: week.id }),
    supabase.from('data_bundle_awards').select('status').eq('week_start', week.id),
    supabase.from('program_rules').select('key, value').like('key', 'data_bundle_%'),
  ]);

  const r = Object.fromEntries(((rules ?? []) as { key: string; value: number }[]).map((x) => [x.key, x.value])) as Record<string, number>;
  return (
    <DataBundlesView
      week={week}
      weeks={weeks}
      startIso={startIso}
      rows={(Array.isArray(rankData) ? rankData : []) as BundleRow[]}
      awards={(awardsData ?? []) as { status: string }[]}
      r={r}
    />
  );
}
