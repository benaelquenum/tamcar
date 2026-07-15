'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { CarIcon, PinIcon } from '@/components/Icon';
import { Map, type DriverPin } from '@/components/Map';
import { supabaseBrowser } from '@/lib/supabase-browser';

type RideStatus =
  | 'requested'
  | 'matched'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled_by_client'
  | 'cancelled_by_driver'
  | 'expired';

export type RideForView = {
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
  status: RideStatus;
  payment_method: string | null;
  requested_at: string;
};

const STATUS_META: Record<
  RideStatus,
  { title: string; sub: string; color: string; showRebound: boolean }
> = {
  requested: {
    title: 'Recherche d\'un chauffeur',
    sub: 'On cherche un chauffeur près de toi…',
    color: 'bg-primary-500',
    showRebound: false,
  },
  matched: {
    title: 'Chauffeur en route',
    sub: 'Ton chauffeur arrive.',
    color: 'bg-primary-500',
    showRebound: true,
  },
  arrived: {
    title: 'Chauffeur arrivé',
    sub: 'Rejoins-le au point de départ.',
    color: 'bg-gold',
    showRebound: false,
  },
  in_progress: {
    title: 'Course en cours',
    sub: 'Bon voyage !',
    color: 'bg-success',
    showRebound: false,
  },
  completed: {
    title: 'Course terminée',
    sub: 'Merci d\'avoir roulé TamCar.',
    color: 'bg-success',
    showRebound: false,
  },
  cancelled_by_client: {
    title: 'Course annulée',
    sub: 'Tu as annulé cette course.',
    color: 'bg-neutral-600',
    showRebound: false,
  },
  cancelled_by_driver: {
    title: 'Annulée par le chauffeur',
    sub: '',
    color: 'bg-neutral-600',
    showRebound: false,
  },
  expired: {
    title: 'Aucun chauffeur trouvé',
    sub: 'Réessaie dans un moment.',
    color: 'bg-error',
    showRebound: false,
  },
};

function formatFcfa(n: number | undefined | null): string {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
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

export function RideView({ initialRide }: { initialRide: RideForView }) {
  const [ride, setRide] = useState<RideForView>(initialRide);
  const [nearbyDrivers, setNearbyDrivers] = useState<DriverPin[]>([]);
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const meta = STATUS_META[ride.status];
  const isWaiting = ride.status === 'requested';
  const isActive = ['requested', 'matched', 'arrived', 'in_progress'].includes(ride.status);

  // Polling des chauffeurs proches (5s) tant que ride active
  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;

    async function pollDrivers() {
      const { data, error } = await supabaseBrowser.rpc('nearby_drivers_for_map', {
        pickup_lat: ride.pickup_lat,
        pickup_lng: ride.pickup_lng,
        radius_km: 5.0,
      });
      if (cancelled) return;
      if (error) {
        // eslint-disable-next-line no-console
        console.error('nearby_drivers_for_map error:', error.message);
        return;
      }
      setNearbyDrivers(
        (data as Array<{ driver_id: string; lat: number; lng: number }> | null)?.map((d) => ({
          driver_id: d.driver_id,
          lat: d.lat,
          lng: d.lng,
        })) ?? [],
      );
    }

    pollDrivers();
    const interval = setInterval(pollDrivers, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isActive, ride.pickup_lat, ride.pickup_lng]);

  // Realtime : écoute changements sur la ride pour refléter matching / statut
  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`ride:${ride.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${ride.id}` },
        (payload) => {
          const next = payload.new as Partial<RideForView>;
          setRide((prev) => ({ ...prev, ...next }));
        },
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [ride.id]);

  const pickupCoord = useMemo<[number, number]>(
    () => [ride.pickup_lng, ride.pickup_lat],
    [ride.pickup_lat, ride.pickup_lng],
  );
  const dropoffCoord = useMemo<[number, number]>(
    () => [ride.dropoff_lng, ride.dropoff_lat],
    [ride.dropoff_lat, ride.dropoff_lng],
  );

  return (
    <main className="fixed inset-0 overflow-hidden bg-white">
      {/* Carte plein écran */}
      <div className="absolute inset-0">
        <Map
          pickup={pickupCoord}
          dropoff={dropoffCoord}
          driversNearby={isWaiting ? nearbyDrivers : []}
          className="h-full w-full"
        />
      </div>

      {/* Header overlay compact */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-lg">
        <Link
          href="/"
          aria-label="Retour"
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-lg ring-1 ring-neutral-200"
        >
          <span className="text-xl leading-none">←</span>
        </Link>
        <div className="pointer-events-auto flex items-center gap-xs rounded-full bg-white/95 px-md py-xs shadow-lg ring-1 ring-neutral-200 backdrop-blur">
          <Logo className="h-5 w-auto" />
        </div>
      </header>

      {/* Bottom sheet */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="mx-auto max-w-md rounded-t-2xl bg-white shadow-2xl ring-1 ring-neutral-200">
          {/* Handle drag */}
          <button
            type="button"
            onClick={() => setSheetExpanded((v) => !v)}
            aria-label={sheetExpanded ? 'Réduire' : 'Étendre'}
            className="flex w-full items-center justify-center pt-md pb-xs"
          >
            <span className="h-1.5 w-10 rounded-full bg-neutral-200" />
          </button>

          {/* Badge statut */}
          <div className={`mx-lg mt-xs mb-md rounded-xl ${meta.color} p-md text-white shadow-md`}>
            <div className="flex items-center gap-md">
              {isWaiting && (
                <span className="relative grid h-3 w-3 flex-none place-items-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
                </span>
              )}
              <div className="flex-1">
                <p className="text-lg font-extrabold leading-tight">{meta.title}</p>
                {meta.sub && <p className="text-xs text-white/90">{meta.sub}</p>}
              </div>
              {isWaiting && (
                <span
                  className="text-sm font-bold"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {nearbyDrivers.length} 🚗
                </span>
              )}
            </div>
          </div>

          {/* Zone infos chauffeur (visible après matching) */}
          {ride.driver_id && (
            <div className="mx-lg mb-md flex items-center gap-md rounded-xl bg-neutral-100 p-md">
              <div className="grid h-12 w-12 flex-none place-items-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white">
                <CarIcon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-neutral-900">Chauffeur assigné</p>
                <p className="text-xs text-neutral-600">Détails à venir</p>
              </div>
              {meta.showRebound && (
                <div className="text-right">
                  <p
                    className="text-xs font-bold text-neutral-900"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    — min
                  </p>
                  <p className="text-[10px] text-neutral-500">à l'arrivée</p>
                </div>
              )}
            </div>
          )}

          {/* Contenu extensible : trajet + prix */}
          <div className={`overflow-hidden transition-all ${sheetExpanded ? 'max-h-96' : 'max-h-0'}`}>
            <div className="space-y-md px-lg pb-md">
              <div className="rounded-xl bg-neutral-100 p-md">
                <div className="flex items-start gap-md">
                  <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-primary-500 text-white">
                    <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  <p className="flex-1 text-xs text-neutral-900">{ride.pickup_address}</p>
                </div>
                <div className="ml-1.5 h-4 border-l-2 border-dashed border-neutral-300" />
                <div className="flex items-start gap-md">
                  <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-violet-500 text-white">
                    <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  <p className="flex-1 text-xs text-neutral-900">{ride.dropoff_address}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-sm text-center">
                <Mini label="Distance" value={ride.distance_km ? `${ride.distance_km.toFixed(1)} km` : '—'} />
                <Mini label="Durée" value={ride.duration_min ? `${ride.duration_min} min` : '—'} />
                <Mini label="Paiement" value={paymentLabel(ride.payment_method)} />
              </div>
            </div>
          </div>

          {/* Prix + actions */}
          <div className="border-t border-neutral-100 px-lg py-md">
            <div className="mb-md flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                Total
              </span>
              <span
                className="text-2xl font-extrabold text-neutral-900"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatFcfa(ride.price_total_fcfa)}
                <span className="ml-xs text-xs font-medium text-neutral-600">FCFA</span>
              </span>
            </div>

            {isWaiting && (
              <button
                type="button"
                className="w-full rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-600 transition hover:border-error hover:text-error"
              >
                Annuler la course
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-sm ring-1 ring-neutral-200">
      <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p
        className="mt-xs text-xs font-extrabold text-neutral-900"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
    </div>
  );
}
