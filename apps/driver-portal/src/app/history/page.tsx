import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { PinIcon } from '@/components/Icon';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';

type RideRow = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  price_total_fcfa: number;
  driver_share_fcfa: number;
  driver_rachat_fcfa: number;
  distance_km: number | null;
  duration_min: number | null;
  status: string;
  requested_at: string;
  ended_at: string | null;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  matched: { label: 'En cours', color: 'bg-primary-500 text-white' },
  arrived: { label: 'En cours', color: 'bg-gold text-neutral-900' },
  in_progress: { label: 'En cours', color: 'bg-success/20 text-success' },
  completed: { label: 'Terminée', color: 'bg-success/10 text-success' },
  cancelled_by_client: { label: 'Annulée client', color: 'bg-neutral-200 text-neutral-600' },
  cancelled_by_driver: { label: 'Tu as annulé', color: 'bg-neutral-200 text-neutral-600' },
};

function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export default async function DriverHistoryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'driver' && profile.role !== 'admin') redirect('/');

  const supabase = createServerSupabase();

  // Get driver id
  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('profile_id', profile.id)
    .single();
  if (!driver) redirect('/');

  const { data: rides } = await supabase
    .from('rides_view')
    .select('id, pickup_address, dropoff_address, price_total_fcfa, driver_share_fcfa, driver_rachat_fcfa, distance_km, duration_min, status, requested_at, ended_at')
    .eq('driver_id', driver.id)
    .order('requested_at', { ascending: false })
    .limit(50);

  const list = (rides ?? []) as RideRow[];

  const completed = list.filter((r) => r.status === 'completed');
  const totalRevenu = completed.reduce((sum, r) => sum + r.driver_share_fcfa, 0);
  const totalRachat = completed.reduce((sum, r) => sum + r.driver_rachat_fcfa, 0);

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
          <span className="rounded-full bg-neutral-900 px-md py-xs text-[10px] font-bold uppercase text-white">
            Chauffeur
          </span>
        </header>

        <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">Historique</h1>

        {/* Stats */}
        <div className="mt-lg grid grid-cols-3 gap-sm">
          <StatCard label="Courses" value={completed.length.toString()} />
          <StatCard label="Cash gagné" value={formatFcfa(totalRevenu)} suffix="F" />
          <StatCard label="Fonds rachat" value={formatFcfa(totalRachat)} suffix="F" highlight />
        </div>

        {list.length === 0 ? (
          <div className="mt-xl rounded-xl bg-neutral-100 p-2xl text-center text-sm text-neutral-600">
            Aucune course encore. Passe en ligne pour recevoir tes premières courses.
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
                        <p className="flex-1 text-xs text-neutral-900">{truncate(r.pickup_address, 55)}</p>
                      </div>
                      <div className="ml-1.5 h-3 border-l-2 border-dashed border-neutral-300" />
                      <div className="flex items-start gap-xs">
                        <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-violet-500 text-white">
                          <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
                        </span>
                        <p className="flex-1 text-xs text-neutral-900">{truncate(r.dropoff_address, 55)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-extrabold text-success" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatFcfa(r.driver_share_fcfa)}
                      </p>
                      <p className="text-[10px] text-neutral-500">FCFA cash</p>
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

function StatCard({ label, value, suffix, highlight }: { label: string; value: string; suffix?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-md text-center shadow-sm ring-1 ring-neutral-200 ${highlight ? 'bg-gold/10 ring-gold/40' : 'bg-white'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-xs text-xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
        {suffix && <span className="ml-xs text-[10px] font-medium text-neutral-500">{suffix}</span>}
      </p>
    </div>
  );
}
