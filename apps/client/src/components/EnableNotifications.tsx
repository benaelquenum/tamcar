'use client';

import { useEffect, useState } from 'react';
import { currentPermission, pushSupported, subscribeToPush } from '@/lib/push-subscribe';

export function EnableNotifications() {
  const [state, setState] = useState<NotificationPermission | 'unsupported' | 'loading'>('loading');

  useEffect(() => {
    currentPermission().then(setState);
  }, []);

  if (state === 'loading' || state === 'unsupported' || state === 'granted') return null;

  async function handleEnable() {
    setState('loading');
    const sub = await subscribeToPush();
    setState(sub ? 'granted' : (await currentPermission()));
  }

  return (
    <button
      type="button"
      onClick={handleEnable}
      className="fixed inset-x-lg top-md z-50 mx-auto flex max-w-md items-center justify-center gap-sm rounded-full bg-primary-500 px-lg py-md text-sm font-bold text-white shadow-lg ring-2 ring-white/30"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      Activer les notifications TamCar
    </button>
  );
}
