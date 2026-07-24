import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { AutoRefresh } from '@/components/AutoRefresh';
import { cancelOneshotAction } from './actions';

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

type PendingReq = {
  request_id: string;
  driver_name: string;
  pickup_address: string;
  dropoff_address: string;
  price_total_fcfa: number;
  status: string;
  expires_at: string;
  ride_id: string | null;
};

function fmtFcfa(n: number): string {
  return n.toLocaleString('fr-FR');
}

export default async function ChauffeursPage() {
  const supabase = createServerSupabase();

  const [{ data: drivers }, { data: pendingRows }] = await Promise.all([
    supabase.rpc('my_recent_drivers', { p_limit: 20 }),
    supabase.rpc('my_pending_oneshot'),
  ]);

  const recent = (drivers as RecentDriver[]) ?? [];
  const req = ((pendingRows as PendingReq[]) ?? [])[0] ?? null;

  return (
    <main className="mx-auto max-w-md px-lg py-xl">
      <AutoRefresh active={req?.status === 'pending'} />
      <Link
        href="/"
        className="mb-md inline-flex items-center gap-xs text-xs font-semibold text-primary-600"
      >
        ← Accueil
      </Link>
      <h1 className="text-xl font-extrabold text-neutral-900">Mes chauffeurs</h1>
      <p className="text-sm text-neutral-500">
        Recontacte un chauffeur que tu as déjà eu et demande-lui une course.
      </p>

      {/* État de la demande en cours */}
      {req && req.status === 'pending' && (
        <section className="mt-lg rounded-2xl border-2 border-primary-200 bg-primary-50 p-lg">
          <p className="text-sm font-bold text-neutral-900">
            Demande envoyée à {req.driver_name}…
          </p>
          <p className="mt-xs text-xs text-neutral-600">
            {req.pickup_address} → {req.dropoff_address} · {fmtFcfa(req.price_total_fcfa)} FCFA
          </p>
          <p className="mt-xs text-xs text-neutral-500">
            En attente de sa réponse (10 min max). Tu seras notifié.
          </p>
          <form action={cancelOneshotAction} className="mt-md">
            <input type="hidden" name="request_id" value={req.request_id} />
            <button
              type="submit"
              className="w-full rounded-xl border-2 border-neutral-300 bg-white py-md text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
            >
              Annuler la demande
            </button>
          </form>
        </section>
      )}

      {req && req.status === 'accepted' && req.ride_id && (
        <section className="mt-lg rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-lg">
          <p className="text-sm font-bold text-emerald-700">
            {req.driver_name} a accepté ta course !
          </p>
          <Link
            href={`/ride/${req.ride_id}`}
            className="mt-md flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow"
          >
            Suivre ma course
          </Link>
        </section>
      )}

      {req && (req.status === 'declined' || req.status === 'expired') && (
        <section className="mt-lg rounded-xl bg-amber-50 p-lg">
          <p className="text-sm font-semibold text-amber-800">
            {req.status === 'declined'
              ? `${req.driver_name} n'est pas disponible.`
              : 'Ta demande a expiré sans réponse.'}
          </p>
          <p className="mt-xs text-xs text-amber-700">
            Essaie un autre chauffeur ci-dessous, ou commande une course classique.
          </p>
        </section>
      )}

      {/* Liste des chauffeurs récents */}
      <section className="mt-xl">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
          Chauffeurs déjà eus
        </h2>
        <div className="mt-md space-y-sm">
          {recent.length === 0 && (
            <p className="rounded-xl bg-neutral-50 p-lg text-sm text-neutral-500">
              Tu n&apos;as pas encore de course terminée. Après ta première
              course, tes chauffeurs apparaîtront ici.
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
                Demander une course →
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
