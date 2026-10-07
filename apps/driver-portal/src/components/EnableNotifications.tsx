'use client';

import { useEffect, useState } from 'react';
import { currentPermission, subscribeToPush } from '@/lib/push-subscribe';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { AlertTriangleIcon } from '@/components/Icon';

const DISMISS_KEY = 'tc_notif_banner_dismissed_at';
const REMIND_AFTER_MS = 24 * 3600 * 1000; // chauffeur : les alertes de course sont vitales, rappel quotidien

function dismissedRecently(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(t) && Date.now() - t < REMIND_AFTER_MS;
  } catch {
    return false;
  }
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Bandeau d'activation des alertes de course. Revue du 2026-10-07 : il s'affichait aussi sur la page de connexion et ne
 * pouvait pas être fermé. Désormais : seulement une fois connecté, fermable (rappel le lendemain : sans notifications,
 * un chauffeur hors de l'application ne voit aucune course).
 */
export function EnableNotifications() {
  const [authed, setAuthed] = useState(false);
  const [state, setState] = useState<NotificationPermission | 'unsupported' | 'loading'>('loading');
  const [hidden, setHidden] = useState(true);

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

  useEffect(() => {
    if (!authed) return;
    setHidden(dismissedRecently());
    (async () => {
      const perm = await currentPermission();
      if (perm === 'granted') {
        // Auto-réenregistrement : la permission navigateur peut être accordée ALORS QUE l'appareil n'est pas (ou plus)
        // enregistré en base pour le profil connecté (réinstallation, purge serveur, changement de compte ou de clé).
        await subscribeToPush();
      }
      setState(perm);
    })();
  }, [authed]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  if (!authed || hidden || state === 'loading' || state === 'unsupported' || state === 'granted') return null;

  // Permission bloquée : le navigateur refusera tout re-prompt, il faut la débloquer dans les réglages.
  if (state === 'denied') {
    return (
      <div
        role="alert"
        className="fixed inset-x-lg top-md z-50 mx-auto flex max-w-md items-start gap-sm rounded-xl bg-error py-sm pl-md pr-xs text-xs font-bold text-white shadow-lg ring-2 ring-white/30"
      >
        <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-none" />
        <span className="flex-1 py-xs">
          Alertes de course bloquées : autorisez les notifications pour ce site dans les réglages de votre navigateur
          (Paramètres → Notifications), sinon vous ne verrez aucune course quand l’application est fermée.
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          className="grid h-9 w-9 flex-none place-items-center rounded-full text-white/80 hover:bg-white/15"
        >
          <CloseIcon />
        </button>
      </div>
    );
  }

  async function handleEnable() {
    setState('loading');
    const sub = await subscribeToPush();
    setState(sub ? 'granted' : await currentPermission());
  }

  return (
    <div
      role="status"
      className="fixed inset-x-lg top-md z-50 mx-auto flex max-w-md items-center gap-xs rounded-full bg-primary-500 py-xs pl-lg pr-xs text-white shadow-lg ring-2 ring-white/30"
    >
      <button type="button" onClick={handleEnable} className="flex flex-1 items-center justify-center gap-sm py-sm text-sm font-bold">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        Activer les alertes de course
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Plus tard"
        className="grid h-9 w-9 flex-none place-items-center rounded-full text-white/80 hover:bg-white/15"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
