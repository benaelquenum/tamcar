import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';

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

export default async function DriverTamPassPage() {
  const supabase = createServerSupabase();

  const [{ data: today }, { data: tomorrow }] = await Promise.all([
    supabase.rpc('tampass_driver_planning', { p_date: beninDate(0) }),
    supabase.rpc('tampass_driver_planning', { p_date: beninDate(1) }),
  ]);

  return (
    <main className="mx-auto max-w-md px-lg py-xl">
      <header>
        <Link href="/" className="text-xs font-semibold text-primary-600">
          ← Accueil
        </Link>
        <h1 className="mt-sm text-xl font-extrabold text-neutral-900">
          Planning TamPass
        </h1>
        <p className="text-sm text-neutral-500">
          Vos abonnés et trajets récurrents. Soyez en position 15 min avant le
          créneau — le trajet vous est prioritaire.
        </p>
      </header>

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
