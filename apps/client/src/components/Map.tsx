'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { COTONOU_CENTER, MAPBOX_TOKEN } from '@/lib/mapbox';

if (typeof window !== 'undefined' && MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

export type DriverPin = {
  driver_id: string;
  lat: number;
  lng: number;
};

type Props = {
  pickup?: [number, number] | null;
  dropoff?: [number, number] | null;
  route?: GeoJSON.LineString | null;
  className?: string;
  /** Si fourni, la carte devient sélectionnable : clic pose un point provisoire ambre et déclenche le callback */
  onMapClick?: (lngLat: [number, number]) => void;
  /** Marker candidate (ambre) pour prévisualiser un point en cours de sélection */
  candidate?: [number, number] | null;
  /** Chauffeurs à afficher (petits pins voiture) */
  driversNearby?: DriverPin[];
  /** Chauffeur assigné (pin voiture plus grand, vert) */
  assignedDriver?: DriverPin | null;
  /** Ne pas ajuster fitBounds automatiquement (utile en mode suivi ride) */
  autoFit?: boolean;
};

export function Map({
  pickup,
  dropoff,
  route,
  className,
  onMapClick,
  candidate,
  driversNearby,
  assignedDriver,
  autoFit = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const candidateMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const driverMarkersRef = useRef<Map<string, mapboxgl.Marker>>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (globalThis as any).Map(),
  );
  const assignedMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // Init map une fois
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: COTONOU_CENTER,
      zoom: 11,
      attributionControl: false,
    });

    map.on('click', (e) => {
      onMapClickRef.current?.([e.lngLat.lng, e.lngLat.lat]);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Curseur crosshair quand on est en mode sélection
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = onMapClick ? 'crosshair' : '';
  }, [onMapClick]);

  // Marker candidate (ambre) — pin provisoire pendant sélection
  useEffect(() => {
    if (!mapRef.current) return;
    candidateMarkerRef.current?.remove();
    candidateMarkerRef.current = null;
    if (candidate) {
      candidateMarkerRef.current = new mapboxgl.Marker({ color: '#EAB308' })
        .setLngLat(candidate)
        .addTo(mapRef.current);
      mapRef.current.flyTo({ center: candidate, zoom: 15, duration: 400 });
    }
  }, [candidate]);

  // Update pickup marker
  useEffect(() => {
    if (!mapRef.current) return;
    pickupMarkerRef.current?.remove();
    pickupMarkerRef.current = null;
    if (pickup) {
      pickupMarkerRef.current = new mapboxgl.Marker({ color: '#2563EB' })
        .setLngLat(pickup)
        .addTo(mapRef.current);
    }
  }, [pickup]);

  // Update dropoff marker
  useEffect(() => {
    if (!mapRef.current) return;
    dropoffMarkerRef.current?.remove();
    dropoffMarkerRef.current = null;
    if (dropoff) {
      dropoffMarkerRef.current = new mapboxgl.Marker({ color: '#8B5CF6' })
        .setLngLat(dropoff)
        .addTo(mapRef.current);
    }
  }, [dropoff]);

  // Fit bounds ou fly (uniquement si autoFit)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !autoFit) return;
    if (pickup && dropoff) {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(pickup);
      bounds.extend(dropoff);
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 800 });
    } else if (pickup) {
      map.flyTo({ center: pickup, zoom: 13, duration: 600 });
    } else if (dropoff) {
      map.flyTo({ center: dropoff, zoom: 13, duration: 600 });
    }
  }, [pickup, dropoff, autoFit]);

  // Pins chauffeurs autour (petits, cyan pâle)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();

    for (const drv of driversNearby ?? []) {
      seen.add(drv.driver_id);
      const existing = driverMarkersRef.current.get(drv.driver_id);
      if (existing) {
        existing.setLngLat([drv.lng, drv.lat]);
      } else {
        // Elément DOM custom : petit rond cyan avec voiture emoji-like
        const el = document.createElement('div');
        el.className = 'tamcar-driver-pin';
        el.style.cssText =
          'width:22px;height:22px;border-radius:50%;background:#06B6D4;border:2px solid white;box-shadow:0 2px 6px rgba(6,182,212,.5);display:grid;place-items:center;color:white;font-size:11px;font-weight:800;';
        el.textContent = '🚗';
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([drv.lng, drv.lat])
          .addTo(map);
        driverMarkersRef.current.set(drv.driver_id, marker);
      }
    }
    // Retirer ceux qui ne sont plus dans la liste
    for (const [id, marker] of driverMarkersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.remove();
        driverMarkersRef.current.delete(id);
      }
    }
  }, [driversNearby]);

  // Marker chauffeur assigné (vert, plus grand)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    assignedMarkerRef.current?.remove();
    assignedMarkerRef.current = null;
    if (assignedDriver) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:34px;height:34px;border-radius:50%;background:#10B981;border:3px solid white;box-shadow:0 4px 12px rgba(16,185,129,.6);display:grid;place-items:center;font-size:18px;';
      el.textContent = '🚗';
      assignedMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([assignedDriver.lng, assignedDriver.lat])
        .addTo(map);
    }
  }, [assignedDriver]);

  // Draw / clear route
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (map.getLayer('route')) map.removeLayer('route');
      if (map.getSource('route')) map.removeSource('route');
      if (route) {
        map.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: route },
        });
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 0.85 },
        });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [route]);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className={`grid place-items-center rounded-xl bg-neutral-100 p-xl text-center ${className || ''}`}
      >
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            Mapbox non configuré
          </p>
          <p className="mt-xs text-xs text-neutral-600">
            Ajoute NEXT_PUBLIC_MAPBOX_TOKEN dans .env.local puis restart le dev server.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className={className} />;
}
