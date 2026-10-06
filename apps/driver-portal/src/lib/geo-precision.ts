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

/**
 * Acquisition PRÉCISE en une demande : lance un watchPosition court et résout dès qu'un fix passe le seuil
 * d'accuracy. Un getCurrentPosition one-shot renvoie souvent le premier fix réseau (wifi / antennes, 150 m à
 * plusieurs km au Bénin) parce que le GPS n'a pas encore chauffé : c'est ce qui plaçait un chauffeur à 150 m du
 * client alors qu'il était à côté. Au délai maximal, renvoie le MEILLEUR fix observé plutôt que d'échouer.
 */
export function getAccuratePosition(opts?: {
  threshold?: number;
  timeoutMs?: number;
}): Promise<GeolocationPosition> {
  const threshold = opts?.threshold ?? ACCURACY_THRESHOLD_M;
  const timeoutMs = opts?.timeoutMs ?? 15000;
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation_unsupported'));
      return;
    }
    let best: GeolocationPosition | null = null;
    let done = false;
    let watchId = 0;
    const finish = (err?: GeolocationPositionError) => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(err ?? new Error('gps_timeout'));
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (isAccurateEnough(pos, threshold)) finish();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) finish(err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
  });
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
