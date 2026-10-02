import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { CalendarIcon, ClockIcon, PhoneIcon, PinIcon, UserIcon } from '@/components/Icon';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { RentalActions } from './RentalActions';

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

type Rental = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  block_from: string;
  hours: number;
  pickup_address: string;
  notes: string | null;
  client_first_name: string | null;
  client_phone: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  price_fcfa: number;
  driver_share_fcfa: number;
  km_included_per_day: number;
  fuel_by_client: boolean;
  odometer_start: number | null;
  odometer_end: number | null;
  km_used: number | null;
  is_upcoming: boolean;
  is_paid: boolean;
};

const RENTAL_STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Confirmée', cls: 'bg-violet-500/15 text-violet-700' },
  in_progress: { label: 'En cours', cls: 'bg-success/20 text-success' },
  completed: { label: 'Terminée', cls: 'bg-success/10 text-success' },
  cancelled: { label: 'Annulée', cls: 'bg-neutral-200 text-neutral-600' },
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
}

function RentalCard({ r }: { r: Rental }) {
  const st = RENTAL_STATUS[r.status] ?? { label: r.status, cls: 'bg-neutral-200 text-neutral-700' };
  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
      <div className="flex items-baseline justify-between gap-sm">
        <p className="flex items-center gap-xs text-sm font-bold text-neutral-900">
          <ClockIcon className="h-4 w-4 text-gold-500" />
          Location VIP · {r.hours} h
        </p>
        <p className="flex-none text-right">
          <span className="block text-sm font-extrabold text-primary-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmtFcfa(r.driver_share_fcfa)}
          </span>
          <span className="block text-[9px] text-neutral-500">FCFA pour vous</span>
        </p>
      </div>
      <p className="mt-xs flex items-center gap-xs text-xs font-semibold text-violet-700">
        <CalendarIcon className="h-3.5 w-3.5" />
        {fmtDate(r.starts_at)} → {fmtTime(r.ends_at)}
      </p>

      <div className="mt-sm flex items-start gap-xs">
        <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-primary-500 text-white">
          <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
        <p className="flex-1 text-xs text-neutral-800">{r.pickup_address}</p>
      </div>

      <div className="mt-sm flex flex-wrap items-center gap-x-md gap-y-xs text-[11px] text-neutral-600">
        <span className={`inline-flex rounded-full px-sm py-0.5 font-bold ${st.cls}`}>{st.label}</span>
        {r.client_first_name && (
          <span className="inline-flex items-center gap-xs font-semibold text-neutral-800">
            <UserIcon className="h-3 w-3 text-neutral-500" />
            {r.client_first_name}
          </span>
        )}
        <span className="ml-auto font-semibold text-neutral-800" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtFcfa(r.price_fcfa)} F total
        </span>
      </div>

      {r.contact_name && (
        <p className="mt-xs text-[11px] text-neutral-600">
          Contact sur place : {r.contact_name} {r.contact_phone ?? ''}
        </p>
      )}
      {r.notes && <p className="mt-xs text-[11px] italic text-neutral-500">{r.notes}</p>}

      {(r.status === 'confirmed' || r.status === 'in_progress') && (
        <ul className="mt-sm space-y-0.5 text-[11px] text-neutral-600">
          <li>
            Pas de demande de course dès {fmtTime(r.block_from)} jusqu&apos;à {fmtTime(r.ends_at)}.
          </li>
          <li>
            {r.km_included_per_day} km inclus
            {r.fuel_by_client ? ' · carburant payé par le client' : ''}.
          </li>
          <li className={r.is_paid ? '' : 'font-semibold text-warning'}>
            {r.is_paid
              ? 'Réglée à TamCar : votre part est créditée à la fin.'
              : 'En attente du règlement du client à TamCar : vous ne pouvez pas démarrer tant que ce n’est pas réglé.'}
          </li>
        </ul>
      )}

      {r.status === 'completed' && r.km_used != null && (
        <p className="mt-xs text-[11px] text-neutral-600">{r.km_used} km parcourus.</p>
      )}

      {r.client_phone && (
        <a
          href={`tel:${r.client_phone}`}
          className="mt-md flex w-full items-center justify-center gap-xs rounded-lg border-2 border-primary-500 py-sm text-xs font-bold text-primary-700"
        >
          <PhoneIcon className="h-3.5 w-3.5" />
          Appeler {r.client_first_name ?? 'le client'}
        </a>
      )}

      <RentalActions id={r.id} status={r.status} startsAt={r.starts_at} odometerStart={r.odometer_start} isPaid={r.is_paid} />
    </li>
  );
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
  const [{ data }, { data: rentalData }] = await Promise.all([
    supabase.rpc('driver_bookings', { p_scope: 'all' }),
    supabase.rpc('driver_my_vehicle_rentals', { p_scope: 'all' }),
  ]);
  const all = (Array.isArray(data) ? data : []) as Booking[];
  const upcoming = all.filter((b) => b.is_upcoming);
  const past = all.filter((b) => !b.is_upcoming);
  // Base pas encore à jour : la liste est simplement vide.
  const rentals = (Array.isArray(rentalData) ? rentalData : []) as Rental[];
  const rentalsUpcoming = rentals.filter((r) => r.is_upcoming);
  const rentalsPast = rentals.filter((r) => !r.is_upcoming);

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

        {rentalsUpcoming.length > 0 && (
          <section className="mt-lg">
            <h2 className="mb-sm text-xs font-bold uppercase tracking-wider text-violet-700">
              Locations VIP à venir ({rentalsUpcoming.length})
            </h2>
            <ul className="space-y-sm">
              {rentalsUpcoming.map((r) => (
                <RentalCard key={r.id} r={r} />
              ))}
            </ul>
          </section>
        )}

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

        {rentalsPast.length > 0 && (
          <section className="mt-xl">
            <h2 className="mb-sm text-xs font-bold uppercase tracking-wider text-neutral-500">
              Locations VIP passées ({rentalsPast.length})
            </h2>
            <ul className="space-y-sm">
              {rentalsPast.map((r) => (
                <RentalCard key={r.id} r={r} />
              ))}
            </ul>
          </section>
        )}

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
