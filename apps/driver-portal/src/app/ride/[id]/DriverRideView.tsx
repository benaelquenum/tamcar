'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ArrowRightIcon, CheckIcon, PinIcon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { Map } from '@/components/Map';
import { RatingModal } from '@/components/RatingModal';
import { getRoute } from '@/lib/mapbox';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from '@/lib/support';
import { markArrivedAction, startRideAction } from './actions';
import { StopsPanel } from './StopsPanel';

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
  client_avatar_url: string | null;
  completion_requested_at: string | null;
  completion_recomputed_price_fcfa: number | null;
  completion_distance_from_dropoff_m: number | null;
  completion_auto_accept_at: string | null;
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
  const [hasRated, setHasRated] = useState<boolean | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const router = useRouter();

  const isTerminated =
    ride.status === 'cancelled_by_client' ||
    ride.status === 'cancelled_by_driver' ||
    ride.status === 'expired';

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

  // Auto-open rating modal quand completed
  useEffect(() => {
    if (ride.status !== 'completed') return;
    (async () => {
      const { data } = await supabaseBrowser.rpc('has_rated_ride', { p_ride_id: ride.id });
      const rated = Boolean(data);
      setHasRated(rated);
      if (!rated) setRatingOpen(true);
    })();
  }, [ride.id, ride.status]);

  // Realtime : écoute updates ride pour rester en sync si annulée client par exemple.
  // Bip + vibration si la destination ou le prix changent (le client a réaménagé).
  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`driver-ride:${ride.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${ride.id}` },
        (payload) => {
          const next = payload.new as Partial<DriverRideForView>;
          setRide((prev) => {
            const routeChanged =
              (next.dropoff_address && next.dropoff_address !== prev.dropoff_address) ||
              (typeof next.price_total_fcfa === 'number' && next.price_total_fcfa !== prev.price_total_fcfa);
            if (routeChanged) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const AudioCtx: typeof AudioContext | undefined =
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                  const ctx = new AudioCtx();
                  [660, 880].forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    const t0 = ctx.currentTime + i * 0.18;
                    gain.gain.setValueAtTime(0, t0);
                    gain.gain.linearRampToValueAtTime(0.25, t0 + 0.015);
                    gain.gain.linearRampToValueAtTime(0, t0 + 0.14);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(t0);
                    osc.stop(t0 + 0.16);
                  });
                  setTimeout(() => ctx.close().catch(() => undefined), 700);
                }
                if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
              } catch { /* silencieux */ }
            }
            return { ...prev, ...next };
          });
        },
      )
      .subscribe();
    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [ride.id]);

  const [arrivalConfirm, setArrivalConfirm] = useState<{ distance: number } | null>(null);
  const [acceptingCompletion, setAcceptingCompletion] = useState(false);
  const [completionRemaining, setCompletionRemaining] = useState<number>(20);
  const autoAcceptFiredRef = useRef(false);

  // Countdown affiché sur la modal completion.
  // Quand le délai expire côté chauffeur : on essaie d'appliquer la fin
  // automatiquement (le RPC accepte désormais client OU chauffeur).
  // Ça couvre le cas où le navigateur du client est fermé / en veille.
  useEffect(() => {
    if (!ride.completion_auto_accept_at || ride.status !== 'in_progress') {
      autoAcceptFiredRef.current = false;
      return;
    }
    const deadline = new Date(ride.completion_auto_accept_at).getTime();
    const tick = async () => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setCompletionRemaining(remaining);
      if (remaining === 0 && !autoAcceptFiredRef.current) {
        autoAcceptFiredRef.current = true;
        const { error } = await supabaseBrowser.rpc('auto_accept_completion', {
          ride_id: ride.id,
        });
        if (error) {
          // Si un autre acteur (le client) a déjà déclenché juste avant,
          // on ignore l'erreur "déjà completed"
          if (!/completed|introuvable/i.test(error.message)) {
            setErr(error.message);
          }
        }
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [ride.completion_auto_accept_at, ride.status, ride.id]);

  async function handleAcceptCompletion() {
    if (acceptingCompletion) return;
    setAcceptingCompletion(true);
    setErr(null);
    const { error } = await supabaseBrowser.rpc('driver_accept_completion', {
      ride_id: ride.id,
    });
    if (error) setErr(error.message);
    setAcceptingCompletion(false);
  }

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

  // Haversine (mètres) entre 2 points [lng, lat]
  function haversineMeters(a: [number, number], b: [number, number]): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  async function handleArrival() {
    setErr(null);
    // Position live si dispo, sinon on prend driverPos du heartbeat
    const pos = driverPos ?? (await getMyPos());
    if (!pos) {
      // Fallback : impossible de vérifier → on envoie sans distance
      transition((id) => markArrivedAction(id));
      return;
    }
    const distance = haversineMeters(pos, [ride.pickup_lng, ride.pickup_lat]);
    if (distance > 100) {
      setArrivalConfirm({ distance });
      return;
    }
    startTransition(async () => {
      try {
        await markArrivedAction(ride.id, distance);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erreur');
      }
    });
  }

  function confirmArrivalAnyway() {
    if (!arrivalConfirm) return;
    const distance = arrivalConfirm.distance;
    setArrivalConfirm(null);
    startTransition(async () => {
      try {
        await markArrivedAction(ride.id, distance);
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
          color: 'bg-gradient-to-r from-primary-500 to-primary-700 text-white',
          onClick: handleArrival,
        };
      case 'arrived':
        return {
          label: 'Client à bord — démarrer la course',
          color: 'bg-primary-500 text-white',
          onClick: () => transition(startRideAction),
        };
      case 'in_progress':
        // C'est le CLIENT qui termine la course. Rien à afficher côté chauffeur
        // (la CompletionRequestModal se déclenche seule via completion_requested_at).
        return null;
      case 'completed':
        return {
          label: 'Terminée — retour à l\'accueil',
          color: 'bg-neutral-900 text-white',
          onClick: () => router.push('/'),
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
          href="/"
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
            {/* Cas course annulée / expirée : bandeau + bouton retour, on masque les gains */}
            {(ride.status === 'cancelled_by_client' ||
              ride.status === 'cancelled_by_driver' ||
              ride.status === 'expired') && (
              <div className="mb-md">
                <div className="rounded-xl bg-error/10 p-md text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-error">
                    {ride.status === 'cancelled_by_client' && 'Annulée par le client'}
                    {ride.status === 'cancelled_by_driver' && 'Annulée par le chauffeur'}
                    {ride.status === 'expired' && 'Course expirée'}
                  </p>
                  <p className="mt-xs text-xs text-neutral-700">
                    Cette course ne va pas se dérouler. Retourne à l&apos;accueil pour
                    recevoir de nouvelles courses.
                  </p>
                </div>
                <Link
                  href="/"
                  className="mt-md flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow"
                >
                  ← Retour à l&apos;accueil
                </Link>
              </div>
            )}

            {/* Statut + gains — visibles uniquement pour les états actifs */}
            {ride.status !== 'cancelled_by_client' &&
              ride.status !== 'cancelled_by_driver' &&
              ride.status !== 'expired' && (
                <div className="mb-md flex items-start justify-between gap-md">
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    {statusLabel}
                  </p>
                  <div className="text-right">
                    <p className="text-xs uppercase text-neutral-500">Tu gagnes</p>
                    <p
                      className="text-2xl font-extrabold text-primary-700"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatFcfa(ride.driver_share_fcfa)}
                    </p>
                    <p className="text-[10px] text-neutral-500">
                      +{formatFcfa(ride.driver_rachat_fcfa)} rachat
                    </p>
                  </div>
                </div>
              )}

            {/* Card client */}
            {!isTerminated && (
            <div className="mb-md flex items-center gap-md rounded-xl bg-neutral-100 p-md">
              <Avatar
                src={ride.client_avatar_url}
                name={ride.client_full_name ?? undefined}
                size={44}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  Ton client
                </p>
                <p className="truncate text-sm font-extrabold text-neutral-900">
                  {ride.client_full_name ?? 'Client'}
                </p>
                {ride.client_phone && (
                  <p
                    className="text-[11px] text-neutral-600"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {ride.client_phone}
                  </p>
                )}
              </div>
              {ride.client_phone && (
                <a
                  href={`tel:${ride.client_phone}`}
                  className="rounded-full bg-primary-500 px-md py-xs text-xs font-bold text-white shadow-md hover:brightness-110"
                >
                  Appeler
                </a>
              )}
            </div>
            )}

            {!isTerminated && (
              <>
                {/* Arrêts intermédiaires (Vague B) */}
                <StopsPanel rideId={ride.id} />

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
              </>
            )}

            {err && (
              <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">{err}</div>
            )}

            {nextAction && (
              <button
                type="button"
                onClick={nextAction.onClick}
                disabled={pending || nextAction.disabled}
                className={`flex w-full items-center justify-center gap-sm rounded-xl py-md text-base font-bold shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${nextAction.color}`}
              >
                {pending ? '…' : (
                  <>
                    {ride.status === 'completed' ? <CheckIcon className="h-5 w-5" strokeWidth={3} /> : (nextAction.disabled ? null : <ArrowRightIcon />)}
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

      {/* Modal confirmation arrivée hors zone */}
      {arrivalConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/70 backdrop-blur-sm sm:items-center"
          onClick={() => setArrivalConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-lg text-center">
              <div className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-error/15 text-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h2 className="text-lg font-extrabold text-neutral-900">
                Tu n&apos;es pas au point de départ
              </h2>
              <p
                className="mt-xs text-sm text-neutral-600"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                Tu es à{' '}
                <strong className="text-neutral-900">
                  {arrivalConfirm.distance < 1000
                    ? `${Math.round(arrivalConfirm.distance)} m`
                    : `${(arrivalConfirm.distance / 1000).toFixed(2)} km`}
                </strong>{' '}
                du point de prise en charge.
              </p>
              <p className="mt-md rounded-md bg-error/10 p-sm text-[11px] text-error">
                Marquer &quot;arrivé&quot; maintenant sera signalé à l&apos;équipe TamCar
                pour vérification. Confirme uniquement si tu es vraiment à côté du client.
              </p>
            </div>
            <div className="flex gap-md">
              <button
                type="button"
                onClick={() => setArrivalConfirm(null)}
                className="flex-1 rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-600 hover:border-neutral-300"
              >
                J&apos;attends d&apos;y être
              </button>
              <button
                type="button"
                onClick={confirmArrivalAnyway}
                disabled={pending}
                className="flex-1 rounded-xl bg-error py-md text-sm font-bold text-white shadow-md disabled:opacity-50"
              >
                {pending ? '…' : 'Confirmer quand même'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal demande de fin de course (envoyée par le client) */}
      {ride.status === 'in_progress' && ride.completion_requested_at && (
        <CompletionRequestModal
          recomputedPrice={ride.completion_recomputed_price_fcfa}
          originalPrice={ride.price_total_fcfa}
          distanceFromDropoffM={ride.completion_distance_from_dropoff_m}
          remaining={completionRemaining}
          onAccept={handleAcceptCompletion}
          accepting={acceptingCompletion}
        />
      )}
    </main>
  );
}

function CompletionRequestModal({
  recomputedPrice,
  originalPrice,
  distanceFromDropoffM,
  remaining,
  onAccept,
  accepting,
}: {
  recomputedPrice: number | null;
  originalPrice: number;
  distanceFromDropoffM: number | null;
  remaining: number;
  onAccept: () => void;
  accepting: boolean;
}) {
  const priceDelta = typeof recomputedPrice === 'number' ? recomputedPrice - originalPrice : 0;
  const newPrice = recomputedPrice ?? originalPrice;
  const newDriverCash = Math.floor(newPrice * 0.40);
  const newRachat = Math.floor(newPrice * 0.10);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/75 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl">
        <div className="mb-lg text-center">
          <div className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-primary-50 text-primary-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h2 className="text-lg font-extrabold text-neutral-900">
            Le client demande la fin de course
          </h2>
          <p className="mt-xs text-sm text-neutral-600">
            {distanceFromDropoffM != null && (
              <>
                Il est à <strong>{distanceFromDropoffM} m</strong> de la destination.{' '}
              </>
            )}
            {typeof recomputedPrice === 'number'
              ? 'Prix recalculé au prorata.'
              : 'Il a atteint la destination.'}
          </p>
        </div>

        {typeof recomputedPrice === 'number' && (
          <div className="mb-md rounded-xl border border-primary-200 bg-primary-50 p-md">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-neutral-600">Prix initial</span>
              <span
                className="font-semibold text-neutral-500 line-through"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {originalPrice.toLocaleString('fr-FR').replace(/,/g, ' ')} F
              </span>
            </div>
            <div className="mt-xs flex items-baseline justify-between">
              <span className="text-sm font-bold text-neutral-900">Nouveau prix</span>
              <span
                className="text-xl font-extrabold text-neutral-900"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {newPrice.toLocaleString('fr-FR').replace(/,/g, ' ')} F
              </span>
            </div>
            <p
              className="mt-xs text-[11px] text-neutral-600"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              Tes revenus : <strong>{newDriverCash.toLocaleString('fr-FR').replace(/,/g, ' ')} F</strong> cash + <strong>{newRachat.toLocaleString('fr-FR').replace(/,/g, ' ')} F</strong> rachat
              {' '}({priceDelta < 0 ? '−' : '+'}{Math.abs(priceDelta).toLocaleString('fr-FR').replace(/,/g, ' ')} F vs initial)
            </p>
          </div>
        )}

        {/* Progression du délai auto-accept */}
        <div className="mb-md flex items-center gap-sm">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-error transition-all"
              style={{ width: `${((20 - remaining) / 20) * 100}%` }}
            />
          </div>
          <span
            className="text-xs font-bold text-neutral-700"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            Auto-accept dans {remaining}s
          </span>
        </div>

        <button
          type="button"
          onClick={onAccept}
          disabled={accepting}
          className="mb-sm w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow disabled:opacity-50"
        >
          {accepting ? 'Envoi…' : 'Accepter maintenant'}
        </button>
        <a
          href={`tel:${SUPPORT_PHONE}`}
          className="flex w-full items-center justify-center gap-sm rounded-xl border-2 border-neutral-200 py-sm text-xs font-bold text-neutral-700 hover:border-primary-500 hover:text-primary-500"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          Appeler le service client · {SUPPORT_PHONE_DISPLAY}
        </a>
      </div>
    </div>
  );
}
