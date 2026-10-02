import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { BottomTabBar } from '@/components/BottomTabBar';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { CalendarIcon, CheckIcon, PhoneIcon, PinIcon, UserIcon, VipCarIcon, WhatsAppIcon } from '@/components/Icon';
import { getCurrentUser } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { cancelRentalAction } from './actions';

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

type Rental = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  hours: number;
  pickup_address: string;
  notes: string | null;
  contact_name: string | null;
  price_fcfa: number;
  paid_fcfa: number;
  km_included_per_day: number;
  km_extra_fcfa: number;
  fuel_by_client: boolean;
  km_used: number | null;
  extra_km: number | null;
  extra_fcfa: number | null;
  km_status: string;
  extra_settled: boolean;
  driver_full_name: string | null;
  driver_phone: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  vehicle_plate: string | null;
  ride_id: string | null;
  late_cancel: boolean;
  is_upcoming: boolean;
};

const RENTAL_STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: 'À confirmer par TamCar', cls: 'bg-warning/15 text-warning' },
  confirmed: { label: 'Confirmée', cls: 'bg-violet-500/15 text-violet-700' },
  in_progress: { label: 'En cours', cls: 'bg-success/20 text-success' },
  completed: { label: 'Terminée', cls: 'bg-success/10 text-success' },
  cancelled: { label: 'Annulée', cls: 'bg-neutral-200 text-neutral-600' },
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function RentalCard({ r }: { r: Rental }) {
  const st = RENTAL_STATUS[r.status] ?? { label: r.status, cls: 'bg-neutral-200 text-neutral-700' };
  const canCancel =
    (r.status === 'requested' || r.status === 'confirmed') && new Date(r.starts_at).getTime() > Date.now();
  const vehicle = [r.vehicle_color, r.vehicle_brand, r.vehicle_model].filter(Boolean).join(' ');
  const wa = r.driver_phone ? r.driver_phone.replace(/^\+/, '').replace(/[^0-9]/g, '') : null;

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
      <div className="flex items-baseline justify-between gap-sm">
        <p className="flex items-center gap-xs text-sm font-bold text-neutral-900">
          <VipCarIcon className="h-4 w-4 text-gold-500" />
          Location VIP · {r.hours} h
        </p>
        <p className="flex-none text-sm font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtFcfa(r.price_fcfa)} F
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
        {r.contact_name && <span>Contact sur place : {r.contact_name}</span>}
        {r.late_cancel && <span className="font-semibold text-warning">Annulation tardive</span>}
      </div>

      {(r.status === 'confirmed' || r.status === 'in_progress') && r.driver_full_name && (
        <div className="mt-md rounded-lg bg-neutral-100 p-sm">
          <p className="flex items-center gap-xs text-sm font-bold text-neutral-900">
            <UserIcon className="h-4 w-4 text-neutral-500" />
            {r.driver_full_name.trim().split(/\s+/)[0]}
          </p>
          {vehicle && (
            <p className="mt-xs text-xs text-neutral-600">
              {vehicle}
              {r.vehicle_plate && (
                <span className="ml-xs rounded bg-neutral-900 px-xs py-0.5 text-[10px] font-bold text-white">
                  {r.vehicle_plate}
                </span>
              )}
            </p>
          )}
          {r.driver_phone && (
            <div className="mt-sm flex gap-xs">
              <a
                href={`tel:${r.driver_phone}`}
                className="flex flex-1 items-center justify-center gap-xs rounded-lg border-2 border-primary-500 bg-white py-xs text-xs font-bold text-primary-700"
              >
                <PhoneIcon className="h-3.5 w-3.5" />
                Appeler
              </a>
              {wa && (
                <a
                  href={`https://wa.me/${wa}?text=${encodeURIComponent('Bonjour, je suis votre client TamCar pour la location VIP.')}`}
                  target="_blank"
                  rel="noopener"
                  className="flex flex-1 items-center justify-center gap-xs rounded-lg bg-[#25D366] py-xs text-xs font-bold text-white"
                >
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {(r.status === 'requested' || r.status === 'confirmed' || r.status === 'in_progress') && (
        <p
          className={`mt-sm rounded-lg px-sm py-xs text-[11px] font-semibold ${
            r.paid_fcfa >= r.price_fcfa ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
          }`}
        >
          {r.paid_fcfa >= r.price_fcfa
            ? 'Location réglée.'
            : r.status === 'requested'
              ? 'Le règlement se fait à TamCar, d’avance, une fois la location confirmée.'
              : `À régler à TamCar avant le début : ${fmtFcfa(r.price_fcfa - r.paid_fcfa)} F (virement ou Mobile Money). L’équipe vous contacte.`}
        </p>
      )}

      {(r.status === 'requested' || r.status === 'confirmed') && (
        <p className="mt-sm text-[11px] text-neutral-500">
          {r.km_included_per_day} km inclus, au-delà {fmtFcfa(r.km_extra_fcfa)} F le km
          {r.fuel_by_client ? ' · carburant à votre charge' : ''}.
        </p>
      )}

      {r.status === 'completed' && r.km_used != null && (
        <p className="mt-sm text-[11px] text-neutral-600">
          {r.km_used} km parcourus
          {r.km_status === 'pending'
            ? ' · supplément éventuel en cours de vérification par TamCar.'
            : r.extra_km && r.extra_fcfa
              ? ` · ${r.extra_km} km au-delà du forfait : supplément de ${fmtFcfa(r.extra_fcfa)} F ${
                  r.extra_settled ? '(réglé)' : 'à régler à TamCar'
                }.`
              : ' · dans le forfait.'}
        </p>
      )}

      {r.status === 'completed' && r.ride_id && (
        <Link href={`/ride/${r.ride_id}`} className="mt-sm inline-block text-xs font-bold text-primary-700 underline">
          Voir le reçu et noter le chauffeur
        </Link>
      )}

      {canCancel && (
        <form action={cancelRentalAction} className="mt-md">
          <input type="hidden" name="id" value={r.id} />
          <ConfirmSubmit
            message="Annuler cette location ?"
            pendingLabel="Annulation…"
            className="w-full rounded-lg border border-neutral-300 py-xs text-xs font-bold text-neutral-700 hover:bg-neutral-100"
          >
            Annuler la location
          </ConfirmSubmit>
        </form>
      )}
    </li>
  );
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams?: { rental?: string; rental_error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = createServerSupabase();
  const [{ data }, { data: rentalData }] = await Promise.all([
    supabase.rpc('my_bookings', { p_scope: 'all' }),
    supabase.rpc('my_vehicle_rentals', { p_scope: 'all' }),
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

        {searchParams?.rental === 'requested' && (
          <p role="status" className="mt-md rounded-lg bg-success/10 px-md py-sm text-sm font-semibold text-success">
            Demande envoyée. L&apos;équipe TamCar la confirme et vous présente votre chauffeur.
          </p>
        )}
        {searchParams?.rental === 'cancelled' && (
          <p role="status" className="mt-md rounded-lg bg-neutral-100 px-md py-sm text-sm font-semibold text-neutral-700">
            Location annulée.
          </p>
        )}
        {searchParams?.rental_error && (
          <p role="alert" className="mt-md rounded-lg bg-error/10 px-md py-sm text-sm font-semibold text-error">
            {searchParams.rental_error}
          </p>
        )}

        <Link
          href="/location"
          className="mt-lg flex items-center justify-between rounded-xl bg-neutral-900 p-md text-white shadow-md transition hover:brightness-110"
        >
          <span className="flex items-center gap-xs text-sm font-bold">
            <VipCarIcon className="h-5 w-5 text-gold-500" />
            Louer un VIP avec chauffeur →
          </span>
          <span className="text-[11px] font-semibold text-white/70">À l&apos;heure</span>
        </Link>

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

        <BottomTabBar />
      </div>
    </main>
  );
}
