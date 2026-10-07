'use client';

import { useEffect, useState } from 'react';

/**
 * Barre « Pas de connexion » (revue du 2026-10-07) : sur un réseau mobile instable, les actions échouaient sans explication.
 * Elle apparaît dès que le navigateur signale la perte du réseau, et confirme brièvement le retour de la connexion.
 */
export function OfflineBanner() {
  const [state, setState] = useState<'online' | 'offline' | 'back'>('online');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const goOffline = () => {
      if (timer) clearTimeout(timer);
      setState('offline');
    };
    const goOnline = () => {
      setState((prev) => (prev === 'offline' ? 'back' : prev));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setState('online'), 2500);
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) setState('offline');
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (state === 'online') return null;
  const offline = state === 'offline';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[70] px-md pb-xs text-center text-xs font-bold text-white ${
        offline ? 'bg-neutral-900' : 'bg-success'
      }`}
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6px)' }}
    >
      {offline
        ? 'Pas de connexion internet : les informations ne sont plus à jour.'
        : 'Connexion rétablie.'}
    </div>
  );
}
