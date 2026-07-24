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
  category?: string;
};

export type PendingPickup = {
  ride_id: string;
  lat: number;
  lng: number;
  price_fcfa?: number;
};

const CAR_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M5 17h14M5 17v-4l1.5-4A2 2 0 0 1 8.4 7.7h7.2a2 2 0 0 1 1.9 1.3L19 13v4M5 17v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2M16 17v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2"/>
  <circle cx="8" cy="15" r="0.9" fill="white"/>
  <circle cx="16" cy="15" r="0.9" fill="white"/>
</svg>`;

const MOTO_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="5.5" cy="17" r="2.5"/>
  <circle cx="18.5" cy="17" r="2.5"/>
  <path d="M8 17h6l-2-5h4l-2-4h-3"/>
  <path d="M14 8l2 2"/>
</svg>`;

const TRICYCLE_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 16h4l2-6h9l1 6"/>
  <path d="M9 10V7h4"/>
  <circle cx="5" cy="18" r="1.6"/>
  <circle cx="14" cy="18" r="1.6"/>
  <circle cx="19" cy="18" r="1.6"/>
</svg>`;

function svgForCategory(cat?: string): string {
  if (cat === 'moto') return MOTO_SVG;
  if (cat === 'tricycle') return TRICYCLE_SVG;
  return CAR_SVG;
}

function pinClassForCategory(cat?: string): string {
  if (cat === 'moto') return 'tc-driver-pin moto';
  if (cat === 'tricycle') return 'tc-driver-pin tricycle';
  if (cat === 'confort') return 'tc-driver-pin confort';
  return 'tc-driver-pin';
}

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
  /** Courses en attente (pins pulse rouge/orange, très visibles) */
  pendingPickups?: PendingPickup[];
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
  pendingPickups,
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
  const pickupMarkersRef = useRef<Map<string, mapboxgl.Marker>>(
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
        const el = existing.getElement();
        const nextClass = pinClassForCategory(drv.category);
        if (el.className !== nextClass) {
          el.className = nextClass;
          el.innerHTML = svgForCategory(drv.category);
        }
      } else {
        const el = document.createElement('div');
        el.className = pinClassForCategory(drv.category);
        el.innerHTML = svgForCategory(drv.category);
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([drv.lng, drv.lat])
          .addTo(map);
        driverMarkersRef.current.set(drv.driver_id, marker);
      }
    }
    for (const [id, marker] of Array.from(driverMarkersRef.current.entries())) {
      if (!seen.has(id)) {
        marker.remove();
        driverMarkersRef.current.delete(id);
      }
    }
  }, [driversNearby]);

  // Pins courses en attente (pulse orange/rouge très visibles + badge prix)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();

    for (const p of pendingPickups ?? []) {
      seen.add(p.ride_id);
      const existing = pickupMarkersRef.current.get(p.ride_id);
      if (existing) {
        existing.setLngLat([p.lng, p.lat]);
      } else {
        const el = document.createElement('div');
        el.className = 'tc-pickup-alert';
        el.innerHTML =
          '<div class="tc-alert-pulse"></div>' +
          '<div class="tc-alert-pulse delay-1"></div>' +
          '<div class="tc-alert-dot"></div>' +
          (typeof p.price_fcfa === 'number'
            ? `<div class="tc-alert-badge">${p.price_fcfa.toLocaleString('fr-FR').replace(/,/g, ' ')} F</div>`
            : '');
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
        pickupMarkersRef.current.set(p.ride_id, marker);
      }
    }
    for (const [id, marker] of Array.from(pickupMarkersRef.current.entries())) {
      if (!seen.has(id)) {
        marker.remove();
        pickupMarkersRef.current.delete(id);
      }
    }
  }, [pendingPickups]);

  // Marker chauffeur assigné (vert, plus grand)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    assignedMarkerRef.current?.remove();
    assignedMarkerRef.current = null;
    if (assignedDriver) {
      const el = document.createElement('div');
      el.className = pinClassForCategory(assignedDriver.category) + ' assigned';
      el.innerHTML = svgForCategory(assignedDriver.category);
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
