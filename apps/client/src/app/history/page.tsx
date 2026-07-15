import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { PinIcon } from '@/components/Icon';
import { getCurrentUser } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';

type RideRow = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  price_total_fcfa: number;
  distance_km: number | null;
  status: string;
  requested_at: string;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  requested: { label: 'En attente', color: 'bg-primary-100 text-primary-700' },
  matched: { label: 'En route', color: 'bg-primary-500 text-white' },
  arrived: { label: 'Chauffeur arrivé', color: 'bg-gold text-neutral-900' },
  in_progress: { label: 'En cours', color: 'bg-success/20 text-success' },
  completed: { label: 'Terminée', color: 'bg-success/10 text-success' },
  cancelled_by_client: { label: 'Annulée', color: 'bg-neutral-200 text-neutral-600' },
  cancelled_by_driver: { label: 'Annulée', color: 'bg-neutral-200 text-neutral-600' },
  expired: { label: 'Expirée', color: 'bg-error/10 text-error' },
};

function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = createServerSupabase();
  const { data: rides } = await supabase
    .from('rides_view')
    .select('id, pickup_address, dropoff_address, price_total_fcfa, distance_km, status, requested_at')
    .eq('client_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(50);

  const list = (rides ?? []) as RideRow[];

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-64 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-70 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href="/"
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
        </header>

        <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">Historique</h1>
        <p className="mt-xs text-sm text-neutral-600">
          Tes {list.length} dernière{list.length > 1 ? 's' : ''} course{list.length > 1 ? 's' : ''}.
        </p>

        {list.length === 0 ? (
          <div className="mt-xl rounded-xl bg-neutral-100 p-2xl text-center text-sm text-neutral-600">
            Aucune course encore. C&apos;est le moment d&apos;en{' '}
            <Link href="/commande" className="font-semibold text-primary-500 underline">
              commander une
            </Link>{' '}
            !
          </div>
        ) : (
          <div className="mt-lg space-y-sm">
            {list.map((r) => {
              const status = STATUS_LABEL[r.status] ?? { label: r.status, color: 'bg-neutral-200 text-neutral-700' };
              return (
                <Link
                  key={r.id}
                  href={`/ride/${r.id}`}
                  className="block rounded-xl border border-neutral-200 bg-white p-md shadow-sm transition hover:shadow-md"
                >
                  <div className="mb-sm flex items-start justify-between gap-md">
                    <div className="flex-1 space-y-xs">
                      <div className="flex items-start gap-xs">
                        <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-primary-500 text-white">
                          <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
                        </span>
                        <p className="flex-1 text-xs text-neutral-900">{truncate(r.pickup_address, 60)}</p>
                      </div>
                      <div className="ml-1.5 h-3 border-l-2 border-dashed border-neutral-300" />
                      <div className="flex items-start gap-xs">
                        <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-violet-500 text-white">
                          <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
                        </span>
                        <p className="flex-1 text-xs text-neutral-900">{truncate(r.dropoff_address, 60)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatFcfa(r.price_total_fcfa)}
                      </p>
                      <p className="text-[10px] text-neutral-500">FCFA</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`inline-flex rounded-full px-sm py-0.5 font-bold ${status.color}`}>
                      {status.label}
                    </span>
                    <span className="text-neutral-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(r.requested_at).toLocaleString('fr-FR', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                      {r.distance_km && <> · {r.distance_km.toFixed(1)} km</>}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="h-2xl" />
      </div>
    </main>
  );
}
