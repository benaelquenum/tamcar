import { supabase } from './supabase';
import { supabaseBrowser } from './supabase-browser';
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
  source: 'osm' | 'popular_seed' | 'user_submitted' | 'admin' | 'overture';
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
  return {
    id: `place:${p.id}`,
    place_name: placeLabel(p),
    center: [p.lng, p.lat],
  };
}

function sameName(a: string, b: string): boolean {
  const n = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return n(a) === n(b);
}

/**
 * Libellé complet d'un lieu : « Nom, Quartier, Ville » (ex. « 4Q, Mènontin, Cotonou »).
 * Le quartier est omis s'il est inconnu ou identique au nom du lieu ou à la ville.
 */
export function placeLabel(p: Pick<PlaceRow, 'name' | 'district' | 'city'>): string {
  const parts = [p.name];
  if (p.district && !sameName(p.district, p.name) && !sameName(p.district, p.city ?? '')) parts.push(p.district);
  if (p.city && !sameName(p.city, p.name)) parts.push(p.city);
  return parts.join(', ');
}

export type RecentAddress = {
  address: string;
  lat: number;
  lng: number;
  last_used_at: string;
  usage_count: number;
};

/**
 * Récupère les X dernières adresses (pickup + dropoff) du user connecté.
 * Retourne [] si non authentifié ou aucun historique.
 */
export async function fetchRecentAddresses(limit = 8): Promise<RecentAddress[]> {
  const { data, error } = await supabaseBrowser.rpc('recent_addresses_for_user', {
    limit_count: limit,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('recent_addresses_for_user error:', error.message);
    return [];
  }
  return (data ?? []) as RecentAddress[];
}

/** Convertit une RecentAddress au format GeocodeFeature */
export function recentToFeature(r: RecentAddress): GeocodeFeature {
  return {
    id: `recent:${r.address}`,
    place_name: r.address,
    center: [r.lng, r.lat],
  };
}
