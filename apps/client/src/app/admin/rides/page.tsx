import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';

type RideRow = {
  id: string;
  client_id: string;
  pickup_address: string;
  dropoff_address: string;
  distance_km: number | null;
  duration_min: number | null;
  price_total_fcfa: number;
  status: string;
  requested_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  requested: 'bg-primary-100 text-primary-700',
  matched: 'bg-cyan-500/20 text-cyan-700',
  arrived: 'bg-gold text-neutral-900',
  in_progress: 'bg-success/20 text-success',
  completed: 'bg-success/10 text-success',
  cancelled_by_client: 'bg-neutral-200 text-neutral-600',
  cancelled_by_driver: 'bg-neutral-200 text-neutral-600',
  expired: 'bg-error/10 text-error',
};

function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export default async function AdminRidesPage() {
  const supabase = createServerSupabase();

  const { data: rides } = await supabase
    .from('rides_view')
    .select('id, client_id, pickup_address, dropoff_address, distance_km, duration_min, price_total_fcfa, status, requested_at')
    .order('requested_at', { ascending: false })
    .limit(50);

  const { count: totalRides } = await supabase
    .from('rides')
    .select('*', { count: 'exact', head: true });

  const { count: requestedCount } = await supabase
    .from('rides')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'requested');

  return (
    <div>
      <div className="mb-xl flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-neutral-900">Courses</h1>
        <p className="text-sm text-neutral-600">
          <strong className="text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {totalRides ?? 0}
          </strong> courses ·{' '}
          <strong className="text-primary-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {requestedCount ?? 0}
          </strong> en attente de matching
        </p>
      </div>

      {!rides || rides.length === 0 ? (
        <div className="rounded-xl bg-white p-2xl text-center text-sm text-neutral-600 shadow-sm">
          Aucune course encore.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full">
            <thead className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-bold uppercase tracking-wider text-neutral-600">
              <tr>
                <th className="px-md py-sm">Trajet</th>
                <th className="px-md py-sm">Distance</th>
                <th className="px-md py-sm">Prix</th>
                <th className="px-md py-sm">Statut</th>
                <th className="px-md py-sm">Reçue</th>
                <th className="px-md py-sm text-right">Détails</th>
              </tr>
            </thead>
            <tbody>
              {(rides as RideRow[]).map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-md py-md">
                    <p className="text-sm font-semibold text-neutral-900">
                      {truncate(r.pickup_address, 40)}
                    </p>
                    <p className="text-xs text-neutral-500">→ {truncate(r.dropoff_address, 40)}</p>
                  </td>
                  <td className="px-md py-md text-sm text-neutral-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {r.distance_km ? `${r.distance_km.toFixed(1)} km` : '—'}
                    {r.duration_min && <span className="text-xs text-neutral-400"> · {r.duration_min} min</span>}
                  </td>
                  <td className="px-md py-md text-sm font-bold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatFcfa(r.price_total_fcfa)} F
                  </td>
                  <td className="px-md py-md">
                    <span className={`inline-flex rounded-full px-sm py-0.5 text-[10px] font-bold ${STATUS_COLOR[r.status] || 'bg-neutral-200 text-neutral-700'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-md py-md text-xs text-neutral-500">
                    {new Date(r.requested_at).toLocaleString('fr-FR', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-md py-md text-right">
                    <Link href={`/ride/${r.id}`} className="text-xs font-bold text-primary-500 hover:underline">
                      Voir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
