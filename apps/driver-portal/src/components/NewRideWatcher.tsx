'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { supabaseBrowser } from '@/lib/supabase-browser';

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
};

type LocalNotificationsPlugin = {
  requestPermissions(): Promise<{ display: string }>;
  schedule(opts: {
    notifications: Array<{ id: number; title: string; body: string }>;
  }): Promise<unknown>;
};

const LocalNotifications = registerPlugin<LocalNotificationsPlugin>('LocalNotifications');

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

async function notify(row: PendingRow) {
  const title = '🚗 Nouvelle course TamCar';
  const body = `${row.pickup_address} → ${row.dropoff_address} · ${row.price_total_fcfa.toLocaleString('fr-FR')} F`;

  if (isNative()) {
    try {
      await LocalNotifications.schedule({
        notifications: [{ id: Math.floor(Date.now() % 2147483647), title, body }],
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

  // Poll global du pool. Le RPC renvoie [] si hors ligne / pas chauffeur.
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;

    const tick = async () => {
      const { data, error } = await supabaseBrowser.rpc('pending_rides_for_driver', {
        radius_km: 10.0,
      });
      if (cancelled || error || !Array.isArray(data)) return;
      const rows = data as PendingRow[];

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

      chime();
      try {
        navigator.vibrate?.([200, 80, 200]);
      } catch {
        /* ignore */
      }
      if (!onVisibleHome) void notify(fresh[0]);
    };

    tick();
    const t = setInterval(tick, 8000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authed]);

  return null;
}
