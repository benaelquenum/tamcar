/**
 * Analyse des liens de localisation partagés (WhatsApp, Google Maps, Apple
 * Plans, OpenStreetMap…) pour en extraire une destination de course.
 *
 * Trois issues possibles :
 *   - `coords` : on a des coordonnées exploitables → on peut commander.
 *   - `query`  : on n'a qu'un nom de lieu → il faut le chercher dans la base.
 *   - `short`  : lien raccourci (maps.app.goo.gl…) → il faut le dérouler
 *                côté serveur, le navigateur ne peut pas le suivre.
 *
 * Fonctions pures et sans dépendance : utilisables côté client comme côté
 * serveur (la route /api/resolve-map-link s'en sert aussi).
 */

export type MapLinkResult =
  | { kind: 'coords'; lat: number; lng: number; label?: string }
  | { kind: 'query'; query: string }
  | { kind: 'short'; url: string }
  | { kind: 'none' };

/** Hôtes de liens raccourcis qu'il faut dérouler pour connaître la cible. */
export const SHORT_LINK_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co', 'share.google'];

/** Hôtes autorisés à être appelés par le résolveur serveur (anti-SSRF). */
export const RESOLVABLE_HOSTS = [
  ...SHORT_LINK_HOSTS,
  'maps.google.com',
  'www.google.com',
  'google.com',
  'maps.apple.com',
  'www.openstreetmap.org',
];

function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    // 0,0 est le « null island » : c'est la valeur de remplissage des URI geo:
    !(lat === 0 && lng === 0)
  );
}

function coords(lat: number, lng: number, label?: string): MapLinkResult | null {
  if (!isValidCoord(lat, lng)) return null;
  return { kind: 'coords', lat, lng, label: label?.trim() || undefined };
}

/** Extrait la première URL d'un texte partagé (« Regarde : https://… »). */
export function extractUrl(text: string): string | null {
  const m = (text ?? '').match(/(geo:[^\s]+|https?:\/\/[^\s]+)/i);
  if (!m) return null;

  let url = m[1].replace(/[.,;!]+$/, '');
  // Une parenthèse fermante n'est retirée que si elle est orpheline :
  // « geo:0,0?q=6.49,2.60(Palais Royal) » est un lien parfaitement valide,
  // et c'est justement la forme qu'envoie WhatsApp pour une position.
  const count = (s: string, re: RegExp) => (url.match(re) ?? []).length;
  while (url.endsWith(')') && count(url, /\(/g) < count(url, /\)/g)) {
    url = url.slice(0, -1);
  }
  return url;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isShortLink(url: string): boolean {
  const h = hostOf(url);
  return SHORT_LINK_HOSTS.some((s) => h === s.replace(/^www\./, ''));
}

/** `geo:6.36,2.43` · `geo:0,0?q=6.36,2.43(Dantokpa)` · `geo:0,0?q=Dantokpa` */
function parseGeoUri(raw: string): MapLinkResult {
  const body = raw.slice(4); // retire « geo: »
  const [pathPart, queryPart = ''] = body.split('?');

  const q = new URLSearchParams(queryPart).get('q');
  if (q) {
    const withLabel = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?:\((.+)\))?\s*$/);
    if (withLabel) {
      const r = coords(parseFloat(withLabel[1]), parseFloat(withLabel[2]), withLabel[3]);
      if (r) return r;
    }
    const name = decodeURIComponent(q.replace(/\+/g, ' ')).trim();
    if (name) return { kind: 'query', query: name };
  }

  const p = pathPart.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (p) {
    const r = coords(parseFloat(p[1]), parseFloat(p[2]));
    if (r) return r;
  }
  return { kind: 'none' };
}

/**
 * Analyse un lien ou un texte de localisation.
 * `text` peut être une URL brute, un URI geo:, ou un message contenant l'un
 * des deux — c'est ce que produit un partage depuis WhatsApp.
 */
export function parseMapLink(text: string): MapLinkResult {
  const input = (text ?? '').trim();
  if (!input) return { kind: 'none' };

  const url = extractUrl(input) ?? input;

  if (/^geo:/i.test(url)) return parseGeoUri(url);

  if (/^https?:\/\//i.test(url)) {
    if (isShortLink(url)) return { kind: 'short', url };

    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { kind: 'none' };
    }

    const full = decodeURIComponent(u.href.replace(/\+/g, ' '));

    // 1. Google Maps : !3d<lat>!4d<lng> désigne le LIEU (le plus fiable).
    const bang = full.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (bang) {
      const label = full.match(/\/maps\/place\/([^/@]+)/);
      const r = coords(
        parseFloat(bang[1]),
        parseFloat(bang[2]),
        label ? label[1].replace(/\+/g, ' ') : undefined,
      );
      if (r) return r;
    }

    // 2. Paramètres explicites de destination.
    for (const key of ['q', 'query', 'destination', 'daddr', 'll', 'sll', 'center', 'mlat']) {
      const v = u.searchParams.get(key);
      if (!v) continue;
      const c = v.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (c) {
        const r = coords(parseFloat(c[1]), parseFloat(c[2]));
        if (r) return r;
      }
    }
    // OpenStreetMap : ?mlat=..&mlon=..
    const mlat = u.searchParams.get('mlat');
    const mlon = u.searchParams.get('mlon');
    if (mlat && mlon) {
      const r = coords(parseFloat(mlat), parseFloat(mlon));
      if (r) return r;
    }

    // 3. Centre de carte : @lat,lng,zoom (Google) ou #map=zoom/lat/lng (OSM).
    const at = full.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (at) {
      const label = full.match(/\/maps\/place\/([^/@]+)/);
      const r = coords(
        parseFloat(at[1]),
        parseFloat(at[2]),
        label ? label[1].replace(/\+/g, ' ') : undefined,
      );
      if (r) return r;
    }
    const osm = full.match(/#map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
    if (osm) {
      const r = coords(parseFloat(osm[1]), parseFloat(osm[2]));
      if (r) return r;
    }

    // 4. À défaut de coordonnées : un nom de lieu à chercher.
    const place = full.match(/\/maps\/place\/([^/@?]+)/);
    if (place) {
      const name = place[1].replace(/\+/g, ' ').trim();
      if (name) return { kind: 'query', query: name };
    }
    for (const key of ['q', 'query', 'destination', 'address']) {
      const v = u.searchParams.get(key);
      if (v && v.trim()) return { kind: 'query', query: v.replace(/\+/g, ' ').trim() };
    }
    return { kind: 'none' };
  }

  // Texte libre : « 6.3654, 2.4258 » collé depuis un message.
  const bare = input.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (bare) {
    const r = coords(parseFloat(bare[1]), parseFloat(bare[2]));
    if (r) return r;
  }

  // Sinon : on traite le texte comme un nom de lieu.
  return input.length >= 3 ? { kind: 'query', query: input } : { kind: 'none' };
}

/** Extrait une position d'une page HTML de Google Maps (dernier recours). */
export function parseMapHtml(html: string): MapLinkResult {
  const bang = html.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bang) {
    const r = coords(parseFloat(bang[1]), parseFloat(bang[2]));
    if (r) return r;
  }
  const meta = html.match(/[?&]center=(-?\d+(?:\.\d+)?)(?:%2C|,)(-?\d+(?:\.\d+)?)/);
  if (meta) {
    const r = coords(parseFloat(meta[1]), parseFloat(meta[2]));
    if (r) return r;
  }
  const at = html.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),\d+(?:\.\d+)?z/);
  if (at) {
    const r = coords(parseFloat(at[1]), parseFloat(at[2]));
    if (r) return r;
  }
  return { kind: 'none' };
}
