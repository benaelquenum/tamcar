import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { CalendarIcon, PhoneIcon, PinIcon, UserIcon } from '@/components/Icon';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';

type Booking = {
  id: string;
  status: string;
  scheduled_at: string;
  pickup_address: string;
  dropoff_address: string;
  price_total_fcfa: number;
  driver_share_fcfa: number;
  requested_category: string | null;
  client_first_name: string | null;
  client_phone: string | null;
  is_upcoming: boolean;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Engagé', cls: 'bg-violet-500/15 text-violet-700' },
  requested: { label: 'Repartie au pool', cls: 'bg-neutral-200 text-neutral-700' },
  matched: { label: 'En route', cls: 'bg-primary-500 text-white' },
  arrived: { label: 'Sur place', cls: 'bg-gold text-neutral-900' },
  in_progress: { label: 'En cours', cls: 'bg-success/20 text-success' },
  completed: { label: 'Terminée', cls: 'bg-success/10 text-success' },
  cancelled_by_client: { label: 'Annulée par le client', cls: 'bg-neutral-200 text-neutral-600' },
  cancelled_by_driver: { label: 'Vous avez annulé', cls: 'bg-neutral-200 text-neutral-600' },
  cancelled_by_admin: { label: 'Annulée par TamCar', cls: 'bg-neutral-200 text-neutral-600' },
  expired: { label: 'Expirée', cls: 'bg-error/10 text-error' },
};

const CAT_LABEL: Record<string, string> = {
  moto: 'Moto',
  tricycle: 'Tricycle',
  essentiel: 'Essentiel',
  confort: 'Confort',
  premium: 'VIP',
};

function fmtFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BookingCard({ b }: { b: Booking }) {
  const st = STATUS_LABEL[b.status] ?? { label: b.status, cls: 'bg-neutral-200 text-neutral-700' };
  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
      <Link href={`/ride/${b.id}`} className="block">
        <div className="flex items-baseline justify-between gap-sm">
          <p className="flex items-center gap-xs text-sm font-bold text-violet-700">
            <CalendarIcon className="h-4 w-4" />
            {fmtDate(b.scheduled_at)}
          </p>
          <p className="flex-none text-right">
            <span
              className="block text-sm font-extrabold text-primary-500"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fmtFcfa(b.driver_share_fcfa)}
            </span>
            <span className="block text-[9px] text-neutral-500">FCFA pour vous</span>
          </p>
        </div>

        <div className="mt-sm space-y-xs">
          <div className="flex items-start gap-xs">
            <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-primary-500 text-white">
              <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <p className="flex-1 text-xs text-neutral-800">{b.pickup_address}</p>
          </div>
          <div className="ml-1.5 h-3 border-l-2 border-dashed border-neutral-300" />
          <div className="flex items-start gap-xs">
            <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-violet-500 text-white">
              <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <p className="flex-1 text-xs text-neutral-800">{b.dropoff_address}</p>
          </div>
        </div>

        <div className="mt-sm flex flex-wrap items-center gap-x-md gap-y-xs text-[11px] text-neutral-600">
          <span className={`inline-flex rounded-full px-sm py-0.5 font-bold ${st.cls}`}>
            {st.label}
          </span>
          {b.requested_category && (
            <span className="font-semibold uppercase tracking-wider text-neutral-500">
              {CAT_LABEL[b.requested_category] ?? b.requested_category}
            </span>
          )}
          {b.client_first_name && (
            <span className="inline-flex items-center gap-xs font-semibold text-neutral-800">
              <UserIcon className="h-3 w-3 text-neutral-500" />
              {b.client_first_name}
            </span>
          )}
          <span
            className="ml-auto font-semibold text-neutral-800"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtFcfa(b.price_total_fcfa)} F total
          </span>
        </div>
      </Link>

      {/* Le numéro n'est fourni que tant que la course n'est pas soldée. */}
      {b.client_phone && (
        <a
          href={`tel:${b.client_phone}`}
          className="mt-md flex w-full items-center justify-center gap-xs rounded-lg border-2 border-primary-500 py-sm text-xs font-bold text-primary-700"
        >
          <PhoneIcon className="h-3.5 w-3.5" />
          Appeler {b.client_first_name ?? 'le client'}
        </a>
      )}
    </li>
  );
}

export default async function DriverBookingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'driver' && profile.role !== 'admin') redirect('/');

  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('driver_bookings', { p_scope: 'all' });
  const all = (Array.isArray(data) ? data : []) as Booking[];
  const upcoming = all.filter((b) => b.is_upcoming);
  const past = all.filter((b) => !b.is_upcoming);

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="mx-auto max-w-md px-lg py-lg">
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

        <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">Mes réservations</h1>
        <p className="mt-xs text-sm text-neutral-600">
          Les courses programmées sur lesquelles vous vous êtes engagé.
        </p>

        <section className="mt-lg">
          <h2 className="mb-sm text-xs font-bold uppercase tracking-wider text-violet-700">
            À venir ({upcoming.length})
          </h2>
          {upcoming.length === 0 ? (
            <div className="rounded-xl bg-neutral-100 p-lg text-center text-sm text-neutral-600">
              Aucune réservation engagée. Les réservations disponibles
              apparaissent dans votre fil de courses.
            </div>
          ) : (
            <ul className="space-y-sm">
              {upcoming.map((b) => (
                <BookingCard key={b.id} b={b} />
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 && (
          <section className="mt-xl">
            <h2 className="mb-sm text-xs font-bold uppercase tracking-wider text-neutral-500">
              Passées ({past.length})
            </h2>
            <ul className="space-y-sm">
              {past.map((b) => (
                <BookingCard key={b.id} b={b} />
              ))}
            </ul>
          </section>
        )}

        <div className="h-2xl" />
      </div>
    </main>
  );
}
