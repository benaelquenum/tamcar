'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ArrowRightIcon, CheckIcon, PinIcon } from '@/components/Icon';
import { Map } from '@/components/Map';
import { getRoute } from '@/lib/mapbox';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { completeRideAction, markArrivedAction, startRideAction } from './actions';

type RideStatus =
  | 'requested'
  | 'matched'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled_by_client'
  | 'cancelled_by_driver'
  | 'expired';

export type DriverRideForView = {
  id: string;
  status: RideStatus;
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
  client_full_name: string | null;
  client_phone: string | null;
};

function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
function formatDistance(m: number | null | undefined): string {
  if (m == null) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function DriverRideView({ initialRide }: { initialRide: DriverRideForView }) {
  const [ride, setRide] = useState<DriverRideForView>(initialRide);
  const [driverPos, setDriverPos] = useState<[number, number] | null>(null);
  const [routeGeo, setRouteGeo] = useState<GeoJSON.LineString | null>(null);
  const [distanceToTarget, setDistanceToTarget] = useState<number | null>(null);
  const [durationToTarget, setDurationToTarget] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const target = useMemo<[number, number]>(() => {
    if (ride.status === 'in_progress') return [ride.dropoff_lng, ride.dropoff_lat];
    return [ride.pickup_lng, ride.pickup_lat];
  }, [ride.status, ride.pickup_lat, ride.pickup_lng, ride.dropoff_lat, ride.dropoff_lng]);

  // Get my position + heartbeat
  const getMyPos = useCallback(async (): Promise<[number, number] | null> => {
    if (!('geolocation' in navigator)) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve([p.coords.longitude, p.coords.latitude]),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });
  }, []);

  // Heartbeat position + recalcul route toutes les 15s
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const p = await getMyPos();
      if (!p || cancelled) return;
      setDriverPos(p);
      supabaseBrowser.rpc('driver_update_location', { current_lng: p[0], current_lat: p[1] });

      // Route jusqu'à la target
      const r = await getRoute(p, target);
      if (r && !cancelled) {
        setRouteGeo(r.geometry);
        setDistanceToTarget(r.distance_km * 1000);
        setDurationToTarget(r.duration_min);
      }
    }

    tick();
    const interval = setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [target, getMyPos]);

  // Realtime : écoute updates ride pour rester en sync si annulée client par exemple
  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`driver-ride:${ride.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${ride.id}` },
        (payload) => {
          const next = payload.new as Partial<DriverRideForView>;
          setRide((prev) => ({ ...prev, ...next }));
        },
      )
      .subscribe();
    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [ride.id]);

  function transition(fn: (id: string) => Promise<void>) {
    setErr(null);
    startTransition(async () => {
      try {
        await fn(ride.id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erreur');
      }
    });
  }

  const nextAction = (() => {
    switch (ride.status) {
      case 'matched':
        return {
          label: 'Je suis arrivé au point de départ',
          color: 'bg-gold text-neutral-900',
          onClick: () => transition(markArrivedAction),
        };
      case 'arrived':
        return {
          label: 'Client à bord — démarrer la course',
          color: 'bg-primary-500 text-white',
          onClick: () => transition(startRideAction),
        };
      case 'in_progress':
        return {
          label: 'Course terminée',
          color: 'bg-success text-white',
          onClick: () => transition(completeRideAction),
        };
      case 'completed':
        return {
          label: 'Terminée — retour à l\'accueil',
          color: 'bg-neutral-900 text-white',
          onClick: () => router.push('/driver'),
        };
      default:
        return null;
    }
  })();

  const statusLabel = (() => {
    switch (ride.status) {
      case 'matched': return 'En route vers le client';
      case 'arrived': return 'Attente du client au point de départ';
      case 'in_progress': return 'Course en cours';
      case 'completed': return 'Course terminée';
      case 'cancelled_by_client': return 'Annulée par le client';
      default: return ride.status;
    }
  })();

  return (
    <main className="fixed inset-0 overflow-hidden bg-white">
      {/* Carte plein écran */}
      <div className="absolute inset-0">
        <Map
          pickup={[ride.pickup_lng, ride.pickup_lat]}
          dropoff={ride.status === 'in_progress' ? [ride.dropoff_lng, ride.dropoff_lat] : undefined}
          assignedDriver={driverPos ? { driver_id: 'me', lng: driverPos[0], lat: driverPos[1] } : null}
          route={routeGeo}
          autoFit={false}
          className="h-full w-full"
        />
      </div>

      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-lg">
        <Link
          href="/driver"
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-lg ring-1 ring-neutral-200"
        >
          <span className="text-xl leading-none">←</span>
        </Link>
        <div className="pointer-events-auto flex items-center gap-xs rounded-full bg-white/95 px-md py-xs shadow-lg ring-1 ring-neutral-200 backdrop-blur">
          <Logo className="h-5 w-auto" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-900">
            Chauffeur
          </span>
        </div>
      </header>

      {/* Bottom sheet */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="mx-auto max-w-md rounded-t-2xl bg-white shadow-2xl ring-1 ring-neutral-200">
          <div className="p-lg">
            {/* Statut + client */}
            <div className="mb-md flex items-start justify-between gap-md">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  {statusLabel}
                </p>
                <p className="mt-xs text-lg font-extrabold text-neutral-900">
                  {ride.client_full_name ?? 'Client'}
                </p>
                {ride.client_phone && (
                  <a href={`tel:${ride.client_phone}`} className="text-xs text-primary-500 underline">
                    {ride.client_phone}
                  </a>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs uppercase text-neutral-500">Tu gagnes</p>
                <p
                  className="text-2xl font-extrabold text-success"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatFcfa(ride.driver_share_fcfa)}
                </p>
                <p className="text-[10px] text-neutral-500">
                  +{formatFcfa(ride.driver_rachat_fcfa)} rachat
                </p>
              </div>
            </div>

            {/* Cible + distance/durée */}
            <div className="mb-md rounded-xl bg-primary-50 p-md">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
                {ride.status === 'in_progress' ? 'Destination client' : 'Va chercher le client'}
              </p>
              <p className="mt-xs flex items-start gap-xs text-sm font-semibold text-neutral-900">
                <PinIcon
                  className="mt-xs h-3 w-3 flex-none"
                  strokeWidth={3}
                  {...({} as { style?: React.CSSProperties })}
                />
                {ride.status === 'in_progress' ? ride.dropoff_address : ride.pickup_address}
              </p>
              <div className="mt-sm flex justify-between text-xs text-neutral-600">
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  📍 {formatDistance(distanceToTarget)} restants
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ⏱ ~{durationToTarget ?? '—'} min
                </span>
              </div>
            </div>

            {err && (
              <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">{err}</div>
            )}

            {nextAction && (
              <button
                type="button"
                onClick={nextAction.onClick}
                disabled={pending}
                className={`flex w-full items-center justify-center gap-sm rounded-xl py-md text-base font-bold shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${nextAction.color}`}
              >
                {pending ? '…' : (
                  <>
                    {ride.status === 'completed' ? <CheckIcon className="h-5 w-5" strokeWidth={3} /> : <ArrowRightIcon />}
                    {nextAction.label}
                  </>
                )}
              </button>
            )}

            {ride.status === 'completed' && (
              <p className="mt-md text-center text-xs text-neutral-500">
                Wallet crédité : {formatFcfa(ride.driver_share_fcfa)} F cash + {formatFcfa(ride.driver_rachat_fcfa)} F rachat
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
