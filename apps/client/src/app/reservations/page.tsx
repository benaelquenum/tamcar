import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { BottomTabBar } from '@/components/BottomTabBar';
import { CalendarIcon, CheckIcon, PinIcon, UserIcon } from '@/components/Icon';
import { getCurrentUser } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';

type Booking = {
  id: string;
  status: string;
  scheduled_at: string;
  pickup_address: string;
  dropoff_address: string;
  price_total_fcfa: number;
  requested_category: string | null;
  payment_method: string | null;
  driver_full_name: string | null;
  driver_phone: string | null;
  driver_confirmed: boolean;
  is_upcoming: boolean;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Réservée', cls: 'bg-violet-500/15 text-violet-700' },
  requested: { label: 'Recherche de chauffeur', cls: 'bg-primary-100 text-primary-700' },
  matched: { label: 'Chauffeur en route', cls: 'bg-primary-500 text-white' },
  arrived: { label: 'Chauffeur arrivé', cls: 'bg-gold text-neutral-900' },
  in_progress: { label: 'En cours', cls: 'bg-success/20 text-success' },
  completed: { label: 'Terminée', cls: 'bg-success/10 text-success' },
  cancelled_by_client: { label: 'Annulée par vous', cls: 'bg-neutral-200 text-neutral-600' },
  cancelled_by_driver: { label: 'Annulée par le chauffeur', cls: 'bg-neutral-200 text-neutral-600' },
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

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Espèces',
  mobile_money_mtn: 'MTN MoMo',
  mobile_money_moov: 'Moov Money',
  tamcar_credit: 'TamCar Crédit',
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

/**
 * Une réservation encore en recherche renvoie vers l'écran de décision ;
 * dès qu'elle a un chauffeur ou qu'elle est soldée, c'est la fiche de
 * course qui porte toutes les informations.
 */
function hrefFor(b: Booking): string {
  if (b.status === 'scheduled' && !b.driver_confirmed) return `/reservation/${b.id}`;
  return `/ride/${b.id}`;
}

function BookingCard({ b }: { b: Booking }) {
  const st = STATUS_LABEL[b.status] ?? { label: b.status, cls: 'bg-neutral-200 text-neutral-700' };
  return (
    <li>
      <Link
        href={hrefFor(b)}
        className="block rounded-xl border border-neutral-200 bg-white p-md shadow-sm transition hover:border-primary-300 hover:shadow-md"
      >
        <div className="flex items-baseline justify-between gap-sm">
          <p className="flex items-center gap-xs text-sm font-bold text-violet-700">
            <CalendarIcon className="h-4 w-4" />
            {fmtDate(b.scheduled_at)}
          </p>
          <p
            className="flex-none text-sm font-extrabold text-neutral-900"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtFcfa(b.price_total_fcfa)} F
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
          {b.payment_method && (
            <span>{PAYMENT_LABEL[b.payment_method] ?? b.payment_method}</span>
          )}
          {b.driver_confirmed && b.driver_full_name && (
            <span className="ml-auto inline-flex items-center gap-xs font-semibold text-primary-700">
              <CheckIcon className="h-3 w-3" strokeWidth={3} />
              {b.driver_full_name.trim().split(/\s+/)[0]}
            </span>
          )}
          {!b.driver_confirmed && b.is_upcoming && (
            <span className="ml-auto inline-flex items-center gap-xs font-semibold text-neutral-500">
              <UserIcon className="h-3 w-3" />
              Chauffeur en recherche
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

export default async function ReservationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('my_bookings', { p_scope: 'all' });
  const all = (Array.isArray(data) ? data : []) as Booking[];
  const upcoming = all.filter((b) => b.is_upcoming);
  const past = all.filter((b) => !b.is_upcoming);

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href="/history"
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
        </header>

        <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">Mes réservations</h1>
        <p className="mt-xs text-sm text-neutral-600">
          Vos courses programmées, à venir comme passées.
        </p>

        <section className="mt-lg">
          <h2 className="mb-sm text-xs font-bold uppercase tracking-wider text-violet-700">
            À venir ({upcoming.length})
          </h2>
          {upcoming.length === 0 ? (
            <div className="rounded-xl bg-neutral-100 p-lg text-center text-sm text-neutral-600">
              Aucune réservation à venir.{' '}
              <Link href="/commande?scheduled=1" className="font-semibold text-primary-700 underline">
                En programmer une
              </Link>
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

        <BottomTabBar />
      </div>
    </main>
  );
}
