import { getRouteThrough } from './mapbox';
import { supabaseBrowser } from './supabase-browser';

export type LngLat = [number, number];

/** Nombre maximum d'arrêts par course (même valeur côté base : create_ride / add_ride_stop). */
export const MAX_STOPS = 5;

export type RouteChangeQuote = {
  current_total_fcfa: number;
  new_total_fcfa: number;
  delta_fcfa: number;
  driver_share_fcfa: number;
};

/**
 * Nouveaux totaux (km, minutes) d'une course dont l'itinéraire change.
 *
 * Avant le départ (ou sans position du véhicule) : l'itinéraire complet,
 * départ → arrêts → destination, recalculé d'un trait.
 *
 * Course démarrée : la partie déjà roulée ne change pas. On calcule donc ce
 * qui RESTE à faire depuis la position du véhicule — avec l'ancien puis le
 * nouvel itinéraire — et on applique la différence aux totaux de la course.
 * (Recalculer depuis le départ ferait payer un arrêt « derrière » le
 * véhicule comme s'il était devant, ou ignorerait un détour déjà engagé.)
 */
export async function projectTotals(args: {
  rideKm: number;
  rideMin: number;
  inProgress: boolean;
  vehicle: LngLat | null;
  pickup: LngLat;
  /** Arrêts encore à faire (pending / accepted), dans l'ordre, AVANT la modification. */
  oldStops: LngLat[];
  oldDropoff: LngLat;
  /** Arrêts encore à faire APRÈS la modification. */
  newStops: LngLat[];
  newDropoff: LngLat;
}): Promise<{ km: number; min: number }> {
  const { rideKm, rideMin, inProgress, vehicle, pickup, oldStops, oldDropoff, newStops, newDropoff } = args;

  if (!inProgress || !vehicle) {
    const r = await getRouteThrough([pickup, ...newStops, newDropoff]);
    if (!r) throw new Error('Impossible de calculer le nouvel itinéraire.');
    return { km: r.distance_km, min: r.duration_min };
  }

  const [oldRem, newRem] = await Promise.all([
    getRouteThrough([vehicle, ...oldStops, oldDropoff]),
    getRouteThrough([vehicle, ...newStops, newDropoff]),
  ]);
  if (!oldRem || !newRem) throw new Error('Impossible de calculer le nouvel itinéraire.');
  return {
    km: Math.max(0.1, rideKm + (newRem.distance_km - oldRem.distance_km)),
    min: Math.max(1, Math.round(rideMin + (newRem.duration_min - oldRem.duration_min))),
  };
}

/** Prix que la course aurait après la modification — le client le voit AVANT de confirmer. */
export async function quoteRouteChange(
  rideId: string,
  km: number,
  min: number,
  newDropoff?: LngLat,
): Promise<RouteChangeQuote> {
  const { data, error } = await supabaseBrowser.rpc('quote_ride_route_change', {
    p_ride_id: rideId,
    p_new_total_km: Number(km.toFixed(2)),
    p_new_total_min: Math.round(min),
    ...(newDropoff ? { p_new_dropoff_lat: newDropoff[1], p_new_dropoff_lng: newDropoff[0] } : {}),
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Prix indisponible.');
  return row as RouteChangeQuote;
}
