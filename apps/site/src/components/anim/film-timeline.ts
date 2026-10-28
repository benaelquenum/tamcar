import { clamp01, lerp, smooth } from './journey-shared';

/**
 * Le montage du film « Votre véhicule. Notre organisation. » (page Partenaires, version B) : six séquences, 42 s.
 * Tout ce qui se passe à l'écran est une fonction du temps `t` (en secondes) : on peut donc lire, mettre en pause,
 * rejouer ou sauter à une séquence sans rien casser. Aucun chiffre de politique partenaire, aucune promesse de gain.
 */

export const DURATION = 42;

export type FilmSeq = { a: number; b: number; label: string; title: string; text: string };

export const SEQS: FilmSeq[] = [
  { a: 0, b: 6, label: 'La ville s’éveille', title: 'La mobilité évolue.', text: 'TamCar organise vos déplacements autrement.' },
  { a: 6, b: 12, label: 'Le véhicule devient une opportunité', title: 'Vous apportez le véhicule.', text: 'TamCar met en place un cadre d’exploitation organisé.' },
  { a: 12, b: 19, label: 'Des chauffeurs sélectionnés', title: 'La confiance commence par la sélection.', text: 'Des chauffeurs encadrés. Un service pensé pour la sécurité et la qualité.' },
  { a: 19, b: 27, label: 'Une activité suivie', title: 'Chaque véhicule compte.', text: 'Un suivi organisé pour mieux piloter l’activité.' },
  { a: 27, b: 34, label: 'Une relation claire', title: 'Clarté. Suivi. Responsabilité.', text: 'Un partenariat fondé sur des règles définies et une gestion structurée.' },
  { a: 34, b: 42, label: 'La signature TamCar', title: 'TamCar', text: 'Votre véhicule. Notre organisation.' },
];

export const FINAL_LINE = 'Construisons ensemble une mobilité plus fiable.';
export const CTA_LABEL = 'Devenir partenaire';

export const seqIndexAt = (t: number) => {
  for (let i = SEQS.length - 1; i >= 0; i--) if (t >= SEQS[i].a) return i;
  return 0;
};

/** Fondu entrant puis sortant : 0 avant `a`, 1 entre `b` et `c`, 0 après `d`. */
export const pulse = (t: number, a: number, b: number, c: number, d: number) => smooth(clamp01((t - a) / Math.max(1e-6, b - a))) * (1 - smooth(clamp01((t - c) / Math.max(1e-6, d - c))));
/** 0 → 1 entre `a` et `b`. */
export const rise = (t: number, a: number, b: number) => smooth(clamp01((t - a) / Math.max(1e-6, b - a)));

/* ------------------------------------------------------------------ le véhicule TamCar : trajet en fonction du temps */

/** Position (x) de l'emplacement où le véhicule s'arrête, et sa voie. */
export const BAY_X = 60;
export const LANE_Z = 2.3; // voie de circulation du véhicule
export const BAY_Z = 5.5; // emplacement le long de la chaussée
const V0 = 9; // m/s sur la rue
const T_BRAKE = 4.2; // début du freinage
const T_STOP = 7.2; // arrêt dans l'emplacement
const BRAKE_D = (V0 * (T_STOP - T_BRAKE)) / 3;
export const T_GO = 16.9; // le chauffeur est monté : le véhicule démarre
const V_MAX = 8.5;
const ACC = 3.2;

/** Distance parcourue le long de la route par le véhicule à l'instant t. */
export function carX(t: number): number {
  if (t < T_BRAKE) return BAY_X - BRAKE_D - V0 * (T_BRAKE - t);
  if (t < T_STOP) {
    const u = (t - T_BRAKE) / (T_STOP - T_BRAKE);
    return BAY_X - BRAKE_D + (V0 * (T_STOP - T_BRAKE) * (1 - (1 - u) ** 3)) / 3;
  }
  if (t < T_GO) return BAY_X;
  const tau = t - T_GO;
  const u = tau / ACC;
  if (u < 1) return BAY_X + V_MAX * ACC * (u ** 3 - u ** 4 / 2);
  return BAY_X + V_MAX * ACC * 0.5 + V_MAX * (tau - ACC);
}

/** Position latérale : voie → emplacement (fin du freinage), emplacement → voie (démarrage). */
export function carZ(t: number): number {
  const into = smooth(clamp01((t - 4.9) / (T_STOP - 4.9)));
  const out = smooth(clamp01((t - T_GO) / 3.4));
  return lerp(LANE_Z, BAY_Z, into) - (BAY_Z - LANE_Z) * out;
}

/** Cap du véhicule (rotation y, radians), d'après sa vitesse latérale. */
export function carYaw(t: number): number {
  const e = 0.05;
  const dx = Math.max(0.5, carX(t + e) - carX(t - e));
  const dz = carZ(t + e) - carZ(t - e);
  return -Math.atan2(dz, dx);
}

/** Part de nuit : l'aube bleutée au début, puis plein jour. */
export const filmNight = (t: number) => lerp(0.5, 0, smooth(clamp01(t / 8)));

/* ------------------------------------------------------------------ séquence 3 : le chauffeur */

export const T_WALK = 12.5; // le chauffeur entre dans le champ
export const T_ARRIVE = 14.6; // il arrive à la portière
export const T_BOARD = 16.0; // il monte
export const T_BOARDED = 16.5;
export const WALK_FROM: [number, number] = [BAY_X - 5.8, BAY_Z + 3.4];
export const WALK_TO: [number, number] = [BAY_X - 0.7, BAY_Z + 1.35];

export function walkerAt(t: number) {
  const k = clamp01((t - T_WALK) / (T_ARRIVE - T_WALK));
  const e = k; // vitesse constante : la marche reste régulière
  const x = lerp(WALK_FROM[0], WALK_TO[0], e);
  const z = lerp(WALK_FROM[1], WALK_TO[1], e);
  const walking = t >= T_WALK && t < T_ARRIVE;
  const heading = Math.atan2(WALK_TO[1] - WALK_FROM[1], WALK_TO[0] - WALK_FROM[0]);
  // à l'arrêt, il se tourne vers le véhicule (vers le nord)
  const face = walking ? heading : lerp(heading, -Math.PI / 2, smooth(clamp01((t - T_ARRIVE) / 0.5)));
  return { x, z, walking, face, phase: (t - T_WALK) * 6.4, visible: t >= T_WALK - 0.2 && t < T_BOARDED };
}
