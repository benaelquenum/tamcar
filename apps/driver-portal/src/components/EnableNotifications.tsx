'use client';

import { useEffect, useState } from 'react';
import { currentPermission, pushSupported, subscribeToPush } from '@/lib/push-subscribe';

export function EnableNotifications() {
  const [state, setState] = useState<NotificationPermission | 'unsupported' | 'loading'>('loading');

  useEffect(() => {
    (async () => {
      const perm = await currentPermission();
      if (perm === 'granted') {
        // Auto-réenregistrement : la permission navigateur peut être accordée
        // ALORS QUE l'appareil n'est pas (ou plus) enregistré en base pour le
        // profil connecté (réinstallation, purge serveur, changement de compte).
        // On resynchronise silencieusement à chaque ouverture.
        await subscribeToPush();
      }
      setState(perm);
    })();
  }, []);

  if (state === 'loading' || state === 'unsupported' || state === 'granted') return null;

  // Permission bloquée : le navigateur refusera tout re-prompt — il faut
  // débloquer dans les réglages. On l'affiche clairement.
  if (state === 'denied') {
    return (
      <div className="fixed inset-x-lg top-md z-50 mx-auto max-w-md rounded-xl bg-error px-lg py-md text-center text-xs font-bold text-white shadow-lg ring-2 ring-white/30">
        ⚠️ Alertes de course bloquées — autorise les notifications pour ce site
        dans les réglages de ton navigateur (Paramètres → Notifications), sinon
        tu ne verras aucune course.
      </div>
    );
  }

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
      Activer les alertes de course
    </button>
  );
}
