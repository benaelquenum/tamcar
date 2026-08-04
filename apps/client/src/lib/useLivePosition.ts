'use client';

import { useEffect, useState } from 'react';
import { isAccurateEnough, SmoothingBuffer } from './geo-precision';

// Position live continue HORS COURSE — même stratégie que le chauffeur :
// watch permanent + filtre de précision (fixes > 50 m rejetés) + lissage
// (moyenne pondérée sur 5 fixes). Le GPS chauffe dès l'ouverture de la
// page ; la valeur ne « danse » pas et ne saute jamais sur un fix réseau.
export function useLivePosition(active: boolean): [number, number] | null {
  const [coord, setCoord] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!active) {
      setCoord(null);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const buffer = new SmoothingBuffer(5);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isAccurateEnough(pos)) return;
        setCoord(
          buffer.push({
            lng: pos.coords.longitude,
            lat: pos.coords.latitude,
            accuracy: pos.coords.accuracy,
            ts: pos.timestamp,
          }),
        );
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  return coord;
}
