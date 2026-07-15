import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ArrowRightIcon, CarIcon, PinIcon } from '@/components/Icon';
import { getCurrentUser } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';

type RideStatus =
  | 'requested'
  | 'matched'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled_by_client'
  | 'cancelled_by_driver'
  | 'expired';

type RideRow = {
  id: string;
  client_id: string;
  driver_id: string | null;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number | null;
  duration_min: number | null;
  price_total_fcfa: number;
  driver_share_fcfa: number;
  driver_rachat_fcfa: number;
  dealer_share_fcfa: number;
  platform_share_fcfa: number;
  status: RideStatus;
  payment_method: string | null;
  scheduled_at: string | null;
  requested_at: string;
  matched_at: string | null;
};

const STATUS_LABEL: Record<RideStatus, { label: string; sub: string; color: string }> = {
  requested: {
    label: 'Recherche d\'un chauffeur…',
    sub: 'Un chauffeur va être notifié dans un instant.',
    color: 'bg-primary-500 text-white',
  },
  matched: {
    label: 'Chauffeur en route',
    sub: 'Ton chauffeur arrive au point de départ.',
    color: 'bg-primary-500 text-white',
  },
  arrived: {
    label: 'Chauffeur arrivé',
    sub: 'Rejoins ton chauffeur au point de départ.',
    color: 'bg-gold text-neutral-900',
  },
  in_progress: {
    label: 'Course en cours',
    sub: 'Bon voyage !',
    color: 'bg-success text-white',
  },
  completed: {
    label: 'Course terminée',
    sub: 'Merci d\'avoir roulé avec TamCar.',
    color: 'bg-success text-white',
  },
  cancelled_by_client: {
    label: 'Course annulée',
    sub: 'Tu as annulé cette course.',
    color: 'bg-neutral-400 text-white',
  },
  cancelled_by_driver: {
    label: 'Course annulée par le chauffeur',
    sub: 'Le chauffeur a dû annuler.',
    color: 'bg-neutral-400 text-white',
  },
  expired: {
    label: 'Aucun chauffeur trouvé',
    sub: 'Aucun chauffeur n\'était disponible. Réessaie dans un moment.',
    color: 'bg-error text-white',
  },
};

function formatFcfa(n: number | undefined | null): string {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export default async function RideDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('rides_view')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !data) notFound();
  const ride = data as RideRow;

  const meta = STATUS_LABEL[ride.status];

  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-64 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-70 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href="/"
            aria-label="Retour à l'accueil"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
        </header>

        {/* Badge statut */}
        <div className={`mt-lg rounded-xl ${meta.color} p-lg shadow-glow`}>
          <p className="text-xs font-bold uppercase tracking-wider opacity-80">Statut</p>
          <h1 className="mt-xs text-2xl font-extrabold leading-tight">
            {meta.label}
          </h1>
          <p className="mt-xs text-sm opacity-90">{meta.sub}</p>
          {ride.status === 'requested' && (
            <div className="mt-md flex items-center gap-xs">
              <span className="relative grid h-2 w-2 place-items-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              <span className="text-xs opacity-90">En attente de matching…</span>
            </div>
          )}
        </div>

        {/* Trajet */}
        <section className="mt-lg space-y-md rounded-xl bg-white p-lg shadow-sm ring-1 ring-neutral-200">
          <div className="flex items-start gap-md">
            <span className="mt-xs grid h-6 w-6 flex-none place-items-center rounded-full bg-primary-500 text-white">
              <PinIcon className="h-3 w-3" strokeWidth={3} />
            </span>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Départ</p>
              <p className="mt-xs text-sm font-semibold text-neutral-900">{ride.pickup_address}</p>
            </div>
          </div>
          <div className="ml-3 h-6 border-l-2 border-dashed border-neutral-300" />
          <div className="flex items-start gap-md">
            <span className="mt-xs grid h-6 w-6 flex-none place-items-center rounded-full bg-violet-500 text-white">
              <PinIcon className="h-3 w-3" strokeWidth={3} />
            </span>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Destination</p>
              <p className="mt-xs text-sm font-semibold text-neutral-900">{ride.dropoff_address}</p>
            </div>
          </div>
        </section>

        {/* Métriques */}
        <section className="mt-lg grid grid-cols-3 gap-sm">
          <Metric label="Distance" value={ride.distance_km ? `${ride.distance_km.toFixed(1)} km` : '—'} />
          <Metric label="Durée" value={ride.duration_min ? `~${ride.duration_min} min` : '—'} />
          <Metric label="Paiement" value={paymentLabel(ride.payment_method)} />
        </section>

        {/* Prix */}
        <section className="mt-lg rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 p-lg text-white shadow-glow">
          <p className="text-xs font-bold uppercase tracking-wider text-white/80">Total à payer</p>
          <p
            className="mt-xs text-4xl font-extrabold"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatFcfa(ride.price_total_fcfa)}
            <span className="ml-xs text-lg text-white/70">FCFA</span>
          </p>
        </section>

        {/* Info debug — à supprimer en prod, utile en dev */}
        <details className="mt-lg rounded-xl bg-neutral-100 p-md text-xs text-neutral-600">
          <summary className="cursor-pointer font-semibold text-neutral-900">
            Détails techniques (debug)
          </summary>
          <dl className="mt-md grid grid-cols-2 gap-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <dt>Ride ID</dt><dd className="font-mono">{ride.id.slice(0, 8)}…</dd>
            <dt>Chauffeur</dt><dd className="font-mono">{ride.driver_share_fcfa.toLocaleString('fr-FR').replace(/,/g, ' ')} F cash + {ride.driver_rachat_fcfa.toLocaleString('fr-FR').replace(/,/g, ' ')} F rachat</dd>
            <dt>Concessionnaire</dt><dd className="font-mono">{ride.dealer_share_fcfa.toLocaleString('fr-FR').replace(/,/g, ' ')} F</dd>
            <dt>Plateforme</dt><dd className="font-mono">{ride.platform_share_fcfa.toLocaleString('fr-FR').replace(/,/g, ' ')} F</dd>
            <dt>Requested</dt><dd>{new Date(ride.requested_at).toLocaleString('fr-FR')}</dd>
          </dl>
        </details>

        {ride.status === 'requested' && (
          <Link
            href="/"
            className="mt-lg block rounded-md border-2 border-neutral-200 py-md text-center text-sm font-semibold text-neutral-600 hover:border-error hover:text-error"
          >
            Annuler la course
          </Link>
        )}

        <div className="h-2xl" />
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-md text-center shadow-sm ring-1 ring-neutral-200">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p
        className="mt-xs text-sm font-extrabold text-neutral-900"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
    </div>
  );
}

function paymentLabel(method: string | null): string {
  switch (method) {
    case 'cash': return 'Espèces';
    case 'tamcar_credit': return 'TamCar Crédit';
    case 'mobile_money_mtn': return 'MTN Money';
    case 'mobile_money_moov': return 'Moov Money';
    default: return '—';
  }
}
