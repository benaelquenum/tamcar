// ============================================================
// Caméra de navigation « cap en haut » (comme Yango / Waze) :
// la carte pivote pour que le sens de marche pointe toujours vers le haut
// de l'écran, le véhicule reste fixe au tiers inférieur, le tracé devant lui.
//
// Ce fichier ne contient que de la logique pure : le cap lissé, le zoom
// selon la vitesse. Le rendu (carte, marqueur) est dans components/Map.tsx.
// ============================================================

import { bearing, haversine, type LngLat } from './navRoute';

/** Écart angulaire signé le plus court de a vers b, dans ]-180, 180]. */
export function angleDiff(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

export function normalizeAngle(a: number): number {
  return ((a % 360) + 360) % 360;
}

export type GpsSample = {
  pos: LngLat;
  /** Vitesse en m/s (GPS) ou null. */
  speedMps: number | null;
  /** Cap GPS en degrés ou null. */
  heading: number | null;
  /** Horodatage en ms. */
  t: number;
};

/**
 * Cap lissé du véhicule. Priorité :
 *   1. le cap de la ROUTE devant lui quand il roule dessus (le plus stable) ;
 *   2. le cap GPS quand il roule ;
 *   3. le cap calculé entre deux positions distantes d'au moins 12 m ;
 *   4. sinon on garde le dernier cap (à l'arrêt, la carte ne tourne pas).
 * Le lissage est exponentiel, avec une constante de temps de 1 s : une
 * rotation de 90° dans un virage prend ~2 s au lieu d'un saut brutal.
 */
export class HeadingFilter {
  private heading: number | null = null;
  private lastPos: LngLat | null = null;
  private lastT = 0;

  get value(): number | null {
    return this.heading;
  }

  reset(): void {
    this.heading = null;
    this.lastPos = null;
    this.lastT = 0;
  }

  update(sample: GpsSample, routeBearing: number | null): number | null {
    const speed = sample.speedMps;
    const moving = speed == null || speed > 0.8;
    let target: number | null = null;

    if (routeBearing != null && moving) {
      target = routeBearing;
    } else if (sample.heading != null && Number.isFinite(sample.heading) && (speed ?? 0) > 1.5) {
      target = sample.heading;
    } else if (this.lastPos && haversine(this.lastPos, sample.pos) >= 12) {
      target = bearing(this.lastPos, sample.pos);
    }

    if (!this.lastPos || haversine(this.lastPos, sample.pos) >= 12) this.lastPos = sample.pos;

    if (target == null) {
      this.lastT = sample.t;
      return this.heading;
    }
    if (this.heading == null) {
      this.heading = normalizeAngle(target);
    } else {
      const dt = Math.max(0.05, Math.min(3, (sample.t - this.lastT) / 1000));
      const alpha = 1 - Math.exp(-dt / 1.0);
      this.heading = normalizeAngle(this.heading + angleDiff(this.heading, target) * alpha);
    }
    this.lastT = sample.t;
    return this.heading;
  }
}

/** Niveaux de zoom de la navigation : de près à l'arrêt, plus large à grande vitesse. */
export const NAV_ZOOM_LEVELS = [17.4, 16.8, 16.2] as const;

/**
 * Niveau de zoom (index dans NAV_ZOOM_LEVELS) selon la vitesse, avec hystérésis
 * de 5 km/h : un changement de zoom recharge des tuiles de carte, donc de la
 * data — on évite de zoomer/dézoomer à chaque variation de vitesse.
 */
export function zoomLevelForSpeed(prev: number, speedKmh: number | null): number {
  if (speedKmh == null) return prev;
  const up = [28, 60]; // passe au niveau suivant (plus large) au-dessus
  const down = [23, 55]; // revient au niveau précédent (plus près) en dessous
  let level = prev;
  while (level < NAV_ZOOM_LEVELS.length - 1 && speedKmh > up[level]) level += 1;
  while (level > 0 && speedKmh < down[level - 1]) level -= 1;
  return level;
}
