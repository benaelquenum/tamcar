// ============================================================
// Google Places (New) — Text Search + Geocoding API
//
// Utilisé en fallback quand la base TamCar POI ne trouve pas assez
// de résultats. Meilleur que Mapbox sur les POI locaux du Bénin
// (églises, marchés, quartiers, écoles).
//
// Config : NEXT_PUBLIC_GOOGLE_MAPS_KEY doit être une clé API avec
// les APIs "Places API (New)" et "Geocoding API" activées.
// Restreindre la clé par HTTP referrer (*.vercel.app + localhost).
// ============================================================

import type { GeocodeFeature } from './mapbox';

const KEY =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY : undefined;

const BENIN_REGION = 'BJ';
const LANG = 'fr';

/** Text Search : un seul appel qui renvoie label + lat/lng.
 *  Plus simple / moins coûteux que Autocomplete + Details en cascade. */
export async function googlePlacesSearch(
  query: string,
  bias: [number, number], // [lng, lat] — Cotonou par défaut
  limit = 8,
): Promise<GeocodeFeature[]> {
  if (!KEY || query.trim().length < 2) return [];
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask':
          'places.id,places.formattedAddress,places.displayName,places.location',
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: LANG,
        includedRegionCodes: [BENIN_REGION],
        locationBias: {
          circle: {
            center: { latitude: bias[1], longitude: bias[0] },
            radius: 50000, // 50 km autour du point de biais
          },
        },
        pageSize: Math.min(limit, 20),
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      places?: Array<{
        id: string;
        formattedAddress?: string;
        displayName?: { text?: string };
        location?: { latitude: number; longitude: number };
      }>;
    };
    return (data.places ?? [])
      .filter((p) => p.location)
      .map((p) => ({
        id: `gplaces:${p.id}`,
        place_name:
          p.formattedAddress ||
          p.displayName?.text ||
          'Lieu sans nom',
        center: [p.location!.longitude, p.location!.latitude] as [number, number],
      }));
  } catch {
    return [];
  }
}

/** Reverse geocoding via la Geocoding API classique.
 *  Renvoie null si la clé n'est pas configurée. */
export async function googleReverseGeocode(
  lng: number,
  lat: number,
): Promise<GeocodeFeature | null> {
  if (!KEY) return null;
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('language', LANG);
    url.searchParams.set('region', BENIN_REGION.toLowerCase());
    url.searchParams.set('key', KEY);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ place_id: string; formatted_address: string }>;
    };
    const first = data.results?.[0];
    if (!first) return null;
    return {
      id: `gplaces:${first.place_id}`,
      place_name: first.formatted_address,
      center: [lng, lat],
    };
  } catch {
    return null;
  }
}

export function googlePlacesConfigured(): boolean {
  return Boolean(KEY);
}
