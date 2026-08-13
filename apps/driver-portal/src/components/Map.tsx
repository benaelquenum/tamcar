'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { COTONOU_CENTER, MAPBOX_TOKEN } from '@/lib/mapbox';
import { MAP_ENGINE, maplibreConfigured, maplibreStyle } from '@/lib/map-config';
import { vehicleMarkerSvg } from '@/lib/vehicle-marker';

// Moteur de rendu : MapLibre (Phase 1) ou Mapbox si NEXT_PUBLIC_MAP_ENGINE=mapbox.
// Les deux exposent la même API (Map/Marker/LngLatBounds/addSource/addLayer…) ;
// on type via MapLibre et on caste le module Mapbox dessus.
const GL: typeof maplibregl =
  MAP_ENGINE === 'mapbox' ? (mapboxgl as unknown as typeof maplibregl) : maplibregl;

export type DriverPin = {
  driver_id: string;
  lat: number;
  lng: number;
  category?: string;
  /** `vehicles.color`, texte libre. À défaut : la teinte de la catégorie. */
  color?: string | null;
};

export type PendingPickup = {
  ride_id: string;
  lat: number;
  lng: number;
  price_fcfa?: number;
};

export type StopPin = { lat: number; lng: number; label: number };

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

/**
 * Marqueur d'un véhicule sur la carte. Les silhouettes sont dessinées
 * (lib/vehicle-marker) et non photographiées : à 30 px, une photo réduite
 * devient une tache dont on ne distingue plus l'avant.
 */
function markupForCategory(cat?: string, color?: string | null, size = 30): string {
  return vehicleMarkerSvg({ category: cat, color, size });
}

function pinClassForCategory(_cat?: string): string {
  return 'tc-veh-marker';
}

// Pin départ (vert, pastille pleine) — ancré en bas (pointe sur le lieu).
const DEPART_PIN_SVG =
  '<svg width="30" height="39" viewBox="0 0 32 42" style="display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,.28))">' +
  '<path d="M16 1C8.8 1 3 6.8 3 14c0 9 13 26 13 26s13-17 13-26C29 6.8 23.2 1 16 1Z" fill="#16A34A"/>' +
  '<circle cx="16" cy="14" r="6.5" fill="#fff"/><circle cx="16" cy="14" r="3" fill="#16A34A"/></svg>';
// Pin destination (rouge, drapeau à damier).
const DEST_PIN_SVG =
  '<svg width="30" height="39" viewBox="0 0 32 42" style="display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,.28))">' +
  '<path d="M16 1C8.8 1 3 6.8 3 14c0 9 13 26 13 26s13-17 13-26C29 6.8 23.2 1 16 1Z" fill="#DC2626"/>' +
  '<g transform="translate(10.5,7)">' +
  '<rect x="0" y="0" width="2" height="15" rx="1" fill="#fff"/><rect x="2" y="1" width="11" height="8" fill="#fff"/>' +
  '<rect x="2" y="1" width="2.75" height="2" fill="#DC2626"/><rect x="7.5" y="1" width="2.75" height="2" fill="#DC2626"/>' +
  '<rect x="4.75" y="3" width="2.75" height="2" fill="#DC2626"/><rect x="10.25" y="3" width="2.75" height="2" fill="#DC2626"/>' +
  '<rect x="2" y="5" width="2.75" height="2" fill="#DC2626"/><rect x="7.5" y="5" width="2.75" height="2" fill="#DC2626"/></g></svg>';

function makePinEl(svg: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.lineHeight = '0';
  el.innerHTML = svg;
  return el;
}

// Pin d'escale : teardrop violet numéroté (ancré au sol).
function makeStopEl(n: number): HTMLDivElement {
  const el = document.createElement('div');
  el.style.lineHeight = '0';
  el.innerHTML =
    '<svg width="28" height="36" viewBox="0 0 32 42" style="display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,.28))">' +
    '<path d="M16 1C8.8 1 3 6.8 3 14c0 9 13 26 13 26s13-17 13-26C29 6.8 23.2 1 16 1Z" fill="#8B5CF6"/>' +
    '<circle cx="16" cy="14" r="7.5" fill="#fff"/>' +
    '<text x="16" y="18" text-anchor="middle" font-size="11" font-weight="700" fill="#8B5CF6" font-family="system-ui,sans-serif">' +
    n + '</text></svg>';
  return el;
}

// Marqueur du véhicule suivi : la silhouette pivote vers le cap, l'anneau
// bleu « vous êtes ici » reste fixe autour d'elle.
function makePuckEl(category?: string, self = false, color?: string | null): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'tc-veh-marker' + (self ? ' me' : '');
  el.innerHTML =
    `<span class="tc-veh-nub-rot">${vehicleMarkerSvg({ category, color, self, size: 34 })}</span>`;
  return el;
}

// Pion « moi » hors course : un point + un signal qui émane de lui (radar).
function makeBeaconEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'tc-self-beacon';
  el.innerHTML =
    '<span class="tc-beacon-ring"></span>' +
    '<span class="tc-beacon-ring d1"></span>' +
    '<span class="tc-beacon-ring d2"></span>' +
    '<span class="tc-beacon-dot"></span>';
  return el;
}

// Cap (°) entre 2 points [lng,lat] — 0 = nord, sens horaire.
function bearingDeg(a: [number, number], b: [number, number]): number {
  const toR = (x: number) => (x * Math.PI) / 180;
  const toD = (x: number) => (x * 180) / Math.PI;
  const y = Math.sin(toR(b[0] - a[0])) * Math.cos(toR(b[1]));
  const x =
    Math.cos(toR(a[1])) * Math.sin(toR(b[1])) -
    Math.sin(toR(a[1])) * Math.cos(toR(b[1])) * Math.cos(toR(b[0] - a[0]));
  return (toD(Math.atan2(y, x)) + 360) % 360;
}
function metersBetween(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b[1] - a[1]);
  const dLng = toR(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a[1])) * Math.cos(toR(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

type Props = {
  pickup?: [number, number] | null;
  dropoff?: [number, number] | null;
  route?: GeoJSON.LineString | null;
  /** Escales (arrêts) à matérialiser — pins violets numérotés. */
  stops?: StopPin[];
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
  /** Position du chauffeur lui-même → pion « moi » (pastille bleue + halo). */
  selfLocation?: [number, number] | null;
  /** Catégorie du véhicule du chauffeur (silhouette du pion « moi »). */
  selfCategory?: string;
  /** Position live du client (vue chauffeur) — pion cyan pulsant. */
  clientLocation?: [number, number] | null;
  /** Rendu du pion « moi » en beacon (point + signal) au lieu de la pastille véhicule. */
  selfBeacon?: boolean;
  /**
   * Mode NAVIGATION : la caméra suit cette position et pivote pour garder le
   * sens de marche vers le haut de l'écran (le curseur, lui, reste fixe —
   * les markers GL ne tournent pas avec la carte). Prime sur autoFit.
   * Repasser à null → cap remis au nord + retour aux recadrages classiques.
   */
  follow?: [number, number] | null;
};

// Cap (bearing) entre deux points, en degrés 0-360.
function navBearing(a: [number, number], b: [number, number]): number {
  const toRad = Math.PI / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLng = (lng2 - lng1) * toRad;
  const y = Math.sin(dLng) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLng);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function navMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function Map({
  pickup,
  dropoff,
  route,
  stops,
  className,
  onMapClick,
  candidate,
  driversNearby,
  pendingPickups,
  assignedDriver,
  autoFit = true,
  pickupPulse = false,
  selfLocation,
  selfCategory,
  clientLocation,
  selfBeacon,
  follow = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const followPrevRef = useRef<[number, number] | null>(null);
  const followBearingRef = useRef(0);
  const pickupMarkerRef = useRef<maplibregl.Marker | null>(null);
  const dropoffMarkerRef = useRef<maplibregl.Marker | null>(null);
  const candidateMarkerRef = useRef<maplibregl.Marker | null>(null);
  const driverMarkersRef = useRef<Map<string, maplibregl.Marker>>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (globalThis as any).Map(),
  );
  const stopMarkersRef = useRef<Map<string, maplibregl.Marker>>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (globalThis as any).Map(),
  );
  const pickupMarkersRef = useRef<Map<string, maplibregl.Marker>>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (globalThis as any).Map(),
  );
  const assignedMarkerRef = useRef<maplibregl.Marker | null>(null);
  const selfMarkerRef = useRef<maplibregl.Marker | null>(null);
  const selfPosRef = useRef<[number, number] | null>(null);
  const selfTargetRef = useRef<[number, number] | null>(null);
  const selfRafRef = useRef<number | null>(null);
  const clientMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // Init map une fois
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let style: string | StyleSpecification;
    if (MAP_ENGINE === 'mapbox') {
      if (!MAPBOX_TOKEN) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      style = 'mapbox://styles/mapbox/streets-v12';
    } else {
      if (!maplibreConfigured()) return;
      style = maplibreStyle();
    }

    const map = new GL.Map({
      container: containerRef.current,
      style,
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
      candidateMarkerRef.current = new GL.Marker({ color: '#EAB308' })
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
      pickupMarkerRef.current = new GL.Marker({ element: el, anchor: 'center' })
        .setLngLat(pickup)
        .addTo(mapRef.current);
    } else {
      pickupMarkerRef.current = new GL.Marker({ element: makePinEl(DEPART_PIN_SVG), anchor: 'bottom' })
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
      dropoffMarkerRef.current = new GL.Marker({ element: makePinEl(DEST_PIN_SVG), anchor: 'bottom' })
        .setLngLat(dropoff)
        .addTo(mapRef.current);
    }
  }, [dropoff]);

  // Marqueurs d'escale (pins violets numérotés).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const s of stops ?? []) {
      const key = `${s.label}:${s.lat.toFixed(6)}:${s.lng.toFixed(6)}`;
      seen.add(key);
      if (!stopMarkersRef.current.has(key)) {
        const m = new GL.Marker({ element: makeStopEl(s.label), anchor: 'bottom' })
          .setLngLat([s.lng, s.lat])
          .addTo(map);
        stopMarkersRef.current.set(key, m);
      }
    }
    for (const [k, m] of Array.from(stopMarkersRef.current.entries())) {
      if (!seen.has(k)) { m.remove(); stopMarkersRef.current.delete(k); }
    }
  }, [stops]);

  // Fit bounds ou fly (uniquement si autoFit, et hors mode navigation)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !autoFit || follow) return;
    if (pickup && dropoff) {
      const bounds = new GL.LngLatBounds();
      bounds.extend(pickup);
      bounds.extend(dropoff);
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 800 });
    } else if (pickup) {
      map.flyTo({ center: pickup, zoom: 13, duration: 600 });
    } else if (dropoff) {
      map.flyTo({ center: dropoff, zoom: 13, duration: 600 });
    }
  }, [pickup, dropoff, autoFit, follow]);

  // Mode NAVIGATION : caméra collée à la position suivie, carte pivotée pour
  // garder le sens de marche vers le haut (cap lissé, recalculé après ≥ 8 m
  // de déplacement pour éviter les rotations parasites à l'arrêt).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!follow) {
      if (followPrevRef.current) {
        followPrevRef.current = null;
        // Fin de course : cap remis au nord, la vue d'ensemble reprend la main.
        map.easeTo({ bearing: 0, pitch: 0, duration: 700 });
      }
      return;
    }
    const prev = followPrevRef.current;
    let bearing = followBearingRef.current;
    if (prev && navMeters(prev, follow) >= 8) {
      bearing = navBearing(prev, follow);
      followBearingRef.current = bearing;
      followPrevRef.current = follow;
    } else if (!prev) {
      followPrevRef.current = follow;
    }
    map.easeTo({
      center: follow,
      bearing,
      zoom: Math.max(map.getZoom(), 16),
      duration: 800,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow]);

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
          el.innerHTML = markupForCategory(drv.category, drv.color);
        }
      } else {
        const el = document.createElement('div');
        el.className = pinClassForCategory(drv.category);
        el.innerHTML = markupForCategory(drv.category, drv.color);
        const marker = new GL.Marker({ element: el, anchor: 'center' })
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
        const marker = new GL.Marker({ element: el, anchor: 'center' })
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
      el.innerHTML = markupForCategory(assignedDriver.category, assignedDriver.color, 34);
      assignedMarkerRef.current = new GL.Marker({ element: el, anchor: 'center' })
        .setLngLat([assignedDriver.lng, assignedDriver.lat])
        .addTo(map);
    }
  }, [assignedDriver]);

  // Pion « MOI » (position du chauffeur) : pastille bleue à halo, qui glisse
  // en douceur. Recentre la carte à la première apparition (repérage immédiat).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selfLocation) {
      if (selfRafRef.current != null) { cancelAnimationFrame(selfRafRef.current); selfRafRef.current = null; }
      selfMarkerRef.current?.remove();
      selfMarkerRef.current = null;
      selfPosRef.current = null;
      selfTargetRef.current = null;
      return;
    }

    const target: [number, number] = selfLocation;

    if (!selfMarkerRef.current) {
      const el = selfBeacon ? makeBeaconEl() : makePuckEl(selfCategory, true);
      selfMarkerRef.current = new GL.Marker({ element: el, anchor: 'center' })
        .setLngLat(target)
        .addTo(map);
      selfPosRef.current = target;
      selfTargetRef.current = target;
      map.flyTo({ center: target, zoom: Math.max(map.getZoom(), 14), duration: 500 });
      return;
    }

    const prev = selfTargetRef.current;
    if (prev && prev[0] === target[0] && prev[1] === target[1]) return;
    selfTargetRef.current = target;

    const from = selfPosRef.current ?? target;
    if (metersBetween(from, target) > 3) {
      const rot = selfMarkerRef.current.getElement().querySelector('.tc-veh-nub-rot') as HTMLElement | null;
      if (rot) rot.style.transform = `rotate(${bearingDeg(from, target)}deg)`;
    }

    if (selfRafRef.current != null) cancelAnimationFrame(selfRafRef.current);
    const startT = performance.now();
    const DUR = 900;
    const step = (now: number) => {
      const p = Math.min(1, (now - startT) / DUR);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const lng = from[0] + (target[0] - from[0]) * e;
      const lat = from[1] + (target[1] - from[1]) * e;
      selfMarkerRef.current?.setLngLat([lng, lat]);
      selfPosRef.current = [lng, lat];
      if (p < 1) selfRafRef.current = requestAnimationFrame(step);
      else selfRafRef.current = null;
    };
    selfRafRef.current = requestAnimationFrame(step);

    return () => {
      if (selfRafRef.current != null) { cancelAnimationFrame(selfRafRef.current); selfRafRef.current = null; }
    };
  }, [selfLocation, selfCategory, selfBeacon]);

  // Pion client live (vue chauffeur) — point cyan pulsant.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!clientLocation) {
      clientMarkerRef.current?.remove();
      clientMarkerRef.current = null;
      return;
    }
    if (!clientMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'tc-client-live';
      el.innerHTML =
        '<div class="tc-client-pulse"></div>' +
        '<div class="tc-client-pulse delay-1"></div>' +
        '<div class="tc-client-dot"></div>';
      clientMarkerRef.current = new GL.Marker({ element: el, anchor: 'center' })
        .setLngLat(clientLocation)
        .addTo(map);
    } else {
      clientMarkerRef.current.setLngLat(clientLocation);
    }
  }, [clientLocation]);

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

  const notConfigured =
    MAP_ENGINE === 'mapbox' ? !MAPBOX_TOKEN : !maplibreConfigured();
  if (notConfigured) {
    return (
      <div
        className={`grid place-items-center rounded-xl bg-neutral-100 p-xl text-center ${className || ''}`}
      >
        <div>
          <p className="text-sm font-semibold text-neutral-900">Carte non configurée</p>
          <p className="mt-xs text-xs text-neutral-600">
            {MAP_ENGINE === 'mapbox'
              ? 'Ajoute NEXT_PUBLIC_MAPBOX_TOKEN dans .env.local puis relance le serveur.'
              : 'Ajoute NEXT_PUBLIC_MAP_PMTILES_URL (ou NEXT_PUBLIC_MAP_STYLE_URL) puis relance le serveur.'}
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className={className} />;
}
