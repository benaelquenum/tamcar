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

const CAR_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M5 17h14M5 17v-4l1.5-4A2 2 0 0 1 8.4 7.7h7.2a2 2 0 0 1 1.9 1.3L19 13v4M5 17v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2M16 17v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2"/>
  <circle cx="8" cy="15" r="0.9" fill="white"/>
  <circle cx="16" cy="15" r="0.9" fill="white"/>
</svg>`;

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
  /** Anime le pin pickup (cercles pulse) — actif pendant la recherche d'un chauffeur */
  pickupPulse?: boolean;
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
  pickupPulse = false,
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

  // Update pickup marker (mode pulse OU mode standard bleu)
  useEffect(() => {
    if (!mapRef.current) return;
    pickupMarkerRef.current?.remove();
    pickupMarkerRef.current = null;
    if (!pickup) return;

    if (pickupPulse) {
      const el = document.createElement('div');
      el.className = 'tc-pickup-searching';
      el.innerHTML =
        '<div class="tc-pulse"></div>' +
        '<div class="tc-pulse delay-1"></div>' +
        '<div class="tc-pulse delay-2"></div>' +
        '<div class="tc-pickup-dot"></div>';
      pickupMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(pickup)
        .addTo(mapRef.current);
    } else {
      pickupMarkerRef.current = new mapboxgl.Marker({ color: '#2563EB' })
        .setLngLat(pickup)
        .addTo(mapRef.current);
    }
  }, [pickup, pickupPulse]);

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
        const el = document.createElement('div');
        el.className = 'tc-driver-pin';
        el.innerHTML = CAR_SVG;
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
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
      el.className = 'tc-driver-pin assigned';
      el.innerHTML = CAR_SVG;
      assignedMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
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
