'use client';

import { useEffect } from 'react';

// Garde l'écran allumé tant que `active` est vrai (course en cours / en ligne).
// Empêche la mise en veille → la géolocalisation continue de tourner.
// NB : ne résout PAS l'arrière-plan total (changement d'app) — ça nécessite
// l'app native (Capacitor) avec background-geolocation. Ici on couvre le cas
// le plus fréquent : écran qui s'éteint alors que l'app est ouverte.
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wl = (navigator as any).wakeLock;
    if (!wl) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sentinel: any = null;
    let cancelled = false;

    const request = async () => {
      try {
        sentinel = await wl.request('screen');
      } catch {
        /* ignore (batterie faible, permission…) */
      }
    };

    request();

    // Le verrou est libéré quand l'onglet passe en arrière-plan : on le
    // reprend dès qu'il redevient visible.
    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      try { sentinel?.release?.(); } catch { /* ignore */ }
    };
  }, [active]);
}
