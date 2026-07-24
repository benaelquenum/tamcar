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
  arrival_flagged: boolean | null;
  arrival_distance_m: number | null;
};

const STATUS_COLOR: Record<string, string> = {
  requested: 'bg-primary-100 text-primary-700',
  matched: 'bg-cyan-500/20 text-cyan-700',
  arrived: 'bg-gold text-neutral-900',
  in_progress: 'bg-success/20 text-success',
  completed: 'bg-success/10 text-success',
  cancelled_by_client: 'bg-neutral-200 text-neutral-600',
  cancelled_by_driver: 'bg-neutral-200 text-neutral-600',
  cancelled_by_admin: 'bg-neutral-300 text-neutral-700',
  expired: 'bg-error/10 text-error',
};

function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export default async function AdminRidesPage() {
  const supabase = createServerSupabase();

  const { data: rides } = await supabase
    .from('rides')
    .select('id, client_id, pickup_address, dropoff_address, distance_km, duration_min, price_total_fcfa, status, requested_at, arrival_flagged, arrival_distance_m')
    .order('requested_at', { ascending: false })
    .limit(50);

  const { count: totalRides } = await supabase
    .from('rides')
    .select('*', { count: 'exact', head: true });

  const { count: requestedCount } = await supabase
    .from('rides')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'requested');

  const { count: flaggedCount } = await supabase
    .from('rides')
    .select('*', { count: 'exact', head: true })
    .eq('arrival_flagged', true);

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
          {(flaggedCount ?? 0) > 0 && (
            <>
              {' · '}
              <strong className="text-warning" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {flaggedCount}
              </strong>{' '}
              signalées
            </>
          )}
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
                <tr key={r.id} className={`border-b border-neutral-100 last:border-0 ${r.arrival_flagged ? 'bg-warning/5' : ''}`}>
                  <td className="px-md py-md">
                    <p className="flex items-center gap-xs text-sm font-semibold text-neutral-900">
                      {r.arrival_flagged && (
                        <span
                          title={`Chauffeur a marqué "arrivé" à ${r.arrival_distance_m ?? '?'} m du point de départ`}
                          className="inline-flex items-center gap-xs rounded-full bg-warning px-xs py-0.5 text-[9px] font-bold uppercase text-white"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          {r.arrival_distance_m ? `${r.arrival_distance_m} m` : 'écart'}
                        </span>
                      )}
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
