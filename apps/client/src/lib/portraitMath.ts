// Calculs purs du traitement des photos d'identité des chauffeurs (aucune dépendance au navigateur :
// testables seuls). Le traitement complet (détection du visage, recadrage) est dans portrait.ts.

export type PortraitIssue = {
  code: string;
  level: 'ok' | 'warn' | 'error';
  message: string;
};

export type PortraitMetrics = {
  faces: number;
  /** Hauteur du visage / hauteur de l'image. */
  faceHeightRatio: number;
  /** Décalage horizontal du nez par rapport au milieu des yeux, en distances inter-oculaires (0 = de face). */
  yawRatio: number;
  /** Inclinaison de la ligne des yeux, en degrés. */
  rollDeg: number;
  /** Luminosité moyenne du visage (0-255) et du fond. */
  faceLuma: number;
  bgLuma: number;
  /** Variance du laplacien sur le visage (netteté). */
  sharpness: number;
  /** Côté du carré recadré, en pixels de la photo d'origine. */
  cropSidePx: number;
};

export const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Luminosité moyenne d'un rectangle d'une image RGBA. */
export function meanLumaRect(data: Uint8ClampedArray | Uint8Array, w: number, h: number, x: number, y: number, rw: number, rh: number): number {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(w, Math.ceil(x + rw));
  const y1 = Math.min(h, Math.ceil(y + rh));
  let sum = 0;
  let n = 0;
  for (let j = y0; j < y1; j += 2) {
    for (let i = x0; i < x1; i += 2) {
      const p = (j * w + i) * 4;
      sum += luma(data[p], data[p + 1], data[p + 2]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Luminosité moyenne du fond : tout ce qui est hors du rectangle (agrandi) autour du visage. */
export function backgroundLuma(data: Uint8ClampedArray | Uint8Array, w: number, h: number, fx: number, fy: number, fw: number, fh: number): number {
  const mx = fw * 0.4;
  const my = fh * 0.4;
  let sum = 0;
  let n = 0;
  for (let j = 0; j < h; j += 3) {
    for (let i = 0; i < w; i += 3) {
      if (i >= fx - mx && i <= fx + fw + mx && j >= fy - my && j <= fy + fh + my) continue;
      const p = (j * w + i) * 4;
      sum += luma(data[p], data[p + 1], data[p + 2]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Niveaux de gris d'un rectangle RGBA, ramené à size × size (netteté indépendante de la résolution). */
export function grayCrop(data: Uint8ClampedArray | Uint8Array, w: number, h: number, x: number, y: number, rw: number, rh: number, size = 128): Float32Array {
  const out = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const sx = Math.min(w - 1, Math.max(0, Math.floor(x + ((i + 0.5) * rw) / size)));
      const sy = Math.min(h - 1, Math.max(0, Math.floor(y + ((j + 0.5) * rh) / size)));
      const p = (sy * w + sx) * 4;
      out[j * size + i] = luma(data[p], data[p + 1], data[p + 2]);
    }
  }
  return out;
}

/** Variance du laplacien : faible = flou. */
export function laplacianVariance(gray: Float32Array, size: number): number {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let j = 1; j < size - 1; j++) {
    for (let i = 1; i < size - 1; i++) {
      const c = gray[j * size + i];
      const l = gray[j * size + i - 1] + gray[j * size + i + 1] + gray[(j - 1) * size + i] + gray[(j + 1) * size + i] - 4 * c;
      sum += l;
      sum2 += l * l;
      n++;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

/** Table de correspondance gamma (g < 1 éclaircit). */
export function gammaLut(g: number): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(i / 255, g));
  return lut;
}

/**
 * Éclaircissement d'un visage à contre-jour : on ne ramène JAMAIS la peau vers une luminosité « standard »
 * (ce qui délaverait les peaux foncées) ; on relève au plus de 35 %, jusqu'à 130 maximum.
 */
export function backlightGamma(faceLuma: number): number {
  if (faceLuma <= 1) return 1;
  const target = Math.min(faceLuma * 1.35, 130);
  if (target <= faceLuma) return 1;
  return Math.max(0.55, Math.log(target / 255) / Math.log(faceLuma / 255));
}

export type Pt = { x: number; y: number };

/** Yeux (gauche/droite dans l'image) et nez → inclinaison (degrés) et rotation de la tête (ratio). */
export function headPose(eyeA: Pt, eyeB: Pt, nose: Pt): { rollDeg: number; yawRatio: number } {
  const [l, r] = eyeA.x <= eyeB.x ? [eyeA, eyeB] : [eyeB, eyeA];
  const dx = r.x - l.x;
  const dy = r.y - l.y;
  const dist = Math.hypot(dx, dy) || 1;
  const rollDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const midX = (l.x + r.x) / 2;
  return { rollDeg, yawRatio: (nose.x - midX) / dist };
}

/** Carré de recadrage : visage à ~45 % de la hauteur, un peu d'air au-dessus de la tête, contenu dans l'image. */
export function cropSquare(faceX: number, faceY: number, faceW: number, faceH: number, imgW: number, imgH: number): { cx: number; cy: number; side: number } {
  let side = faceH * 2.2;
  side = Math.min(side, imgW, imgH);
  let cx = faceX + faceW / 2;
  let cy = faceY + faceH / 2 + 0.04 * side;
  cx = Math.min(Math.max(cx, side / 2), imgW - side / 2);
  cy = Math.min(Math.max(cy, side / 2), imgH - side / 2);
  return { cx, cy, side };
}

/** Verdict : liste de constats (erreurs bloquantes, avertissements, points validés). */
export function judge(m: PortraitMetrics): PortraitIssue[] {
  const out: PortraitIssue[] = [];
  const add = (code: string, level: PortraitIssue['level'], message: string) => out.push({ code, level, message });

  if (m.faces === 0) {
    add('no_face', 'error', 'Aucun visage détecté. Cadrez le visage de face, bien éclairé.');
    return out;
  }
  if (m.faces > 1) {
    add('many_faces', 'error', 'Plusieurs visages sur la photo : une seule personne doit apparaître.');
    return out;
  }
  add('one_face', 'ok', 'Un seul visage détecté.');

  if (m.faceHeightRatio < 0.12) add('too_far', 'error', 'Visage trop petit : rapprochez-vous (environ 1 mètre).');
  else if (m.faceHeightRatio < 0.2) add('too_far', 'warn', 'Visage un peu loin : rapprochez-vous un peu.');
  else if (m.faceHeightRatio > 0.75) add('too_close', 'warn', 'Visage très proche : reculez un peu.');
  else add('framing', 'ok', 'Cadrage correct.');

  const yaw = Math.abs(m.yawRatio);
  if (yaw > 0.45) add('turned', 'error', 'Visage tourné : le chauffeur doit regarder droit vers l’objectif.');
  else if (yaw > 0.3) add('turned', 'warn', 'Visage légèrement de profil : demandez de regarder droit vers l’objectif.');
  else add('frontal', 'ok', 'Visage de face.');

  const roll = Math.abs(m.rollDeg);
  if (roll > 25) add('tilted', 'error', 'Tête trop penchée : redressez la tête.');
  else if (roll > 8) add('tilted', 'warn', 'Tête penchée : redressée automatiquement.');

  const ratio = m.bgLuma / Math.max(m.faceLuma, 1);
  if (m.faceLuma < 35) add('too_dark', 'error', 'Photo trop sombre : ajoutez de la lumière de face.');
  else if (ratio > 1.8 && m.faceLuma < 110) add('backlight', 'warn', 'Contre-jour probable : visage plus sombre que le fond (éclairci automatiquement). Mieux : lumière de face, dos à un mur.');
  else if (m.faceLuma > 210) add('overexposed', 'warn', 'Visage très clair (surexposition) : réduisez la lumière directe.');
  else add('light', 'ok', 'Éclairage correct.');

  if (m.sharpness < 20) add('blurry', 'error', 'Photo floue : refaites-la en tenant le téléphone immobile.');
  else if (m.sharpness < 60) add('blurry', 'warn', 'Photo un peu floue : refaites-la si possible.');
  else add('sharp', 'ok', 'Photo nette.');

  if (m.cropSidePx < 250) add('resolution', 'error', 'Résolution trop faible : rapprochez-vous ou utilisez la caméra arrière.');
  else if (m.cropSidePx < 450) add('resolution', 'warn', 'Résolution un peu faible.');

  return out;
}
