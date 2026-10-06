'use client';

// ============================================================
// Remontée de la position du chauffeur, avec cadence limitée.
//
// Le GPS natif (distanceFilter 15 m) rappelait driver_update_location à CHAQUE
// point — environ une requête toutes les 2 s en roulant — et le suivi web
// diffusait chaque fix. Le client, lui, n'a pas besoin de plus d'une
// position toutes les quelques secondes pour voir le véhicule avancer, et la
// base d'une écriture toutes les 15 s. Ce module est le point de passage
// unique : la cadence se règle ici.
// ============================================================

import { supabaseBrowser } from './supabase-browser';
import { haversine, type LngLat } from './navRoute';

/** En course : une écriture en base au plus toutes les 15 s. */
const RIDE_DB_MIN_MS = 15_000;
/** En ligne sans course : 20 s mini, et seulement si le chauffeur a bougé de 30 m (ou 2 min sans bouger). */
const IDLE_DB_MIN_MS = 20_000;
const IDLE_DB_STILL_MS = 120_000;
const IDLE_DB_MIN_MOVE_M = 30;
/** Diffusion temps réel vers le client : une position toutes les 3 s. */
const BROADCAST_MIN_MS = 3_000;
/** Fix grossier (réseau, GPS pas encore accroché) : ignoré tant qu'une position récente existe. */
const MAX_ACCURACY_M = 100;
const COARSE_KEEP_MS = 5 * 60_000;
/** Position précise qui remplace une position imprécise : écrite sans attendre la cadence ni un déplacement. */
const GOOD_ACCURACY_M = 40;
const BAD_ACCURACY_M = 60;

let lastDbAt = 0;
let lastDbPos: LngLat | null = null;
let lastDbAcc: number | null = null;
let lastBroadcastAt = 0;

export type UplinkMode = 'ride' | 'idle';

/** Enregistre la position en base, si la cadence le permet. Renvoie true si l'appel est parti. */
export function writeDriverLocation(
  lng: number,
  lat: number,
  mode: UplinkMode = 'ride',
  accuracy?: number | null,
): boolean {
  const now = Date.now();
  const since = now - lastDbAt;
  const acc = accuracy != null && Number.isFinite(accuracy) ? accuracy : null;

  // Un fix grossier (150 m ou plus) n'écrase pas une position déjà enregistrée récemment : le matching et le
  // client verraient le chauffeur à côté de sa vraie place. Il n'est accepté qu'à défaut de toute position.
  if (acc !== null && acc > MAX_ACCURACY_M && lastDbAt && since < COARSE_KEEP_MS) return false;

  // Position devenue précise alors que la dernière écrite était imprécise : on corrige tout de suite.
  const improved = acc !== null && acc <= GOOD_ACCURACY_M && lastDbAcc !== null && lastDbAcc > BAD_ACCURACY_M && since >= 3_000;

  if (!improved) {
    if (mode === 'ride') {
      if (since < RIDE_DB_MIN_MS) return false;
    } else {
      if (since < IDLE_DB_MIN_MS) return false;
      if (lastDbPos && since < IDLE_DB_STILL_MS && haversine(lastDbPos, [lng, lat]) < IDLE_DB_MIN_MOVE_M) {
        return false;
      }
    }
  }
  lastDbAt = now;
  lastDbPos = [lng, lat];
  lastDbAcc = acc;
  void supabaseBrowser.rpc('driver_update_location', { current_lng: lng, current_lat: lat });
  return true;
}

type Sender = { send: (msg: { type: 'broadcast'; event: string; payload: unknown }) => unknown };

/** Diffuse la position au client via le canal temps réel, au plus toutes les 3 s. */
export function broadcastDriverPos(channel: Sender | null | undefined, lng: number, lat: number): boolean {
  if (!channel) return false;
  const now = Date.now();
  if (now - lastBroadcastAt < BROADCAST_MIN_MS) return false;
  lastBroadcastAt = now;
  channel.send({ type: 'broadcast', event: 'driver-pos', payload: { lng, lat } });
  return true;
}
