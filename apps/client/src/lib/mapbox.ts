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

/**
 * Reverse geocoding : coordonnées → adresse la plus proche.
 * Utilisé pour transformer une position GPS en adresse lisible.
 */
export async function reverseGeocode(
  lng: number,
  lat: number,
): Promise<GeocodeFeature | null> {
  if (!MAPBOX_TOKEN) return null;

  const params = new URLSearchParams({
    longitude: String(lng),
    latitude: String(lat),
    access_token: MAPBOX_TOKEN,
    language: 'fr',
  });
  const res = await fetch(
    `https://api.mapbox.com/search/geocode/v6/reverse?${params}`,
  );
  if (!res.ok) return null;

  const data = await res.json();
  const raw = data.features?.[0];
  if (!raw) return null;

  const f = raw as {
    id?: string;
    properties?: { full_address?: string; name?: string; place_formatted?: string };
    geometry?: { coordinates?: [number, number] };
  };
  return {
    id: f.id ?? 'reverse',
    place_name:
      f.properties?.full_address ||
      f.properties?.place_formatted ||
      f.properties?.name ||
      'Ma position',
    center: f.geometry?.coordinates ?? [lng, lat],
  };
}

/**
 * Lieux populaires du Bénin (Cotonou / Porto-Novo / axes principaux).
 * Sert de raccourcis d'accès dans l'autocomplete pour compenser la
 * couverture limitée du géocodage Mapbox au Bénin.
 * À terme, à migrer dans une table Supabase `places` éditable admin.
 */
export type PopularPlace = {
  id: string;
  name: string;
  short: string; // affichage court dans les chips
  city: 'Cotonou' | 'Porto-Novo' | 'Abomey-Calavi' | 'Sèmè-Kpodji';
  center: [number, number]; // [lng, lat]
};

export const BENIN_POPULAR_PLACES: PopularPlace[] = [
  // Cotonou
  { id: 'cotonou-airport', name: 'Aéroport Cadjèhoun', short: 'Aéroport', city: 'Cotonou', center: [2.3844, 6.3573] },
  { id: 'cotonou-tokpa', name: 'Marché Dantokpa (Tokpa)', short: 'Dantokpa', city: 'Cotonou', center: [2.4258, 6.3654] },
  { id: 'cotonou-etoile-rouge', name: 'Étoile Rouge', short: 'Étoile Rouge', city: 'Cotonou', center: [2.4183, 6.3708] },
  { id: 'cotonou-jonquet', name: 'Gare routière de Jonquet', short: 'Jonquet', city: 'Cotonou', center: [2.4102, 6.3644] },
  { id: 'cotonou-fidjrosse', name: 'Plage de Fidjrossè', short: 'Fidjrossè', city: 'Cotonou', center: [2.3775, 6.3608] },
  { id: 'cotonou-cadjehoun', name: 'Cadjèhoun', short: 'Cadjèhoun', city: 'Cotonou', center: [2.3892, 6.3565] },
  { id: 'cotonou-akpakpa', name: 'Akpakpa', short: 'Akpakpa', city: 'Cotonou', center: [2.4440, 6.3628] },
  { id: 'cotonou-erevan', name: 'Zone Erevan', short: 'Erevan', city: 'Cotonou', center: [2.4152, 6.3617] },

  // Porto-Novo
  { id: 'pn-assemblee', name: 'Ancien siège Assemblée nationale', short: 'Assemblée PN', city: 'Porto-Novo', center: [2.6030, 6.4970] },
  { id: 'pn-ouando', name: 'Marché Ouando', short: 'Ouando', city: 'Porto-Novo', center: [2.6165, 6.4830] },
  { id: 'pn-songhai', name: 'Centre Songhaï', short: 'Songhaï', city: 'Porto-Novo', center: [2.6210, 6.4620] },
  { id: 'pn-catchi', name: 'Catchi', short: 'Catchi', city: 'Porto-Novo', center: [2.6110, 6.4948] },

  // Abomey-Calavi
  { id: 'ac-univ', name: 'Université Abomey-Calavi (UAC)', short: 'UAC', city: 'Abomey-Calavi', center: [2.3392, 6.4147] },
  { id: 'ac-godomey', name: 'Godomey', short: 'Godomey', city: 'Abomey-Calavi', center: [2.3450, 6.3820] },

  // Sèmè-Kpodji (axe corridor)
  { id: 'sk-frontiere', name: 'Frontière Sèmè-Kraké', short: 'Sèmè frontière', city: 'Sèmè-Kpodji', center: [2.6870, 6.3620] },
];

export function popularPlaceToFeature(p: PopularPlace): GeocodeFeature {
  return {
    id: p.id,
    place_name: `${p.name}, ${p.city}, Bénin`,
    center: p.center,
  };
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
