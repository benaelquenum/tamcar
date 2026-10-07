'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { freshChannel } from '@/lib/realtime';
import { ringDelaysMs } from '@/lib/rideRings';
import { getDriverOnline, subscribeDriverOnline } from '@/lib/driverPresence';

// Veilleur GLOBAL de nouvelles courses (monté dans le layout, toutes pages).
// Problème résolu : le pool ne vivait que sur l'écran d'accueil, et le Web
// Push ne fonctionne pas dans la WebView native (il faudrait FCM). Ici :
// poll du pool toutes les 8 s partout dans l'app ; à la détection d'une
// nouvelle course → son + vibration + notification locale (plugin natif
// @capacitor/local-notifications, repli Notification web). Quand le
// chauffeur est EN LIGNE, le service GPS d'avant-plan garde le JS vivant
// → les alertes tombent même app en arrière-plan / écran éteint.

type PendingRow = {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  price_total_fcfa: number;
  /** Présent = réservation programmée, absent = course immédiate. */
  scheduled_at?: string | null;
  requested_category?: string | null;
};

type LocalNotificationsPlugin = {
  requestPermissions(): Promise<{ display: string }>;
  schedule(opts: {
    notifications: Array<{
      id: number;
      title: string;
      body: string;
      iconColor?: string;
    }>;
  }): Promise<unknown>;
  cancel(opts: { notifications: Array<{ id: number }> }): Promise<void>;
};

const LocalNotifications = registerPlugin<LocalNotificationsPlugin>('LocalNotifications');

// Sonnerie native de l'APK chauffeur récent (alerte forte en boucle, même app en fond). Absent des anciens APK :
// les appels échouent et on retombe sur la notification locale classique.
type RideAlertPlugin = {
  show(opts: {
    ride_id: string;
    title: string;
    body: string;
    category?: string;
    booking?: string;
    tag?: string;
  }): Promise<void>;
  stop(opts: { ride_id: string }): Promise<void>;
};

const RideAlert = registerPlugin<RideAlertPlugin>('RideAlert');

/** Identifiant stable par course : permet de retirer la notification quand la demande disparaît. */
function notificationId(rideId: string): number {
  let h = 0;
  for (let i = 0; i < rideId.length; i++) h = (h * 31 + rideId.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147483647 || 1;
}

/** La demande n'existe plus (annulée, prise, expirée) : on retire l'alerte et on coupe la sonnerie. */
async function dismiss(rideId: string) {
  if (isNative()) {
    try {
      await RideAlert.stop({ ride_id: rideId });
    } catch {
      /* ancien APK */
    }
    try {
      await LocalNotifications.cancel({ notifications: [{ id: notificationId(rideId) }] });
    } catch {
      /* plugin absent */
    }
    return;
  }
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg) return;
    for (const tag of ['new-ride-watch', `new-ride:${rideId}`]) {
      (await reg.getNotifications({ tag })).forEach((n) => n.close());
    }
  } catch {
    /* ignore */
  }
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// Double bip aigu (WebAudio, aucun asset). Peut être silencieux tant que
// l'utilisateur n'a pas interagi avec la page (politique autoplay) — la
// notification + vibration prennent le relais.
function chime() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const beep = (freq: number, at: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.55);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.6);
    };
    beep(880, 0);
    beep(1174, 0.28);
  } catch {
    /* ignore */
  }
}

// Sonnerie forte de l'application (2026-10-07 : l'ancien double bip était trop discret).
function ringOnce() {
  try {
    const a = new Audio('/sounds/ride-alarm.mp3');
    a.volume = 1;
    void a.play().catch(() => chime());
  } catch {
    chime();
  }
}

/** Violet TamCar : teinte d'accent des réservations (bleu-violet). */
const BOOKING_ACCENT = '#7C3AED';

async function notify(row: PendingRow) {
  const isBooking = Boolean(row.scheduled_at);
  const when = row.scheduled_at
    ? new Date(row.scheduled_at).toLocaleString('fr-FR', {
        weekday: 'short', day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
      })
    : '';
  // Le libellé porte la distinction : le système ne laisse pas une
  // application peindre le fond de son volet de notification.
  const title = isBooking ? `Réservation — ${when}` : 'Nouvelle course TamCar';
  const body = `${row.pickup_address} → ${row.dropoff_address} · ${row.price_total_fcfa.toLocaleString('fr-FR')} F`;

  if (isNative()) {
    try {
      await RideAlert.show({
        ride_id: row.id,
        title,
        body,
        category: row.requested_category ?? '',
        booking: isBooking ? '1' : '0',
        tag: `new-ride:${row.id}`,
      });
      return;
    } catch {
      /* ancien APK sans sonnerie native : notification locale ci-dessous */
    }
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationId(row.id),
            title,
            body,
            // Seule teinte réglable côté Android : l'accent de l'icône.
            ...(isBooking ? { iconColor: BOOKING_ACCENT } : {}),
          },
        ],
      });
      return;
    } catch {
      /* plugin absent (vieil APK) → repli web ci-dessous */
    }
  }
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) await reg.showNotification(title, { body, tag: 'new-ride-watch' });
      else new Notification(title, { body });
    }
  } catch {
    /* ignore */
  }
}

export function NewRideWatcher() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [authed, setAuthed] = useState(false);
  const seenRef = useRef<Set<string> | null>(null);

  // Suit l'état de session (le veilleur ne tourne que connecté).
  useEffect(() => {
    let active = true;
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (active) setAuthed(Boolean(data.session));
    });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Permission notifications natives (Android 13+), une fois.
  useEffect(() => {
    if (!authed || !isNative()) return;
    LocalNotifications.requestPermissions().catch(() => undefined);
  }, [authed]);

  // Présence : hors ligne, le veilleur ne demande plus rien (avant : 2 requêtes toutes
  // les 8 s en permanence, même hors ligne). Inconnue (page ouverte directement) : on veille.
  const [online, setOnline] = useState<boolean | null>(getDriverOnline());
  useEffect(() => {
    setOnline(getDriverOnline());
    return subscribeDriverOnline(() => setOnline(getDriverOnline()));
  }, []);

  // Veille globale du pool. Les nouvelles courses arrivent en temps réel ; le
  // sondage ne sert plus que de filet de sécurité (45 s quand le temps réel est
  // connecté, 10 s sinon). Les réservations programmées, jamais urgentes, ne sont
  // relues que toutes les 5 minutes.
  useEffect(() => {
    if (!authed || online === false) return;
    let cancelled = false;
    let realtimeOk = false;
    let lastBooked = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      const now = Date.now();
      const wantBooked = now - lastBooked > 5 * 60_000;
      const [immediate, booked] = await Promise.all([
        supabaseBrowser.rpc('pending_rides_for_driver', { radius_km: 10.0 }),
        wantBooked
          ? supabaseBrowser.rpc('pending_scheduled_rides_for_driver', { radius_km: 12.0 })
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (cancelled) return;
      if (wantBooked && !booked.error) lastBooked = now;
      if (immediate.error && booked.error) return;
      const rows = [
        ...(Array.isArray(immediate.data) ? (immediate.data as PendingRow[]) : []),
        ...(Array.isArray(booked.data) ? (booked.data as PendingRow[]) : []),
      ];

      // 1er passage : on mémorise sans alerter (courses déjà à l'écran).
      if (seenRef.current === null) {
        seenRef.current = new Set(rows.map((r) => r.id));
        return;
      }
      const fresh = rows.filter((r) => !seenRef.current!.has(r.id));
      rows.forEach((r) => seenRef.current!.add(r.id));
      if (fresh.length === 0) return;

      // Sur l'accueil visible, la liste se met déjà à jour sous ses yeux :
      // son seulement. Partout ailleurs (autre page, app en fond) : tout.
      const onVisibleHome =
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        pathnameRef.current === '/';

      // Accueil visible : l'écran sonne déjà en boucle, on n'ajoute rien. Ailleurs (autre page, app en fond) : sonnerie
      // + vibration + alerte.
      if (!onVisibleHome) {
        ringOnce();
        try {
          navigator.vibrate?.([500, 200, 500, 200, 500]);
        } catch {
          /* ignore */
        }
        void notify(fresh[0]);
      }
    };

    const schedule = () => {
      timer = setTimeout(async () => {
        await tick();
        if (!cancelled) schedule();
      }, realtimeOk ? 45_000 : online === null ? 30_000 : 10_000);
    };

    // Une course créée dans le pool réveille le veilleur tout de suite. Cascade de
    // catégories : une demande Confort devient visible au VIP, une demande Essentiel
    // au Confort, 30 s plus tard (aucun événement à ce moment-là) → une relecture à +31 s.
    const lateTimers = new Set<ReturnType<typeof setTimeout>>();
    const channel = freshChannel('watcher-pool')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides' }, (payload) => {
        void tick();
        // Priorité de proximité : un cercle qui s'ouvre ne déclenche aucun événement → relecture à chaque ouverture.
        void ringDelaysMs().then((delays) => {
          if (cancelled) return;
          delays.forEach((ms) => {
            const t = setTimeout(() => {
              lateTimers.delete(t);
              if (!cancelled) void tick();
            }, ms);
            lateTimers.add(t);
          });
        });
        const cat = (payload.new as { requested_category?: string } | null)?.requested_category;
        if (cat === 'confort' || cat === 'essentiel') {
          const t = setTimeout(() => {
            lateTimers.delete(t);
            if (!cancelled) void tick();
          }, 31_000);
          lateTimers.add(t);
        }
      })
      // Demande annulée / prise / expirée : la RLS cache l'événement aux chauffeurs, le serveur le diffuse.
      .on('broadcast', { event: 'ride_gone' }, (msg) => {
        const id = (msg?.payload as { ride_id?: string } | undefined)?.ride_id;
        if (id) void dismiss(id);
      })
      .subscribe((status) => {
        realtimeOk = status === 'SUBSCRIBED';
      });

    tick();
    schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      lateTimers.forEach((t) => clearTimeout(t));
      lateTimers.clear();
      document.removeEventListener('visibilitychange', onVisible);
      supabaseBrowser.removeChannel(channel);
    };
  }, [authed, online]);

  return null;
}
