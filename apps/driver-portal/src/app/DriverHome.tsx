'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import {
  ArrowRightIcon,
  ClockIcon,
  MenuIcon,
  PinIcon,
  RouteIcon,
  TargetIcon,
} from '@/components/Icon';
import { Map } from '@/components/Map';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { acceptRideAction } from './actions';

type PendingRide = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_from_driver_m: number;
  distance_km: number | null;
  duration_min: number | null;
  price_total_fcfa: number;
  driver_share_fcfa: number;
  requested_at: string;
};

type Props = {
  driverName: string;
  initialIsOnline: boolean;
  hasVehicle: boolean;
};

function formatFcfa(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

export function DriverHome({ driverName, initialIsOnline, hasVehicle }: Props) {
  const [isOnline, setIsOnline] = useState(initialIsOnline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [pending, setPending] = useState<PendingRide[]>([]);
  const [accepting, startAccept] = useTransition();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Récupère la position GPS actuelle
  const getMyPosition = useCallback(async (): Promise<[number, number] | null> => {
    if (!('geolocation' in navigator)) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });
  }, []);

  async function goOnline() {
    setError(null);
    setBusy(true);
    const p = await getMyPosition();
    if (!p) {
      setError('Impossible de récupérer ta position GPS.');
      setBusy(false);
      return;
    }
    const { error: rpcErr } = await supabaseBrowser.rpc('driver_go_online', {
      current_lng: p[0],
      current_lat: p[1],
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setBusy(false);
      return;
    }
    setPosition(p);
    setIsOnline(true);
    setBusy(false);
  }

  async function goOffline() {
    setBusy(true);
    const { error: rpcErr } = await supabaseBrowser.rpc('driver_go_offline');
    if (rpcErr) setError(rpcErr.message);
    else {
      setIsOnline(false);
      setPending([]);
    }
    setBusy(false);
  }

  // Heartbeat position toutes les 20s + polling pending rides toutes les 5s
  useEffect(() => {
    if (!isOnline) return;

    let cancelled = false;

    async function updatePosition() {
      const p = await getMyPosition();
      if (!p || cancelled) return;
      setPosition(p);
      await supabaseBrowser.rpc('driver_update_location', {
        current_lng: p[0],
        current_lat: p[1],
      });
    }

    async function pollPending() {
      const { data, error: err } = await supabaseBrowser.rpc('pending_rides_for_driver', {
        radius_km: 10.0,
      });
      if (cancelled) return;
      if (err) {
        // eslint-disable-next-line no-console
        console.error('pending_rides_for_driver:', err.message);
        return;
      }
      setPending((data ?? []) as PendingRide[]);
    }

    updatePosition();
    pollPending();
    const posInterval = setInterval(updatePosition, 20_000);
    const pendingInterval = setInterval(pollPending, 5_000);

    return () => {
      cancelled = true;
      clearInterval(posInterval);
      clearInterval(pendingInterval);
    };
  }, [isOnline, getMyPosition]);

  // Realtime : nouveaux INSERTs rides dans le pool → refresh immédiat
  useEffect(() => {
    if (!isOnline) return;
    const channel = supabaseBrowser
      .channel('driver-pool')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rides' },
        async () => {
          const { data } = await supabaseBrowser.rpc('pending_rides_for_driver', {
            radius_km: 10.0,
          });
          setPending((data ?? []) as PendingRide[]);
        },
      )
      .subscribe();
    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [isOnline]);

  // Son d'alerte : joue /sounds/alert.mp3 si présent, sinon fallback Web Audio (ta-da).
  // Boucle sans jamais couper la fin du fichier : attend l'event 'ended' + 1,5 s de pause.
  useEffect(() => {
    if (!isOnline || pending.length === 0) return;

    let stopped = false;
    let audioEl: HTMLAudioElement | null = null;
    let ctx: AudioContext | null = null;
    let useCustomFile = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      audioEl = new Audio('/sounds/alert.mp3');
      audioEl.volume = 0.7;
      audioEl.preload = 'auto';
    } catch {
      useCustomFile = false;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioCtx: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window.AudioContext || (window as any).webkitAudioContext)
        : undefined;

    const playFallbackBeep = () => new Promise<void>((resolve) => {
      if (!AudioCtx) return resolve();
      try {
        if (!ctx) ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        const notes: [number, number][] = [
          [880, now],
          [1174, now + 0.18],
        ];
        for (const [freq, start] of notes) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.4);
        }
        // Attente approximative fin du dernier son
        setTimeout(resolve, 600);
      } catch {
        resolve();
      }
    });

    const playOnce = () => new Promise<void>((resolve) => {
      if (useCustomFile && audioEl) {
        audioEl.currentTime = 0;
        const el = audioEl;
        const onEnd = () => {
          el.removeEventListener('ended', onEnd);
          el.removeEventListener('error', onErr);
          resolve();
        };
        const onErr = () => {
          el.removeEventListener('ended', onEnd);
          el.removeEventListener('error', onErr);
          useCustomFile = false;
          playFallbackBeep().then(resolve);
        };
        el.addEventListener('ended', onEnd);
        el.addEventListener('error', onErr);
        el.play().catch(() => {
          el.removeEventListener('ended', onEnd);
          el.removeEventListener('error', onErr);
          useCustomFile = false;
          playFallbackBeep().then(resolve);
        });
      } else {
        playFallbackBeep().then(resolve);
      }
    });

    const loop = async () => {
      while (!stopped) {
        await playOnce();
        if (stopped) return;
        await new Promise<void>((r) => {
          timeoutId = setTimeout(r, 1500);
        });
      }
    };

    loop();

    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
      audioEl?.pause();
      audioEl = null;
      ctx?.close().catch(() => undefined);
    };
  }, [pending.length, isOnline]);

  function handleAccept(rideId: string) {
    setAcceptingId(rideId);
    setError(null);
    startAccept(async () => {
      try {
        await acceptRideAction(rideId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur');
      } finally {
        setAcceptingId(null);
      }
    });
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-white">
      {/* Carte plein écran */}
      <div className="absolute inset-0">
        <Map
          pickup={position ?? undefined}
          pendingPickups={pending.map((r) => ({
            ride_id: r.id,
            lat: r.pickup_lat,
            lng: r.pickup_lng,
            price_fcfa: r.price_total_fcfa,
          }))}
          className="h-full w-full"
        />
      </div>

      {/* Header overlay */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-lg">
        <Link
          href="/"
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-lg ring-1 ring-neutral-200"
          aria-label="Retour accueil"
        >
          <span className="text-xl leading-none">←</span>
        </Link>
        <div className="pointer-events-auto flex items-center gap-xs rounded-full bg-white/95 px-md py-xs shadow-lg ring-1 ring-neutral-200 backdrop-blur">
          <Logo className="h-5 w-auto" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-900">
            Chauffeur
          </span>
        </div>
        <Link
          href="/dashboard"
          aria-label="Mon dashboard"
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-lg ring-1 ring-neutral-200 hover:bg-neutral-100"
        >
          <MenuIcon />
        </Link>
      </header>

      {/* Bottom sheet */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="mx-auto max-w-md rounded-t-2xl bg-white shadow-2xl ring-1 ring-neutral-200">
          <div className="p-lg">
            {/* Toggle online */}
            <div className="mb-md flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  {driverName}
                </p>
                <p className={`mt-xs text-lg font-extrabold ${isOnline ? 'text-primary-700' : 'text-neutral-900'}`}>
                  {isOnline ? '● En ligne' : '○ Hors ligne'}
                </p>
              </div>
              <button
                type="button"
                onClick={isOnline ? goOffline : goOnline}
                disabled={busy || !hasVehicle}
                className={`rounded-full px-lg py-md text-sm font-bold shadow-md transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isOnline
                    ? 'bg-neutral-900 text-white hover:brightness-110'
                    : 'bg-primary-500 text-white hover:brightness-110'
                }`}
              >
                {busy ? '…' : isOnline ? 'Se déconnecter' : 'Se connecter'}
              </button>
            </div>

            {!hasVehicle && (
              <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">
                Aucun véhicule assigné. Contacte l&apos;équipe TamCar pour
                associer une voiture à ton compte.
              </div>
            )}

            {error && (
              <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">
                {error}
              </div>
            )}

            {/* Liste rides en attente */}
            {isOnline && (
              <>
                <div className="mb-sm flex items-baseline justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Courses autour
                  </h2>
                  <span className="text-xs text-neutral-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {pending.length} disponible{pending.length > 1 ? 's' : ''}
                  </span>
                </div>

                {pending.length === 0 ? (
                  <div className="rounded-xl bg-neutral-100 p-lg text-center text-sm text-neutral-600">
                    Aucune course dans un rayon de 5 km. On te notifie dès qu&apos;il y en a une.
                  </div>
                ) : (
                  <div className="max-h-[52vh] space-y-sm overflow-y-auto pr-xs">
                    {pending.map((r) => (
                      <RideCard
                        key={r.id}
                        ride={r}
                        onAccept={() => handleAccept(r.id)}
                        accepting={acceptingId === r.id && accepting}
                        disabled={accepting}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {!isOnline && hasVehicle && (
              <div className="rounded-xl bg-primary-50 p-lg text-center">
                <p className="text-sm text-primary-900">
                  Passe en ligne pour voir les courses disponibles autour de toi.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function RideCard({
  ride,
  onAccept,
  accepting,
  disabled,
}: {
  ride: PendingRide;
  onAccept: () => void;
  accepting: boolean;
  disabled: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-md shadow-sm">
      <div className="flex items-start justify-between gap-md">
        <div className="flex-1 space-y-xs">
          <div className="flex items-start gap-xs">
            <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-primary-500 text-white">
              <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <p className="flex-1 text-xs text-neutral-900">{ride.pickup_address}</p>
          </div>
          <div className="ml-1.5 h-3 border-l-2 border-dashed border-neutral-300" />
          <div className="flex items-start gap-xs">
            <span className="mt-xs grid h-4 w-4 flex-none place-items-center rounded-full bg-violet-500 text-white">
              <PinIcon className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <p className="flex-1 text-xs text-neutral-900">{ride.dropoff_address}</p>
          </div>
        </div>
        <div className="text-right">
          <p
            className="text-lg font-extrabold text-primary-500"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatFcfa(ride.driver_share_fcfa)}
          </p>
          <p className="text-[9px] text-neutral-500">FCFA cash pour toi</p>
        </div>
      </div>
      <div className="mt-sm flex flex-wrap items-center gap-x-md gap-y-xs text-[11px] text-neutral-600">
        <span
          className="inline-flex items-center gap-xs"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          <TargetIcon className="h-3 w-3 text-primary-500" />
          {formatDistance(ride.distance_from_driver_m)}
        </span>
        <span
          className="inline-flex items-center gap-xs"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          <RouteIcon className="h-3 w-3 text-neutral-500" />
          {ride.distance_km?.toFixed(1) ?? '—'} km
        </span>
        <span
          className="inline-flex items-center gap-xs"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          <ClockIcon className="h-3 w-3 text-neutral-500" />~{ride.duration_min ?? '—'} min
        </span>
        <span
          className="ml-auto font-semibold text-neutral-800"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatFcfa(ride.price_total_fcfa)} F total
        </span>
      </div>
      <button
        type="button"
        onClick={onAccept}
        disabled={disabled}
        className="mt-md flex w-full items-center justify-center gap-xs rounded-lg bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {accepting ? (
          'Acceptation…'
        ) : (
          <>
            Accepter la course
            <ArrowRightIcon className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}
