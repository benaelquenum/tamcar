// ============================================================
// Suivi d'itinéraire en local.
//
// Avant : TamCar Pro redemandait l'itinéraire complet à Mapbox Directions toutes
// les 15 s pendant la course. C'est la première cause de consommation de data
// (et de facture Mapbox) pendant la phase accepté → arrivé.
//
// Maintenant : on demande le tracé UNE fois, puis on suit le véhicule dessus :
// position projetée sur la ligne, distance et durée restantes, prochaine
// manœuvre, tracé restant à dessiner. Le tracé n'est redemandé que si le
// chauffeur quitte la route, si la cible change (départ → destination,
// prochain arrêt) ou si l'itinéraire est vieux (trafic).
//
// Fonctions pures : aucun accès réseau, aucun DOM.
// ============================================================

import type { NavRoute, NavStep } from './mapbox';

export type LngLat = [number, number];

const R = 6_371_000;
const RAD = Math.PI / 180;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Cap (°) de a vers b : 0 = nord, sens horaire. */
export function bearing(a: LngLat, b: LngLat): number {
  const dLng = (b[0] - a[0]) * RAD;
  const y = Math.sin(dLng) * Math.cos(b[1] * RAD);
  const x =
    Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) -
    Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos(dLng);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export type NavState = {
  route: NavRoute;
  target: LngLat;
  coords: LngLat[];
  /** cum[i] = mètres parcourus le long du tracé jusqu'au sommet i. */
  cum: number[];
  total: number;
  /** Abscisse (m) de chaque manœuvre le long du tracé. */
  stepAlong: number[];
  fetchedAt: number;
  /** Dernier segment sur lequel le véhicule a été projeté. */
  idx: number;
  /** Depuis quand le véhicule est trop loin du tracé (ms, 0 = sur le tracé). */
  offSince: number;
};

export type NavProgress = {
  idx: number;
  /** Distance (m) entre le véhicule et le tracé. */
  offM: number;
  /** Abscisse (m) du véhicule le long du tracé. */
  alongM: number;
  remainingM: number;
  remainingMin: number;
  nextStep: NavStep | null;
  /** Tracé restant, du véhicule jusqu'à la cible. */
  geometry: GeoJSON.LineString;
  /** Cap de la route juste devant le véhicule (°). */
  bearingAhead: number;
};

export function buildNavState(route: NavRoute, target: LngLat, now: number): NavState {
  const coords = route.geometry.coordinates as LngLat[];
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i += 1) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1] || 0;

  const state: NavState = {
    route,
    target,
    coords,
    cum,
    total,
    stepAlong: [],
    fetchedAt: now,
    idx: 0,
    offSince: 0,
  };
  // Chaque manœuvre est placée sur le sommet du tracé le plus proche d'elle.
  state.stepAlong = route.steps.map((s) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < coords.length; i += 1) {
      const d = haversine(coords[i], s.location);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return cum[best];
  });
  return state;
}

/** Projette p sur le segment [a, b] (plan local en mètres). */
function project(p: LngLat, a: LngLat, b: LngLat): { dist: number; t: number; point: LngLat } {
  const kx = Math.cos(p[1] * RAD) * 111_320;
  const ky = 110_574;
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? (-(ax * dx + ay * dy)) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx;
  const py = ay + t * dy;
  return {
    dist: Math.hypot(px, py),
    t,
    point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
  };
}

function snap(state: NavState, pos: LngLat): { i: number; t: number; dist: number; point: LngLat } {
  const n = state.coords.length;
  const scan = (from: number, to: number) => {
    let best = { i: from, t: 0, dist: Infinity, point: state.coords[from] };
    for (let i = from; i <= to; i += 1) {
      const pr = project(pos, state.coords[i], state.coords[i + 1]);
      if (pr.dist < best.dist) best = { i, t: pr.t, dist: pr.dist, point: pr.point };
    }
    return best;
  };
  if (n < 2) return { i: 0, t: 0, dist: Infinity, point: state.coords[0] ?? pos };
  // D'abord autour de la dernière position connue (le véhicule avance), puis
  // sur tout le tracé si on s'en est écarté (boucle, demi-tour).
  let best = scan(Math.max(0, state.idx - 3), Math.min(n - 2, state.idx + 80));
  if (best.dist > 60) {
    const all = scan(0, n - 2);
    if (all.dist < best.dist) best = all;
  }
  return best;
}

/** Cap de la route à `aheadM` mètres devant l'abscisse `along`. */
function routeBearingAt(state: NavState, i: number, point: LngLat, aheadM: number): number {
  const { coords, cum } = state;
  const target = cum[i] + haversine(coords[i], point) + aheadM;
  let j = i + 1;
  while (j < coords.length - 1 && cum[j] < target) j += 1;
  const from = point;
  const to = coords[Math.min(j, coords.length - 1)];
  if (haversine(from, to) < 1 && i + 1 < coords.length) return bearing(coords[i], coords[i + 1]);
  return bearing(from, to);
}

export function progressAlong(state: NavState, pos: LngLat): NavProgress {
  const s = snap(state, pos);
  state.idx = s.i;
  const alongM = state.cum[s.i] + haversine(state.coords[s.i], s.point);
  const remainingM = Math.max(0, state.total - alongM);
  const remainingMin =
    state.total > 0
      ? Math.max(1, Math.round(state.route.duration_min * (remainingM / state.total)))
      : 1;

  // Prochaine manœuvre : la première (hors départ) encore devant le véhicule.
  let nextStep: NavStep | null = null;
  const steps = state.route.steps;
  for (let k = 0; k < steps.length; k += 1) {
    if (steps[k].type === 'depart') continue;
    if (state.stepAlong[k] > alongM + 12) {
      nextStep = steps[k];
      break;
    }
  }
  if (!nextStep) {
    const last = steps[steps.length - 1];
    nextStep = last && last.type !== 'depart' ? last : null;
  }

  const first: LngLat = s.dist < 40 ? s.point : pos;
  const geometry: GeoJSON.LineString = {
    type: 'LineString',
    coordinates: [first, ...state.coords.slice(s.i + 1)],
  };
  return {
    idx: s.i,
    offM: s.dist,
    alongM,
    remainingM,
    remainingMin,
    nextStep,
    geometry,
    bearingAhead: routeBearingAt(state, s.i, s.point, 25),
  };
}

export type RefetchReason = 'target' | 'off-route' | 'age' | null;

/** Faut-il redemander le tracé ? À appeler avec le résultat de progressAlong. */
export function needsRefetch(
  state: NavState,
  progress: NavProgress,
  target: LngLat,
  now: number,
): RefetchReason {
  if (haversine(state.target, target) > 30) return 'target';
  const sinceFetch = now - state.fetchedAt;

  // Hors tracé : léger écart toléré 8 s (bruit GPS, carrefour large),
  // grand écart 3 s ; jamais plus d'une demande toutes les 15 s.
  if (progress.offM > 70) {
    if (!state.offSince) state.offSince = now;
    const dur = now - state.offSince;
    const limit = progress.offM > 200 ? 3_000 : 8_000;
    if (dur >= limit && sinceFetch > 15_000) return 'off-route';
  } else {
    state.offSince = 0;
  }
  // Trafic : on rafraîchit l'estimation de temps toutes les 8 minutes.
  if (sinceFetch > 8 * 60_000) return 'age';
  return null;
}
