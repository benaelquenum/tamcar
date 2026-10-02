'use client';

// ============================================================
// Compteur de data de TamCar Pro.
//
// Pourquoi : les chauffeurs paient leur forfait (200-300 F/jour) et coupent
// leurs données pendant la course. Avant de négocier avec un opérateur ou de
// dimensionner une SIM, il faut savoir CE QUE TamCar Pro consomme vraiment.
//
// Comment : on compte les octets qui passent par fetch() et WebSocket (API
// Supabase, navigation, temps réel), par catégorie, et on estime les tuiles
// de carte (chargées par un worker, hors de portée de fetch). Les totaux du
// jour restent dans localStorage et remontent au serveur (RPC
// report_driver_data_usage) pour faire des moyennes sur tous les chauffeurs.
//
// Les valeurs sont des ESTIMATIONS « sur le fil » : Content-Length quand il
// existe (octets compressés réels), sinon taille du corps avec un facteur de
// compression, plus un forfait d'en-têtes HTTP/2. Précis à ±20 %, ce qui
// suffit pour comparer avant/après et chiffrer un forfait.
// ============================================================

import { supabaseBrowser } from './supabase-browser';

export type DataCategory = 'api' | 'nav' | 'tiles' | 'realtime' | 'other';

export type DataCounters = Record<DataCategory, number> & { tileRequests: number };

const KEY_PREFIX = 'tc_data:';
/** Taille moyenne estimée d'une tuile vectorielle (octets compressés). */
const TILE_BYTES_ESTIMATE = 25_000;
/** En-têtes HTTP/2 + TLS d'une requête, après compression HPACK. */
const REQUEST_OVERHEAD = 300;
const RESPONSE_OVERHEAD = 250;

const EMPTY: DataCounters = { api: 0, nav: 0, tiles: 0, realtime: 0, other: 0, tileRequests: 0 };

let counters: DataCounters = { ...EMPTY };
let currentDay = '';
let dirty = false;
let installed = false;
const listeners = new Set<() => void>();

/** Jour au Bénin (UTC+1) au format YYYY-MM-DD. */
function dayOf(date = new Date()): string {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: 'Africa/Porto-Novo' });
  } catch {
    return new Date(date.getTime() + 3_600_000).toISOString().slice(0, 10);
  }
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* stockage plein ou bloqué : le compteur reste en mémoire */
  }
}

function parseCounters(raw: string | null): DataCounters {
  if (!raw) return { ...EMPTY };
  try {
    const o = JSON.parse(raw) as Partial<DataCounters>;
    return {
      api: Number(o.api) || 0,
      nav: Number(o.nav) || 0,
      tiles: Number(o.tiles) || 0,
      realtime: Number(o.realtime) || 0,
      other: Number(o.other) || 0,
      tileRequests: Number(o.tileRequests) || 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

function rollDayIfNeeded(): void {
  const d = dayOf();
  if (d === currentDay) return;
  if (currentDay) persist();
  currentDay = d;
  counters = parseCounters(safeGet(KEY_PREFIX + d));
  notify();
}

function persist(): void {
  if (!currentDay) return;
  safeSet(KEY_PREFIX + currentDay, JSON.stringify(counters));
  dirty = false;
}

function notify(): void {
  listeners.forEach((l) => l());
}

export function addBytes(cat: DataCategory, bytes: number): void {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  rollDayIfNeeded();
  counters[cat] += Math.round(bytes);
  dirty = true;
}

/** Appelé par la carte à chaque tuile chargée (estimation). */
export function addTileEstimate(count = 1): void {
  rollDayIfNeeded();
  counters.tiles += count * TILE_BYTES_ESTIMATE;
  counters.tileRequests += count;
  dirty = true;
}

export function getTodayCounters(): DataCounters {
  rollDayIfNeeded();
  return { ...counters };
}

export function totalBytes(c: DataCounters): number {
  return c.api + c.nav + c.tiles + c.realtime + c.other;
}

export function subscribeMeter(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function formatBytes(n: number): string {
  if (n < 1_000) return `${Math.round(n)} o`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(0)} Ko`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} Mo`;
  return `${(n / 1_000_000_000).toFixed(2).replace('.', ',')} Go`;
}

// ------------------------------------------------------------
// Classement d'une URL
// ------------------------------------------------------------
function hostOf(url: string): string {
  try {
    return new URL(url, window.location.href).host;
  } catch {
    return '';
  }
}

const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host;
  } catch {
    return '';
  }
})();

const PMTILES_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_MAP_PMTILES_URL ?? '').host;
  } catch {
    return '';
  }
})();

export function categorize(url: string): DataCategory {
  const host = hostOf(url);
  if (!host) return 'other';
  if ((SUPABASE_HOST && host === SUPABASE_HOST) || host.endsWith('.supabase.co')) return 'api';
  if (host.endsWith('mapbox.com')) {
    if (url.includes('/directions/')) return 'nav';
    if (url.includes('/geocoding/') || url.includes('/search')) return 'other';
    return 'tiles';
  }
  if ((PMTILES_HOST && host === PMTILES_HOST) || host.includes('protomaps')) return 'tiles';
  return 'other';
}

// ------------------------------------------------------------
// Taille des requêtes / réponses
// ------------------------------------------------------------
function bodyBytes(body: BodyInit | null | undefined): number {
  if (!body) return 0;
  if (typeof body === 'string') return body.length;
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (body instanceof FormData) {
    let n = 0;
    body.forEach((v) => {
      n += typeof v === 'string' ? v.length : v.size;
    });
    return n;
  }
  return 0;
}

function wireSize(decodedBytes: number): number {
  // Les petites réponses JSON ne sont pas compressées ; au-delà, gzip/brotli
  // ramènent le JSON à ~40 % de sa taille.
  return decodedBytes < 1_024 ? decodedBytes : decodedBytes * 0.4;
}

function wsBytes(data: unknown): number {
  if (typeof data === 'string') return data.length + 6;
  if (data instanceof ArrayBuffer) return data.byteLength + 6;
  if (data instanceof Blob) return data.size + 6;
  if (ArrayBuffer.isView(data)) return data.byteLength + 6;
  return 6;
}

function installFetch(): void {
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const cat = categorize(url);
    addBytes(cat, REQUEST_OVERHEAD + url.length + bodyBytes(init?.body));

    const res = await orig(input, init);
    try {
      const cl = res.headers.get('content-length');
      if (cl) {
        addBytes(cat, RESPONSE_OVERHEAD + Number(cl));
      } else {
        const ct = res.headers.get('content-type') ?? '';
        if (/json|text/.test(ct)) {
          // Pas de Content-Length (réponse en morceaux) : on mesure une copie.
          void res
            .clone()
            .arrayBuffer()
            .then((b) => addBytes(cat, RESPONSE_OVERHEAD + wireSize(b.byteLength)))
            .catch(() => undefined);
        } else {
          addBytes(cat, RESPONSE_OVERHEAD + 2_000);
        }
      }
    } catch {
      /* mesure impossible : on ne perturbe jamais l'appel */
    }
    return res;
  };
}

function installWebSocket(): void {
  const Orig = window.WebSocket;
  class CountingWebSocket extends Orig {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener('message', (e: MessageEvent) => addBytes('realtime', wsBytes(e.data)));
    }
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      addBytes('realtime', wsBytes(data));
      super.send(data);
    }
  }
  window.WebSocket = CountingWebSocket as unknown as typeof WebSocket;
}

// ------------------------------------------------------------
// Remontée au serveur
// ------------------------------------------------------------
function isNativeApp(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Boolean((window as any).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

let reportBlockedUntil = 0;

async function reportDay(day: string, c: DataCounters): Promise<boolean> {
  const { error } = await supabaseBrowser.rpc('report_driver_data_usage', {
    p_day: day,
    p_api: Math.round(c.api),
    p_nav: Math.round(c.nav),
    p_tiles: Math.round(c.tiles),
    p_realtime: Math.round(c.realtime),
    p_other: Math.round(c.other),
    p_tile_requests: Math.round(c.tileRequests),
    p_platform: isNativeApp() ? 'native' : 'web',
  });
  return !error;
}

/** Envoie les totaux d'aujourd'hui et ceux des jours passés non encore envoyés. */
export async function reportUsage(): Promise<void> {
  if (Date.now() < reportBlockedUntil) return;
  rollDayIfNeeded();
  persist();
  try {
    const { data: sess } = await supabaseBrowser.auth.getSession();
    if (!sess.session) return;

    // Jours passés : une fois envoyés, on garde une marque et on nettoie après 7 jours.
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      const day = key.slice(KEY_PREFIX.length);
      if (day === currentDay) continue;
      const sentKey = `tc_data_sent:${day}`;
      if (safeGet(sentKey)) {
        if (Date.parse(day) < Date.now() - 7 * 86_400_000) {
          window.localStorage.removeItem(key);
          window.localStorage.removeItem(sentKey);
        }
        continue;
      }
      if (await reportDay(day, parseCounters(safeGet(key)))) safeSet(sentKey, '1');
    }

    const ok = await reportDay(currentDay, counters);
    // Fonction pas encore déployée (ou hors ligne) : on réessaie dans 30 min.
    if (!ok) reportBlockedUntil = Date.now() + 30 * 60_000;
  } catch {
    reportBlockedUntil = Date.now() + 30 * 60_000;
  }
}

/** À appeler une fois, côté navigateur, avant les premiers appels réseau. */
export function installDataMeter(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  rollDayIfNeeded();
  try {
    installFetch();
    installWebSocket();
  } catch {
    /* le compteur est un outil de mesure : jamais bloquant */
  }

  // Écriture locale groupée (toutes les 5 s si quelque chose a changé).
  window.setInterval(() => {
    if (!dirty) return;
    persist();
    notify();
  }, 5_000);
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persist();
      void reportUsage();
    }
  });
  // Remontée serveur : une fois peu après le démarrage, puis toutes les 10 min.
  window.setTimeout(() => void reportUsage(), 30_000);
  window.setInterval(() => void reportUsage(), 10 * 60_000);
}
