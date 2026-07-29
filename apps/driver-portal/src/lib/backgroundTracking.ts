'use client';

import { useEffect, useRef } from 'react';
import { registerPlugin, Capacitor } from '@capacitor/core';

// Pont vers le plugin natif @capacitor-community/background-geolocation.
// Le plugin JS n'a pas besoin d'être bundlé : registerPlugin appelle le
// plugin natif par son nom (fourni par l'app Capacitor mobile-driver).
type BgLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  bearing?: number | null;
  speed?: number | null;
  time?: number | null;
};

type BgWatchOptions = {
  backgroundMessage?: string;
  backgroundTitle?: string;
  requestPermissions?: boolean;
  stale?: boolean;
  distanceFilter?: number;
};

type BackgroundGeolocationPlugin = {
  addWatcher(
    options: BgWatchOptions,
    callback: (location?: BgLocation, error?: { code?: string; message?: string }) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
};

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// Démarre le suivi natif en arrière-plan (service avant-plan + notif) et
// remonte chaque position au callback. Renvoie une fonction d'arrêt.
// No-op hors app native (le suivi web/foreground reste géré ailleurs).
export async function startBackgroundTracking(
  onLocation: (lng: number, lat: number) => void,
): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  let id: string | null = null;
  try {
    id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'TamCar Pro',
        backgroundMessage: 'Suivi de course actif.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 15,
      },
      (loc, err) => {
        if (err || !loc) return;
        onLocation(loc.longitude, loc.latitude);
      },
    );
  } catch {
    // Plugin natif absent (ex. build sans le plugin) → ignore.
  }
  return () => {
    if (id) {
      BackgroundGeolocation.removeWatcher({ id }).catch(() => undefined);
      id = null;
    }
  };
}

// Hook : suit la position en arrière-plan tant que `active` est vrai
// (uniquement dans l'app native). Sur web, ne fait rien.
export function useBackgroundTracking(
  active: boolean,
  onLocation: (lng: number, lat: number) => void,
): void {
  const cbRef = useRef(onLocation);
  cbRef.current = onLocation;

  useEffect(() => {
    if (!active || !isNativeApp()) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    startBackgroundTracking((lng, lat) => cbRef.current(lng, lat)).then((s) => {
      if (cancelled) s();
      else stop = s;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [active]);
}
