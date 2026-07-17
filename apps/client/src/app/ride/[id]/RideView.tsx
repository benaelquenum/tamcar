'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { CarIcon, CheckIcon, PinIcon, StarIcon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { Map } from '@/components/Map';
import { RatingModal } from '@/components/RatingModal';
import { getRoute } from '@/lib/mapbox';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from '@/lib/support';
import { AddStopModal } from './AddStopModal';

type RideStopRow = {
  id: string;
  order_idx: number;
  address: string;
  lat: number;
  lng: number;
  status: string;
  arrived_at: string | null;
  departed_at: string | null;
  waiting_extra_fee_fcfa: number;
  extra_price_fcfa: number;
};

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
  matched_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  driver_full_name?: string | null;
  driver_avatar_url?: string | null;
  driver_phone?: string | null;
  completion_requested_at?: string | null;
  completion_recomputed_price_fcfa?: number | null;
  completion_distance_from_dropoff_m?: number | null;
  completion_auto_accept_at?: string | null;
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
  const router = useRouter();
  const [ride, setRide] = useState<RideForView>(initialRide);
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriverRow[]>([]);
  const [distanceToPickup, setDistanceToPickup] = useState<number | null>(null);
  const [durationToPickup, setDurationToPickup] = useState<number | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [hasRated, setHasRated] = useState<boolean | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelPreview, setCancelPreview] = useState<{
    fee_fcfa: number;
    reason_code: string;
    driver_still_busy_elsewhere: boolean;
  } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
  const [searchTimedOut, setSearchTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [stops, setStops] = useState<RideStopRow[]>([]);
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [driverOtherRide, setDriverOtherRide] = useState<{
    other_ride_id: string;
    other_dropoff_address: string;
    other_status: string;
    other_matched_at: string;
    other_duration_min: number | null;
    is_busy: boolean;
  } | null>(null);

  async function openCancelConfirm() {
    // Charge le montant estimé pour affichage transparent
    setCancelPreview(null);
    setCancelConfirm(true);
    const { data } = await supabaseBrowser.rpc('cancellation_fee_preview', {
      p_ride_id: ride.id,
    });
    if (Array.isArray(data) && data[0]) {
      setCancelPreview(data[0] as {
        fee_fcfa: number;
        reason_code: string;
        driver_still_busy_elsewhere: boolean;
      });
    }
  }

  async function handleCancelRide() {
    if (cancelling) return;
    setCancelling(true);
    setCancelError(null);
    const { error } = await supabaseBrowser.rpc('cancel_ride_by_client', {
      ride_id: ride.id,
    });
    if (error) {
      setCancelError(error.message);
      setCancelling(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  async function handleCompleteRide() {
    if (completing) return;
    setCompleting(true);
    setCompleteError(null);

    // Refetch pour éviter d'agir sur un state stale
    await refetchDetails();
    if (ride.status !== 'in_progress' || !ride.started_at) {
      setCompleteError(
        'La course n\'a pas encore été démarrée par le chauffeur. Attends qu\'il fasse monter le client à bord.',
      );
      setCompleting(false);
      return;
    }

    // Récupère la position live (ou best-effort via geolocation one-shot)
    let lat = myLocation?.[1] ?? null;
    let lng = myLocation?.[0] ?? null;
    if (lat == null || lng == null) {
      try {
        const p = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
          });
        });
        lat = p.coords.latitude;
        lng = p.coords.longitude;
      } catch {
        // fallback : coord du dropoff (on assume arrivé)
        lat = ride.dropoff_lat;
        lng = ride.dropoff_lng;
      }
    }

    const { error } = await supabaseBrowser.rpc('client_request_completion', {
      ride_id: ride.id,
      actual_lat: lat,
      actual_lng: lng,
    });
    if (error) {
      setCompleteError(error.message);
      setCompleting(false);
      return;
    }
    await refetchDetails();
    setCompleting(false);
    // Si status déjà 'completed' → RatingModal via useEffect status change
    // Sinon → la modale d'attente s'affiche grâce à completion_requested_at
  }

  // Auto-accept : quand completion_auto_accept_at expire, on force la fin
  useEffect(() => {
    if (!ride.completion_requested_at || !ride.completion_auto_accept_at) return;
    if (ride.status !== 'in_progress') return;
    const deadline = new Date(ride.completion_auto_accept_at).getTime();
    const now = Date.now();
    const remaining = Math.max(0, deadline - now);
    const timer = setTimeout(async () => {
      // Si status pas encore completed, on force
      const { data } = await supabaseBrowser.rpc('ride_with_driver_details', { ride_id: ride.id });
      const fresh = Array.isArray(data) ? (data[0] as { status?: string } | undefined) : undefined;
      if (fresh?.status !== 'in_progress') return;
      await supabaseBrowser.rpc('auto_accept_completion', { ride_id: ride.id });
    }, remaining + 500);
    return () => clearTimeout(timer);
  }, [ride.completion_auto_accept_at, ride.completion_requested_at, ride.status, ride.id]);

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

  // Charge les stops + refresh sur realtime updates
  const refetchStops = useCallback(async () => {
    const { data } = await supabaseBrowser.rpc('ride_stops_of', { p_ride_id: ride.id });
    setStops((data ?? []) as RideStopRow[]);
  }, [ride.id]);

  useEffect(() => {
    refetchStops();
    const channel = supabaseBrowser
      .channel(`stops:${ride.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ride_stops', filter: `ride_id=eq.${ride.id}` },
        () => refetchStops(),
      )
      .subscribe();
    return () => { supabaseBrowser.removeChannel(channel); };
  }, [ride.id, refetchStops]);

  // Timeout recherche : 2 minutes max en status 'requested'
  useEffect(() => {
    if (ride.status !== 'requested') {
      setSearchTimedOut(false);
      return;
    }
    const start = new Date(ride.requested_at).getTime();
    const deadline = start + 120_000;
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining === 0) {
      setSearchTimedOut(true);
      return;
    }
    const timer = setTimeout(() => setSearchTimedOut(true), remaining);
    return () => clearTimeout(timer);
  }, [ride.status, ride.requested_at]);

  async function handleRetrySearch() {
    if (retrying) return;
    setRetrying(true);
    // On reset le timer côté serveur en remettant requested_at à now()
    await supabaseBrowser
      .from('rides')
      .update({ requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', ride.id)
      .eq('status', 'requested');
    setSearchTimedOut(false);
    await refetchDetails();
    setRetrying(false);
  }

  async function handleAbortSearch() {
    await supabaseBrowser.rpc('cancel_ride_by_client', { ride_id: ride.id });
    router.push('/');
    router.refresh();
  }

  // Poll : le chauffeur assigné est-il en train de finir une autre course ?
  useEffect(() => {
    if (!['matched', 'arrived'].includes(ride.status)) {
      setDriverOtherRide(null);
      return;
    }
    let cancelled = false;
    async function check() {
      const { data } = await supabaseBrowser.rpc('driver_active_ride_of', {
        p_ride_id: ride.id,
      });
      if (cancelled) return;
      const rows = (data ?? []) as Array<typeof driverOtherRide extends infer T ? T : never>;
      setDriverOtherRide((rows[0] as typeof driverOtherRide) ?? null);
    }
    check();
    const interval = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride.id, ride.status]);

  // Geolocation live du client — actif pendant matched/arrived/in_progress
  useEffect(() => {
    if (!['matched', 'arrived', 'in_progress'].includes(ride.status)) {
      setMyLocation(null);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setMyLocation([pos.coords.longitude, pos.coords.latitude]),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [ride.status]);

  // Refetch complet des détails ride+driver
  const refetchDetails = useCallback(async () => {
    const { data } = await supabaseBrowser.rpc('ride_with_driver_details', { ride_id: ride.id });
    if (Array.isArray(data) && data[0]) {
      setRide((prev) => ({ ...prev, ...(data[0] as Partial<RideForView>) }));
    }
  }, [ride.id]);

  // Son d'événement joué à chaque transition de statut.
  // Fichiers custom optionnels ; fallback Web Audio motif distinct par étape.
  // Status 'arrived' : boucle toutes les 10s tant que le client n'est pas monté (obligation d'entendre).
  useEffect(() => {
    const soundByStatus: Record<string, { file: string; fallback: 'matched' | 'arrived' | 'started' | 'completed'; loopMs?: number }> = {
      matched: { file: '/sounds/driver-matched.mp3', fallback: 'matched' },
      arrived: { file: '/sounds/driver-arrived.mp3', fallback: 'arrived', loopMs: 10_000 },
      in_progress: { file: '/sounds/ride-started.mp3', fallback: 'started' },
      completed: { file: '/sounds/ride-completed.mp3', fallback: 'completed' },
    };
    const entry = soundByStatus[ride.status];
    if (!entry) return;

    let cancelled = false;
    let ctx: AudioContext | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const playFallback = (motif: 'matched' | 'arrived' | 'started' | 'completed') => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx: typeof AudioContext | undefined =
        typeof window !== 'undefined'
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window.AudioContext || (window as any).webkitAudioContext)
          : undefined;
      if (!AudioCtx) return;
      try {
        if (!ctx) ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        // Motif "arrived" enrichi : plus insistant (3 doublets + note finale) pour version bouclée
        const motifs: Record<typeof motif, [number, number, number][]> = {
          matched: [
            [523, now, 0.18],
            [659, now + 0.18, 0.18],
            [784, now + 0.36, 0.3],
          ],
          arrived: [
            [1046, now, 0.16],
            [1046, now + 0.2, 0.16],
            [1318, now + 0.42, 0.16],
            [1318, now + 0.62, 0.16],
            [1568, now + 0.84, 0.4],
          ],
          started: [
            [440, now, 0.12],
            [554, now + 0.14, 0.12],
            [659, now + 0.28, 0.12],
            [784, now + 0.42, 0.28],
          ],
          completed: [
            [784, now, 0.15],
            [988, now + 0.16, 0.15],
            [1319, now + 0.32, 0.4],
          ],
        };
        for (const [freq, start, dur] of motifs[motif]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(motif === 'arrived' ? 0.45 : 0.25, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + dur + 0.05);
        }
      } catch {
        // ignore
      }
    };

    const play = () => {
      if (cancelled) return;
      try {
        const audio = new Audio(entry.file);
        audio.volume = entry.loopMs ? 0.95 : 0.75;
        audio.play().catch(() => {
          if (!cancelled) playFallback(entry.fallback);
        });
      } catch {
        playFallback(entry.fallback);
      }
    };

    play();
    if (entry.loopMs) {
      intervalId = setInterval(play, entry.loopMs);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      ctx?.close().catch(() => undefined);
    };
  }, [ride.status]);

  // Polling chauffeurs autour (seulement en requested)
  useEffect(() => {
    if (!isWaiting) return;
    let cancelled = false;
    async function poll() {
      const { data } = await supabaseBrowser.rpc('nearby_drivers_for_map', {
        pickup_lat: ride.pickup_lat,
        pickup_lng: ride.pickup_lng,
        radius_km: 10.0,
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
          clientLocation={myLocation}
          pickupPulse={isWaiting}
          autoFit={isWaiting}
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
              {isWaiting && (
                <div className="flex-none text-right">
                  <p className="text-2xl font-extrabold leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {nearbyDrivers.length}
                  </p>
                  <p className="text-[10px] leading-tight text-white/80">
                    {nearbyDrivers.length === 0
                      ? 'chauffeur dans 10 km'
                      : nearbyDrivers.length > 1
                        ? 'chauffeurs dans 10 km'
                        : 'chauffeur dans 10 km'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Bandeau "chauffeur occupé sur une autre course" — annulation gratuite */}
          {driverOtherRide && (
            <div className="mx-lg mb-md rounded-xl border border-warning/30 bg-warning/5 p-md">
              <div className="flex items-start gap-md">
                <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-warning text-white">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-neutral-900">
                    Ton chauffeur termine une autre course
                  </p>
                  <p className="mt-xs text-xs text-neutral-700">
                    Il finit son trajet actuel puis vient te chercher
                    {driverOtherRide.other_duration_min
                      ? ` (${driverOtherRide.other_duration_min} min max avant qu'il ne parte vers toi)`
                      : ''}
                    . Tu peux annuler <strong>sans frais</strong> tant qu&apos;il n&apos;est pas
                    libre.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Card chauffeur assigné */}
          {hasDriver && (ride.driver_full_name || ride.vehicle_plate) && (
            <div className="mx-lg mb-md rounded-xl bg-neutral-100 p-md">
              <div className="flex items-center gap-md">
                <Avatar
                  src={ride.driver_avatar_url}
                  name={ride.driver_full_name ?? undefined}
                  size={48}
                />
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
            {/* Bouton "Ajouter un arrêt" — visible pendant la course, max 2 */}
            {['matched', 'arrived', 'in_progress'].includes(ride.status) && stops.filter((s) => s.status !== 'cancelled').length < 2 && (
              <button
                type="button"
                onClick={() => setAddStopOpen(true)}
                className="mb-sm flex w-full items-center justify-center gap-sm rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/50 py-sm text-sm font-semibold text-primary-700 hover:border-primary-500 hover:bg-primary-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Ajouter un arrêt
              </button>
            )}

            {/* Liste des arrêts */}
            {stops.length > 0 && (
              <div className="mb-sm space-y-xs">
                {stops.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-sm rounded-lg bg-violet-500/10 p-sm text-xs"
                  >
                    <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-violet-500 font-bold text-white">
                      {s.order_idx}
                    </span>
                    <div className="flex-1 truncate">
                      <p className="truncate font-semibold text-neutral-900">
                        {s.address}
                      </p>
                      <p className="text-[10px] text-neutral-600">
                        {s.status === 'pending' && 'En attente chauffeur'}
                        {s.status === 'accepted' && 'Accepté par le chauffeur'}
                        {s.status === 'arrived' && '↳ Arrêt en cours (attente)'}
                        {s.status === 'departed' && `↳ Terminé · +${s.waiting_extra_fee_fcfa} F attente`}
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-bold text-violet-700"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      +{s.extra_price_fcfa} F
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Bouton "terminer" — visible UNIQUEMENT si la course a réellement démarré
                (status='in_progress' ET started_at existe). Sinon le chauffeur n'a pas encore
                cliqué "Client à bord — démarrer la course". */}
            {ride.status === 'in_progress' && ride.started_at && (
              <button
                type="button"
                onClick={handleCompleteRide}
                disabled={completing}
                className="w-full rounded-xl bg-gradient-to-r from-success to-cyan-500 py-md text-sm font-bold text-white shadow-glow disabled:opacity-50"
              >
                {completing ? 'Fin de course…' : 'Je suis arrivé — terminer la course'}
              </button>
            )}
            {completeError && (
              <p className="mt-xs text-center text-xs text-error">{completeError}</p>
            )}
            {(ride.status === 'requested' ||
              ride.status === 'matched' ||
              ride.status === 'arrived') && (
              <>
                {!cancelConfirm ? (
                  <button
                    type="button"
                    onClick={openCancelConfirm}
                    className="w-full rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-600 transition hover:border-error hover:text-error"
                  >
                    Annuler la course
                  </button>
                ) : (
                  <CancelConfirmPanel
                    preview={cancelPreview}
                    onKeep={() => setCancelConfirm(false)}
                    onConfirm={handleCancelRide}
                    cancelling={cancelling}
                    error={cancelError}
                  />
                )}
              </>
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

      {/* Modale timeout : aucun TamCar trouvé après 2 min de recherche */}
      {searchTimedOut && ride.status === 'requested' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/75 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl">
            <div className="mb-lg text-center">
              <div className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-warning/15 text-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h2 className="text-lg font-extrabold text-neutral-900">
                Aucun chauffeur disponible
              </h2>
              <p className="mt-xs text-sm text-neutral-600">
                Tu peux relancer la recherche ou annuler la course.
              </p>
            </div>
            <div className="flex gap-md">
              <button
                type="button"
                onClick={handleAbortSearch}
                className="flex-1 rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-600 hover:border-error hover:text-error"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleRetrySearch}
                disabled={retrying}
                className="flex-1 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow disabled:opacity-50"
              >
                {retrying ? '…' : 'Réessayer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ajout arrêt */}
      <AddStopModal
        open={addStopOpen}
        onClose={() => setAddStopOpen(false)}
        rideId={ride.id}
        pickup={pickupCoord}
        dropoff={dropoffCoord}
        existingStops={stops
          .filter((s) => s.status !== 'cancelled' && s.status !== 'departed')
          .map((s) => ({ lat: s.lat, lng: s.lng }))}
        currentPrice={ride.price_total_fcfa}
        onAdded={() => { void refetchStops(); void refetchDetails(); }}
      />

      {/* Modale d'attente : le client a demandé la fin, on attend le chauffeur (20 s) */}
      {ride.status === 'in_progress' && ride.completion_requested_at && (
        <CompletionWaitingModal
          recomputedPrice={ride.completion_recomputed_price_fcfa}
          originalPrice={ride.price_total_fcfa}
          distanceFromDropoffM={ride.completion_distance_from_dropoff_m}
          autoAcceptAt={ride.completion_auto_accept_at}
        />
      )}

      {ride.status === 'completed' && ride.driver_full_name && (
        <RatingModal
          open={ratingOpen || hasRated === false}
          onClose={() => setRatingOpen(false)}
          rideId={ride.id}
          ratedName={firstNameOf(ride.driver_full_name) || 'ton chauffeur'}
          mandatory={hasRated === false}
          onSubmitted={() => {
            setHasRated(true);
            // Notation obligatoire remplie → retour à l'accueil
            setTimeout(() => {
              router.push('/');
              router.refresh();
            }, 1100);
          }}
        />
      )}
    </main>
  );
}

function CancelConfirmPanel({
  preview,
  onKeep,
  onConfirm,
  cancelling,
  error,
}: {
  preview: {
    fee_fcfa: number;
    reason_code: string;
    driver_still_busy_elsewhere: boolean;
  } | null;
  onKeep: () => void;
  onConfirm: () => void;
  cancelling: boolean;
  error: string | null;
}) {
  const loading = preview === null;
  const fee = preview?.fee_fcfa ?? 0;
  const isFree = fee === 0;
  const reason = preview?.reason_code;

  const explanationLine = (() => {
    switch (reason) {
      case 'free_no_match':
        return 'Ta demande n\'a pas encore été prise. Annulation gratuite.';
      case 'free_within_30s':
        return 'Tu es dans la fenêtre de 30 secondes de rétractation. Annulation gratuite.';
      case 'free_driver_busy':
        return 'Ton chauffeur termine une autre course, il n\'a pas encore démarré vers toi. Annulation gratuite.';
      case 'driver_on_way':
        return 'Le chauffeur roule déjà vers toi pour te prendre en charge.';
      case 'driver_arrived':
        return 'Le chauffeur est arrivé au point de prise en charge et t\'attend.';
      case 'ride_started':
        return 'La course a démarré. L\'annulation représente 50 % du prix estimé.';
      default:
        return 'Vérification en cours…';
    }
  })();

  return (
    <div
      className={`rounded-xl border p-md ${
        isFree ? 'border-success/30 bg-success/5' : 'border-warning/40 bg-warning/10'
      }`}
    >
      <p className="text-sm font-semibold text-neutral-900">
        Confirmer l&apos;annulation ?
      </p>
      <p className="mt-xs text-xs text-neutral-700">{explanationLine}</p>

      {!loading && !isFree && (
        <div className="mt-md rounded-lg bg-white p-md ring-1 ring-warning/30">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Frais d&apos;annulation
            </span>
            <span
              className="text-2xl font-extrabold text-warning"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fee.toLocaleString('fr-FR').replace(/,/g, ' ')} F
            </span>
          </div>
          <p className="mt-xs text-[11px] text-neutral-600">
            Ce montant sera débité de ton portefeuille <strong>TamCar Crédit</strong>. Si
            ton solde est insuffisant, ton compte passera en négatif — la différence sera
            prélevée automatiquement à ton prochain rechargement.
          </p>
          <p className="mt-xs text-[11px] text-neutral-500">
            Répartition : 50 % au chauffeur pour son déplacement, 50 % à la plateforme.
          </p>
        </div>
      )}

      {loading && (
        <p className="mt-md text-center text-xs text-neutral-500">
          Calcul du montant en cours…
        </p>
      )}

      <div className="mt-md flex gap-sm">
        <button
          type="button"
          onClick={onKeep}
          disabled={cancelling}
          className="flex-1 rounded-lg bg-white py-sm text-sm font-semibold text-neutral-600 ring-1 ring-neutral-200"
        >
          Non, garder
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={cancelling || loading}
          className={`flex-1 rounded-lg py-sm text-sm font-bold text-white disabled:opacity-40 ${
            isFree ? 'bg-success' : 'bg-error'
          }`}
        >
          {cancelling
            ? '…'
            : isFree
              ? 'Oui, annuler'
              : `Oui, débiter ${fee.toLocaleString('fr-FR').replace(/,/g, ' ')} F`}
        </button>
      </div>
      {error && <p className="mt-sm text-xs text-error">{error}</p>}
    </div>
  );
}

function CompletionWaitingModal({
  recomputedPrice,
  originalPrice,
  distanceFromDropoffM,
  autoAcceptAt,
}: {
  recomputedPrice: number | null | undefined;
  originalPrice: number;
  distanceFromDropoffM: number | null | undefined;
  autoAcceptAt: string | null | undefined;
}) {
  const [remaining, setRemaining] = useState(20);
  useEffect(() => {
    if (!autoAcceptAt) return;
    const deadline = new Date(autoAcceptAt).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(s);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [autoAcceptAt]);

  const priceDelta =
    typeof recomputedPrice === 'number' ? recomputedPrice - originalPrice : 0;
  const isCheaper = priceDelta < 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/70 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl">
        <div className="mb-lg text-center">
          <div className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-primary-50 text-primary-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h2 className="text-lg font-extrabold text-neutral-900">
            Demande envoyée au chauffeur
          </h2>
          <p className="mt-xs text-sm text-neutral-600">
            Ton chauffeur reçoit la demande de fin de course. Réponse automatique
            dans{' '}
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
              {remaining} s
            </strong>{' '}
            s&apos;il ne réagit pas.
          </p>
        </div>

        {typeof recomputedPrice === 'number' && (
          <div className="mb-md rounded-xl border border-warning/30 bg-warning/5 p-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-warning">
              Fin anticipée · recalcul du prix
            </p>
            <p
              className="mt-xs text-sm text-neutral-900"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {distanceFromDropoffM != null && (
                <>
                  Tu es à <strong>{distanceFromDropoffM} m</strong> de la
                  destination.{' '}
                </>
              )}
              Le prix passe de{' '}
              <strong>
                {originalPrice.toLocaleString('fr-FR').replace(/,/g, ' ')} F
              </strong>{' '}
              à{' '}
              <strong className={isCheaper ? 'text-success' : ''}>
                {recomputedPrice.toLocaleString('fr-FR').replace(/,/g, ' ')} F
              </strong>{' '}
              ({isCheaper ? '−' : '+'}
              {Math.abs(priceDelta).toLocaleString('fr-FR').replace(/,/g, ' ')}{' '}
              F).
            </p>
          </div>
        )}

        {/* Barre de progression du délai */}
        <div className="mb-md h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all"
            style={{ width: `${((20 - remaining) / 20) * 100}%` }}
          />
        </div>

        <a
          href={`tel:${SUPPORT_PHONE}`}
          className="flex w-full items-center justify-center gap-sm rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-700 hover:border-primary-500 hover:text-primary-500"
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
