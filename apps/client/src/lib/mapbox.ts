/**
 * Helpers Mapbox : token, geocoding, routing.
 * Token public (pk.*) — safe côté client (visible dans le bundle).
 */

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/** Centre par défaut de la carte : Cotonou */
export const COTONOU_CENTER: [number, number] = [2.42, 6.36];

export type GeocodeFeature = {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat] convention Mapbox
};

/**
 * Autocomplete d'adresses via Mapbox Geocoding v6.
 * Filtré au Bénin (`country=bj`), proximité Cotonou par défaut, français.
 */
export async function geocode(
  query: string,
  proximity: [number, number] = COTONOU_CENTER,
): Promise<GeocodeFeature[]> {
  if (!MAPBOX_TOKEN) {
    // eslint-disable-next-line no-console
    console.warn('Mapbox token missing — geocoding disabled');
    return [];
  }
  if (query.trim().length < 2) return [];

  const params = new URLSearchParams({
    q: query,
    access_token: MAPBOX_TOKEN,
    country: 'bj',
    language: 'fr',
    limit: '5',
    proximity: `${proximity[0]},${proximity[1]}`,
    autocomplete: 'true',
  });

  const res = await fetch(
    `https://api.mapbox.com/search/geocode/v6/forward?${params}`,
  );
  if (!res.ok) return [];

  const data = await res.json();
  return ((data.features as unknown[]) || []).map((raw) => {
    const f = raw as {
      id?: string;
      properties?: { full_address?: string; name?: string; place_formatted?: string };
      geometry?: { coordinates?: [number, number] };
    };
    return {
      id: f.id ?? Math.random().toString(36),
      place_name:
        f.properties?.full_address ||
        f.properties?.place_formatted ||
        f.properties?.name ||
        '',
      center: f.geometry?.coordinates ?? [0, 0],
    } satisfies GeocodeFeature;
  });
}

export type RouteResult = {
  distance_km: number;
  duration_min: number;
  geometry: GeoJSON.LineString;
};

/**
 * Calcule la route routière (driving) entre 2 points via Mapbox Directions API.
 * Retourne distance (km), duration (min), geometry pour tracer sur la carte.
 */
export async function getRoute(
  from: [number, number],
  to: [number, number],
): Promise<RouteResult | null> {
  if (!MAPBOX_TOKEN) return null;

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;

  return {
    distance_km: route.distance / 1000,
    duration_min: Math.max(1, Math.round(route.duration / 60)),
    geometry: route.geometry as GeoJSON.LineString,
  };
}
