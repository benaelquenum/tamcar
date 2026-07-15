'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { COTONOU_CENTER, MAPBOX_TOKEN } from '@/lib/mapbox';

if (typeof window !== 'undefined' && MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

type Props = {
  pickup?: [number, number] | null;
  dropoff?: [number, number] | null;
  route?: GeoJSON.LineString | null;
  className?: string;
};

export function Map({ pickup, dropoff, route, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Init map une fois
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: COTONOU_CENTER,
      zoom: 11,
      attributionControl: false,
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

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

  // Fit bounds ou fly
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
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
  }, [pickup, dropoff]);

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
