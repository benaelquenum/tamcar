import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';

type RecentDriver = {
  driver_id: string;
  driver_name: string;
  driver_rating: number | null;
  vehicle_category: string;
  vehicle_label: string | null;
  is_online: boolean;
  rides_count: number;
  last_ride_at: string | null;
};

export default async function ChauffeursPage() {
  const supabase = createServerSupabase();

  const { data: drivers } = await supabase.rpc('my_recent_drivers', { p_limit: 20 });
  const recent = (drivers as RecentDriver[]) ?? [];

  return (
    <main className="mx-auto max-w-md px-lg py-xl">
      <Link
        href="/"
        className="mb-md inline-flex items-center gap-xs text-xs font-semibold text-primary-600"
      >
        ← Accueil
      </Link>
      <h1 className="text-xl font-extrabold text-neutral-900">Mes chauffeurs</h1>
      <p className="text-sm text-neutral-500">
        Commandez directement à un chauffeur que vous avez déjà eu : il reçoit votre
        demande, et la course suit son cours normal. Sans réponse après 2 minutes,
        vous pouvez relancer ou commander une course ordinaire.
      </p>

      {/* Liste des chauffeurs récents */}
      <section className="mt-xl">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
          Chauffeurs déjà eus
        </h2>
        <div className="mt-md space-y-sm">
          {recent.length === 0 && (
            <p className="rounded-xl bg-neutral-50 p-lg text-sm text-neutral-500">
              Vous n&apos;avez pas encore de course terminée. Après votre première
              course, vos chauffeurs apparaîtront ici.
            </p>
          )}
          {recent.map((d) => (
            <Link
              key={d.driver_id}
              href={`/chauffeurs/${d.driver_id}`}
              className="block rounded-xl border border-neutral-200 bg-white p-md transition hover:border-primary-300 hover:shadow-sm"
            >
              <div className="flex items-baseline justify-between">
                <p className="text-base font-bold text-neutral-900">
                  {d.driver_name}
                  {d.driver_rating != null && (
                    <span className="ml-sm text-xs font-bold text-amber-500">
                      ★ {Number(d.driver_rating).toFixed(1)}
                    </span>
                  )}
                </p>
                <span
                  className={`flex items-center gap-xs text-[11px] font-bold ${
                    d.is_online ? 'text-emerald-600' : 'text-neutral-400'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      d.is_online ? 'bg-emerald-500' : 'bg-neutral-300'
                    }`}
                  />
                  {d.is_online ? 'En ligne' : 'Hors ligne'}
                </span>
              </div>
              <p className="mt-xs text-xs text-neutral-500 capitalize">
                {d.vehicle_label ?? d.vehicle_category} · {d.rides_count} course
                {d.rides_count > 1 ? 's' : ''} ensemble
              </p>
              <p className="mt-xs text-xs font-semibold text-primary-600">
                Commander à ce chauffeur →
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
