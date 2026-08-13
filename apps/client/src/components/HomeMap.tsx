'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Map, type DriverPin } from '@/components/Map';
import { CrosshairIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { COTONOU_CENTER } from '@/lib/mapbox';

type NearbyRow = {
  lat: number;
  lng: number;
  category: string | null;
  total_nearby: number;
};

/** Intervalle de rafraîchissement des véhicules. */
const REFRESH_MS = 20_000;

export function HomeMap({ className = '' }: { className?: string }) {
  const [me, setMe] = useState<[number, number] | null>(null);
  const [drivers, setDrivers] = useState<DriverPin[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const watchRef = useRef<number | null>(null);

  // Position du client. On ne demande pas la permission de façon agressive :
  // à défaut, la carte reste centrée sur Cotonou et les véhicules affichés
  // sont ceux du centre-ville — mieux qu'un écran vide.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => setMe([pos.coords.longitude, pos.coords.latitude]),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
    );
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  const center = me ?? COTONOU_CENTER;

  const refresh = useCallback(async () => {
    const { data, error } = await supabaseBrowser.rpc('drivers_nearby', {
      p_lat: center[1],
      p_lng: center[0],
      p_radius_km: 5.0,
    });
    if (error || !Array.isArray(data)) return;
    const rows = data as NearbyRow[];
    setTotal(rows[0]?.total_nearby ?? 0);
    setDrivers(
      rows.map((r) => ({
        // Les positions sont arrondies à une grille : la cellule fait une
        // clé stable, le marqueur ne se recrée pas à chaque rafraîchissement.
        driver_id: `${r.lat.toFixed(3)},${r.lng.toFixed(3)}`,
        lat: r.lat,
        lng: r.lng,
        category: r.category ?? undefined,
      })),
    );
  }, [center]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className={`relative ${className}`}>
      <Map
        className="h-full w-full"
        clientLocation={me}
        driversNearby={drivers}
        autoFit={false}
        recenterOn={center}
        recenterKey={recenterKey}
      />

      {total != null && total > 0 && (
        <div className="pointer-events-none absolute left-md top-md inline-flex items-center gap-sm rounded-full bg-white/95 px-md py-xs shadow-md ring-1 ring-neutral-200 backdrop-blur">
          <span className="relative grid h-2 w-2 place-items-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <span
            className="text-xs font-semibold text-neutral-800"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {total} chauffeur{total > 1 ? 's' : ''} à proximité
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setRecenterKey((k) => k + 1)}
        aria-label="Recentrer la carte"
        className="absolute bottom-md right-md grid h-11 w-11 place-items-center rounded-full bg-white text-primary-700 shadow-lg ring-1 ring-neutral-200 transition active:scale-95"
      >
        <CrosshairIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
