import { supabase } from './supabase';
import type { GeocodeFeature } from './mapbox';

/**
 * Résultat de la fonction Postgres search_places.
 */
export type PlaceRow = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  category_group: string | null;
  lng: number;
  lat: number;
  distance_m: number | null;
  source: 'osm' | 'popular_seed' | 'user_submitted' | 'admin';
  verified: boolean;
  score: number;
};

/**
 * Recherche dans notre base places Supabase (POI Bénin bootstrap OSM +
 * curés admin + crowd-sourced à terme).
 * Full-text tolérant aux accents, trié par verified + similarité + distance.
 */
export async function searchPlaces(
  query: string,
  proximity: [number, number] = [2.42, 6.36],
  limit = 8,
): Promise<PlaceRow[]> {
  if (query.trim().length < 2) return [];

  const { data, error } = await supabase.rpc('search_places', {
    query: query.trim(),
    proximity_lng: proximity[0],
    proximity_lat: proximity[1],
    limit_count: limit,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('search_places error:', error.message);
    return [];
  }
  return (data ?? []) as PlaceRow[];
}

/**
 * Convertit un PlaceRow au format GeocodeFeature unifié (compatible Mapbox).
 * Le place_name est enrichi avec la ville pour désambiguïser.
 */
export function placeToFeature(p: PlaceRow): GeocodeFeature {
  const cityBit = p.city ? `, ${p.city}` : '';
  const districtBit = p.district ? ` (${p.district})` : '';
  return {
    id: `place:${p.id}`,
    place_name: `${p.name}${districtBit}${cityBit}`,
    center: [p.lng, p.lat],
  };
}
