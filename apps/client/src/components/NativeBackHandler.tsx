'use client';

import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Dans l'app native : le bouton Retour matériel Android revient à la page
// précédente (au lieu de quitter l'app). Ne quitte que sur la page racine
// (aucun historique). No-op sur le web (le navigateur gère déjà le retour).
export function NativeBackHandler() {
  useEffect(() => {
    let native = false;
    try {
      native = Capacitor.isNativePlatform();
    } catch {
      native = false;
    }
    if (!native) return;

    let remove: (() => void) | undefined;
    try {
      // Peut jeter si l'APK installé ne contient pas encore le plugin
      // @capacitor/app (vieux build) — le site live doit le tolérer.
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack || (typeof window !== 'undefined' && window.history.length > 1)) {
          window.history.back();
        } else {
          try { App.exitApp(); } catch { /* ignore */ }
        }
      }).then((handle) => {
        remove = () => handle.remove();
      }).catch(() => undefined);
    } catch {
      /* plugin natif absent → no-op */
    }

    return () => remove?.();
  }, []);

  return null;
}
