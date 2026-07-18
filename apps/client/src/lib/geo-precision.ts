/**
 * Utilitaires pour améliorer la précision perçue de la géolocalisation.
 *
 * 1. Filtrage : on rejette les Position dont l'accuracy est supérieure à
 *    ACCURACY_THRESHOLD_M (50 m par défaut). Un tap-in GPS Cotonou rebound
 *    régulièrement à 15-30 m ; les valeurs > 50 m signent presque toujours
 *    une re-triangulation Wi-Fi / cellulaire à côté du vrai point.
 *
 * 2. Moyennage : buffer glissant sur N samples (5 par défaut). On calcule
 *    la moyenne pondérée inverse-de-l'accuracy — un fix à 10 m compte 3x
 *    plus qu'un fix à 30 m. Résultat : la position affichée arrête de
 *    "danser" pendant que le user regarde son écran.
 */

const ACCURACY_THRESHOLD_M = 50;
const BUFFER_SIZE = 5;

export type Sample = {
  lng: number;
  lat: number;
  accuracy: number;
  ts: number;
};

export function isAccurateEnough(pos: GeolocationPosition, threshold = ACCURACY_THRESHOLD_M): boolean {
  const acc = pos.coords.accuracy;
  return typeof acc === 'number' && Number.isFinite(acc) && acc <= threshold;
}

export class SmoothingBuffer {
  private samples: Sample[] = [];

  constructor(private readonly size = BUFFER_SIZE) {}

  push(sample: Sample): [number, number] {
    this.samples.push(sample);
    if (this.samples.length > this.size) this.samples.shift();
    return this.mean();
  }

  private mean(): [number, number] {
    if (this.samples.length === 1) {
      return [this.samples[0].lng, this.samples[0].lat];
    }
    // Poids = 1 / accuracy (fix précis vaut plus)
    let wsum = 0;
    let lng = 0;
    let lat = 0;
    for (const s of this.samples) {
      const w = 1 / Math.max(1, s.accuracy);
      wsum += w;
      lng += s.lng * w;
      lat += s.lat * w;
    }
    return [lng / wsum, lat / wsum];
  }

  reset(): void {
    this.samples = [];
  }
}
