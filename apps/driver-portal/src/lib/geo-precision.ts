/**
 * Utilitaires pour améliorer la précision perçue de la géolocalisation.
 * Identique à la version côté client (dupliqué pour éviter un package partagé).
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
