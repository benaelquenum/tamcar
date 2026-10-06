'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Application native uniquement : reçoit les liens de localisation ouverts
 * depuis une autre application (« Ouvrir avec → TamCar » sur une position
 * WhatsApp, un lien Google Maps…) et bascule sur /ouvrir, qui en extrait la
 * destination puis lance la commande.
 *
 * Deux moments à couvrir :
 *   - l'application était fermée → le lien est dans getLaunchUrl()
 *   - l'application tournait déjà → événement appUrlOpen
 *
 * Le plugin est chargé dynamiquement et l'ensemble est enveloppé dans un
 * try/catch : sur le web, et sur les anciens APK dépourvus du plugin,
 * l'import échoue sans conséquence (piège déjà rencontré sur ce projet).
 */
export function NativeDeepLink() {
  const router = useRouter();

  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | null = null;

    // Les liens propres à l'application (retour OAuth, etc.) ne concernent
    // pas la localisation : on ne détourne que les liens de carte.
    const isLocationLink = (url: string) =>
      /^geo:/i.test(url) ||
      /(maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|google\.[a-z.]+\/maps|maps\.apple\.com|openstreetmap\.org)/i.test(
        url,
      );

    // Appui sur la carte de suivi du chauffeur (notification de l'écran verrouillé) : l'APK rouvre l'application
    // sur l'adresse de la course, de ce même site.
    const isOwnRideLink = (url: string) => {
      try {
        const u = new URL(url);
        return u.origin === window.location.origin && /^\/ride\/[0-9a-f-]{36}\/?$/i.test(u.pathname);
      } catch {
        return false;
      }
    };

    const handle = (url?: string | null) => {
      if (!url || disposed) return;
      if (isOwnRideLink(url)) {
        router.push(new URL(url).pathname);
        return;
      }
      if (!isLocationLink(url)) return;
      router.push(`/ouvrir?u=${encodeURIComponent(url)}`);
    };

    (async () => {
      try {
        const { App } = await import('@capacitor/app');

        const launch = await App.getLaunchUrl();
        handle(launch?.url);

        const listener = await App.addListener('appUrlOpen', (event) => {
          handle(event?.url);
        });
        if (disposed) {
          listener.remove();
        } else {
          remove = () => listener.remove();
        }
      } catch {
        // Contexte web ou plugin absent : rien à faire.
      }
    })();

    return () => {
      disposed = true;
      remove?.();
    };
  }, [router]);

  return null;
}
