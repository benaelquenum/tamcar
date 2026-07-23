import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { acceptOfferAction } from './actions';

type OfferRow = {
  subscription_id: string;
  origin_address: string;
  dropoff_address: string;
  category: string;
  days_count: number;
  slot_out: string | null;
  slot_return: string | null;
  rides_total: number;
  weeks: number;
  driver_estimate_fcfa: number;
  distance_from_driver_km: number | null;
  searching_until: string;
};

type PlanningRow = {
  subscription_ride_id: string;
  travel_date: string;
  slot_time: string;
  direction: string;
  status: string;
  client_first_name: string;
  from_address: string;
  to_address: string;
  category: string;
  is_final: boolean;
  ride_id: string | null;
};

function beninDate(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Porto-Novo',
  }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

function fmtTime(t: string): string {
  return t.slice(0, 5).replace(':', 'h');
}

function PlanningList({ rows, empty }: { rows: PlanningRow[]; empty: string }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-neutral-50 p-lg text-sm text-neutral-500">
        {empty}
      </p>
    );
  }
  return (
    <div className="space-y-sm">
      {rows.map((r) => (
        <div
          key={r.subscription_ride_id}
          className="rounded-xl border border-neutral-200 bg-white p-md"
        >
          <div className="flex items-center justify-between">
            <p className="text-base font-extrabold text-neutral-900">
              {fmtTime(r.slot_time)}
              <span className="ml-sm text-xs font-semibold uppercase text-neutral-400">
                {r.direction}
              </span>
            </p>
            <span
              className={`rounded-full px-md py-xs text-[11px] font-bold ${
                r.is_final
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-primary-50 text-primary-700'
              }`}
            >
              {r.is_final ? 'Confirmé pour vous' : 'Votre abonné'}
            </span>
          </div>
          <p className="mt-xs text-sm text-neutral-700">
            {r.client_first_name} · {r.from_address}
          </p>
          <p className="text-xs text-neutral-500">→ {r.to_address}</p>
          {r.ride_id && r.is_final && (
            <Link
              href={`/ride/${r.ride_id}`}
              className="mt-sm inline-block text-xs font-bold text-primary-600 underline"
            >
              Voir la course
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

export default async function DriverTamPassPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const supabase = createServerSupabase();

  const [{ data: offers }, { data: today }, { data: tomorrow }] =
    await Promise.all([
      supabase.rpc('tampass_open_offers'),
      supabase.rpc('tampass_driver_planning', { p_date: beninDate(0) }),
      supabase.rpc('tampass_driver_planning', { p_date: beninDate(1) }),
    ]);

  const offerRows = (offers as OfferRow[]) ?? [];

  return (
    <main className="mx-auto max-w-md px-lg py-xl">
      <header>
        <Link href="/" className="text-xs font-semibold text-primary-600">
          ← Accueil
        </Link>
        <h1 className="mt-sm text-xl font-extrabold text-neutral-900">
          TamPass
        </h1>
        <p className="text-sm text-neutral-500">
          Vos abonnés et trajets récurrents. Soyez en position 15 min avant le
          créneau — le trajet vous est prioritaire.
        </p>
      </header>

      {searchParams.ok && (
        <div className="mt-md rounded-md bg-emerald-50 p-md text-sm font-medium text-emerald-700">
          {searchParams.ok}
        </div>
      )}
      {searchParams.error && (
        <div className="mt-md rounded-md bg-error/10 p-md text-sm font-medium text-error">
          {searchParams.error}
        </div>
      )}

      {/* Offres ouvertes — revenu récurrent à saisir */}
      {offerRows.length > 0 && (
        <section className="mt-xl">
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary-600">
            Offres disponibles — premier arrivé, premier servi
          </h2>
          <div className="mt-md space-y-sm">
            {offerRows.map((o) => (
              <div
                key={o.subscription_id}
                className="rounded-xl border-2 border-primary-200 bg-primary-50 p-md"
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-extrabold text-primary-700">
                    ~{o.driver_estimate_fcfa.toLocaleString('fr-FR')} FCFA
                  </p>
                  <span className="text-[11px] font-bold uppercase text-neutral-500">
                    {o.category} · {o.weeks} sem.
                  </span>
                </div>
                <p className="mt-xs text-sm text-neutral-800">
                  {o.origin_address} → {o.dropoff_address}
                </p>
                <p className="text-xs text-neutral-500">
                  {o.rides_total} trajets · {o.days_count} j/sem
                  {o.slot_out ? ` · aller ${fmtTime(o.slot_out)}` : ''}
                  {o.slot_return ? ` · retour ${fmtTime(o.slot_return)}` : ''}
                  {o.distance_from_driver_km != null
                    ? ` · à ${o.distance_from_driver_km} km`
                    : ''}
                </p>
                <form action={acceptOfferAction} className="mt-md">
                  <input
                    type="hidden"
                    name="subscription_id"
                    value={o.subscription_id}
                  />
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
                  >
                    Devenir le chauffeur attitré
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-xl">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
          Aujourd&apos;hui
        </h2>
        <div className="mt-md">
          <PlanningList
            rows={(today as PlanningRow[]) ?? []}
            empty="Aucun trajet TamPass aujourd'hui."
          />
        </div>
      </section>

      <section className="mt-xl">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
          Demain
        </h2>
        <div className="mt-md">
          <PlanningList
            rows={(tomorrow as PlanningRow[]) ?? []}
            empty="Aucun trajet TamPass demain (génération chaque soir à 20h)."
          />
        </div>
      </section>
    </main>
  );
}
