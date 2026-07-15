'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { CarIcon, CheckIcon, PinIcon, StarIcon } from '@/components/Icon';
import { Map } from '@/components/Map';
import { RatingModal } from '@/components/RatingModal';
import { getRoute } from '@/lib/mapbox';
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
  driver_full_name?: string | null;
  driver_phone?: string | null;
  driver_rating_avg?: number | null;
  driver_rating_count?: number | null;
  driver_lat?: number | null;
  driver_lng?: number | null;
  vehicle_plate?: string | null;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
};

type NearbyDriverRow = { driver_id: string; lat: number; lng: number };

const STATUS_META: Record<RideStatus, { title: string; sub: string; color: string }> = {
  requested: {
    title: 'Recherche d\'un chauffeur',
    sub: 'On cherche un chauffeur près de toi…',
    color: 'bg-primary-500',
  },
  matched: {
    title: 'Chauffeur en route',
    sub: 'Ton chauffeur arrive au point de départ.',
    color: 'bg-primary-500',
  },
  arrived: {
    title: 'Chauffeur arrivé',
    sub: 'Rejoins-le au point de départ.',
    color: 'bg-gold',
  },
  in_progress: {
    title: 'Course en cours',
    sub: 'Bon voyage !',
    color: 'bg-success',
  },
  completed: {
    title: 'Course terminée',
    sub: 'Merci d\'avoir roulé TamCar.',
    color: 'bg-success',
  },
  cancelled_by_client: { title: 'Course annulée', sub: '', color: 'bg-neutral-600' },
  cancelled_by_driver: { title: 'Annulée par le chauffeur', sub: '', color: 'bg-neutral-600' },
  expired: { title: 'Aucun chauffeur trouvé', sub: 'Réessaie plus tard.', color: 'bg-error' },
};

function formatFcfa(n: number | undefined | null): string {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
function formatDistance(m: number | null | undefined): string {
  if (m == null) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
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
function firstNameOf(fullName: string | null | undefined): string {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0] ?? '';
}

export function RideView({ initialRide }: { initialRide: RideForView }) {
  const [ride, setRide] = useState<RideForView>(initialRide);
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriverRow[]>([]);
  const [distanceToPickup, setDistanceToPickup] = useState<number | null>(null);
  const [durationToPickup, setDurationToPickup] = useState<number | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [hasRated, setHasRated] = useState<boolean | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);

  const meta = STATUS_META[ride.status];
  const isWaiting = ride.status === 'requested';
  const isActive = ['requested', 'matched', 'arrived', 'in_progress'].includes(ride.status);
  const hasDriver = ride.driver_id !== null;

  const pickupCoord = useMemo<[number, number]>(
    () => [ride.pickup_lng, ride.pickup_lat],
    [ride.pickup_lat, ride.pickup_lng],
  );
  const dropoffCoord = useMemo<[number, number]>(
    () => [ride.dropoff_lng, ride.dropoff_lat],
    [ride.dropoff_lat, ride.dropoff_lng],
  );
  const driverCoord = useMemo<[number, number] | null>(
    () => (ride.driver_lng != null && ride.driver_lat != null ? [ride.driver_lng, ride.driver_lat] : null),
    [ride.driver_lat, ride.driver_lng],
  );

  // Refetch complet des détails ride+driver
  const refetchDetails = useCallback(async () => {
    const { data } = await supabaseBrowser.rpc('ride_with_driver_details', { ride_id: ride.id });
    if (Array.isArray(data) && data[0]) {
      setRide((prev) => ({ ...prev, ...(data[0] as Partial<RideForView>) }));
    }
  }, [ride.id]);

  // Polling chauffeurs autour (seulement en requested)
  useEffect(() => {
    if (!isWaiting) return;
    let cancelled = false;
    async function poll() {
      const { data } = await supabaseBrowser.rpc('nearby_drivers_for_map', {
        pickup_lat: ride.pickup_lat,
        pickup_lng: ride.pickup_lng,
        radius_km: 5.0,
      });
      if (cancelled) return;
      setNearbyDrivers((data ?? []) as NearbyDriverRow[]);
    }
    poll();
    const interval = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isWaiting, ride.pickup_lat, ride.pickup_lng]);

  // Realtime : updates de la ride (statut change → refetch complet pour infos driver)
  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`ride:${ride.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${ride.id}` },
        async () => {
          await refetchDetails();
        },
      )
      .subscribe();
    return () => { supabaseBrowser.removeChannel(channel); };
  }, [ride.id, refetchDetails]);

  // Realtime : position du chauffeur assigné (updates de public.drivers)
  useEffect(() => {
    if (!ride.driver_id) return;
    const channel = supabaseBrowser
      .channel(`driver-pos:${ride.driver_id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${ride.driver_id}` },
        () => { refetchDetails(); },
      )
      .subscribe();
    return () => { supabaseBrowser.removeChannel(channel); };
  }, [ride.driver_id, refetchDetails]);

  // Check si le user a déjà noté cette ride (quand completed)
  useEffect(() => {
    if (ride.status !== 'completed') return;
    (async () => {
      const { data } = await supabaseBrowser.rpc('has_rated_ride', { p_ride_id: ride.id });
      const rated = Boolean(data);
      setHasRated(rated);
      if (!rated) setRatingOpen(true); // auto-open
    })();
  }, [ride.id, ride.status]);

  // Recalcul route chauffeur → pickup à chaque changement de position driver
  useEffect(() => {
    if (!driverCoord || !isActive || ride.status === 'in_progress' || ride.status === 'completed') {
      setDistanceToPickup(null);
      setDurationToPickup(null);
      return;
    }
    let cancelled = false;
    getRoute(driverCoord, pickupCoord).then((r) => {
      if (cancelled || !r) return;
      setDistanceToPickup(r.distance_km * 1000);
      setDurationToPickup(r.duration_min);
    });
    return () => { cancelled = true; };
  }, [driverCoord, pickupCoord, isActive, ride.status]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-white">
      {/* Carte plein écran */}
      <div className="absolute inset-0">
        <Map
          pickup={pickupCoord}
          dropoff={dropoffCoord}
          driversNearby={isWaiting ? nearbyDrivers : []}
          assignedDriver={hasDriver && driverCoord ? { driver_id: ride.driver_id!, lng: driverCoord[0], lat: driverCoord[1] } : null}
          pickupPulse={isWaiting}
          className="h-full w-full"
        />
      </div>

      {/* Header */}
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
              {isWaiting && nearbyDrivers.length > 0 && (
                <div className="flex-none text-right">
                  <p className="text-2xl font-extrabold leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {nearbyDrivers.length}
                  </p>
                  <p className="text-[10px] leading-tight text-white/80">
                    {nearbyDrivers.length > 1 ? 'chauffeurs autour' : 'chauffeur autour'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card chauffeur assigné */}
          {hasDriver && (ride.driver_full_name || ride.vehicle_plate) && (
            <div className="mx-lg mb-md rounded-xl bg-neutral-100 p-md">
              <div className="flex items-center gap-md">
                <div className="grid h-12 w-12 flex-none place-items-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-md">
                  <CarIcon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-neutral-900">
                    {firstNameOf(ride.driver_full_name) || 'Chauffeur'}
                    {typeof ride.driver_rating_avg === 'number' && ride.driver_rating_avg > 0 && (
                      <span className="ml-xs inline-flex items-center gap-xs text-xs font-semibold text-neutral-600">
                        <StarIcon className="h-3 w-3 text-gold-500" />
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {ride.driver_rating_avg.toFixed(1)}
                        </span>
                      </span>
                    )}
                  </p>
                  {(ride.vehicle_brand || ride.vehicle_model) && (
                    <p className="text-xs text-neutral-600">
                      {[ride.vehicle_color, ride.vehicle_brand, ride.vehicle_model].filter(Boolean).join(' ')}
                      {ride.vehicle_plate && (
                        <span className="ml-xs rounded bg-neutral-900 px-xs py-0.5 text-[10px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {ride.vehicle_plate}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                {ride.driver_phone && (
                  <a
                    href={`tel:${ride.driver_phone}`}
                    className="rounded-full bg-primary-500 px-md py-xs text-xs font-bold text-white shadow-md"
                  >
                    Appeler
                  </a>
                )}
              </div>
              {ride.status === 'matched' && distanceToPickup != null && (
                <div className="mt-sm flex justify-between text-xs text-neutral-600">
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    📍 {formatDistance(distanceToPickup)} restants
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ⏱ ~{durationToPickup ?? '—'} min
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Adresses + metrics */}
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
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">Total</span>
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
            {ride.status === 'completed' && (
              <>
                <div className="rounded-md bg-success/10 p-md text-center text-sm font-semibold text-success">
                  <CheckIcon className="mr-xs inline h-4 w-4" strokeWidth={3} />
                  Course terminée
                </div>
                {hasRated === false && (
                  <button
                    type="button"
                    onClick={() => setRatingOpen(true)}
                    className="mt-md w-full rounded-xl bg-gold py-md text-sm font-bold text-neutral-900 shadow-glow-gold"
                  >
                    ⭐ Noter ce chauffeur
                  </button>
                )}
                {hasRated === true && (
                  <p className="mt-md text-center text-xs text-neutral-500">
                    Merci pour ta note.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {ride.status === 'completed' && ride.driver_full_name && (
        <RatingModal
          open={ratingOpen}
          onClose={() => setRatingOpen(false)}
          rideId={ride.id}
          ratedName={firstNameOf(ride.driver_full_name) || 'ton chauffeur'}
          onSubmitted={() => setHasRated(true)}
        />
      )}
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
