'use client';

// ============================================================
// Appel audio dans l'application : serveurs STUN / TURN.
//
// Pourquoi la v1 (juillet) a été retirée : « trop instable en conditions
// réelles ». La cause principale tient en deux lettres : sans serveur TURN, un
// appel entre deux téléphones en 4G échoue dès que l'un des deux est derrière
// un NAT d'opérateur (CGNAT) — c'est le cas de presque tous les abonnés mobiles
// béninois. STUN seul ne suffit pas : il faut un relais.
//
// Les identifiants du relais sont lus côté serveur (/api/turn) pour ne jamais
// apparaître dans le code du navigateur ; à défaut de configuration, on retombe
// sur un relais public de dépannage (voir FALLBACK_ICE_SERVERS).
// ============================================================

/** Dépannage seulement : relais public partagé, sans garantie de disponibilité. */
export const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

let cache: { at: number; servers: RTCIceServer[] } | null = null;

/** Serveurs ICE à utiliser : ceux du serveur TamCar (mis en cache 4 min), sinon le dépannage. */
export async function loadIceServers(): Promise<RTCIceServer[]> {
  if (cache && Date.now() - cache.at < 4 * 60_000) return cache.servers;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3_500);
    const res = await fetch('/api/turn', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const body = (await res.json()) as { iceServers?: RTCIceServer[]; configured?: boolean };
      if (body.configured && Array.isArray(body.iceServers) && body.iceServers.length > 0) {
        cache = { at: Date.now(), servers: body.iceServers };
        return body.iceServers;
      }
    }
  } catch {
    /* réseau lent ou route absente : on tente avec le dépannage */
  }
  return FALLBACK_ICE_SERVERS;
}

/** Le navigateur sait-il faire un appel WebRTC audio ? */
export function callsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}
