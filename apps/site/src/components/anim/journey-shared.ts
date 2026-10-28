/**
 * Éléments communs aux deux versions (2D et 3D) de « la route » de la page Clients : durée du défilement,
 * fenêtres des six chapitres, jour → nuit, distance parcourue, couleurs du ciel.
 */

export type JourneyStep = { title: string; text: string };

export const HEADER_PX = 64; // hauteur de l'en-tête collant du site
export const RUNWAY_VH = 540; // longueur de défilement de la section, en hauteurs d'écran
export const TOTAL = 7000; // distance parcourue (unités de la scène) du début à la fin
export const EXAMPLE_PRICE = 1500; // prix d'exemple (illustration)

/** Fenêtres de progression (0 → 1) de chacun des six chapitres. */
export const STEPS: [number, number][] = [
  [0.05, 0.2],
  [0.2, 0.36],
  [0.36, 0.52],
  [0.52, 0.68],
  [0.68, 0.83],
  [0.83, 1],
];

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function rgb(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Mélange de deux couleurs #rrggbb, rendu en rgb(...). */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}

// Jour poussiéreux (harmattan) : ciel pâle qui se fond dans une brume beige à l'horizon
export const SKY_TOP: [string, string] = ['#8FB9E8', '#050A1E'];
export const SKY_BOT: [string, string] = ['#F0E2C8', '#26213F'];

/** Part de nuit (0 = plein jour, 1 = nuit) : le jour tombe entre 50 % et 60 % du trajet. */
export const nightAt = (p: number) => smooth((p - 0.5) / 0.1);

/** Part du trajet parcourue (0 → 0,95) : le véhicule ralentit puis s'arrête à l'arrivée. */
export const travelAt = (p: number) => (p < 0.9 ? p : 0.9 + 0.1 * ((p - 0.9) / 0.1 - Math.pow((p - 0.9) / 0.1, 2) / 2));

/** Avancement local (0 → 1) et visibilité (0 → 1, avec fondus d'entrée et de sortie) du chapitre k. */
export function stepWin(p: number, k: number, steps: [number, number][] = STEPS) {
  const [a, b] = steps[k];
  const loc = clamp01((p - a) / (b - a));
  const last = k === steps.length - 1;
  const v = Math.min(clamp01(loc / 0.14), last ? 1 : clamp01((1 - loc) / 0.14));
  return { loc, v: p < a ? 0 : v };
}

/** Réglages propres à chaque route : fenêtres des chapitres et part de nuit (0 = plein jour, 1 = nuit). */
export type JourneyCfg = { steps: [number, number][]; night: (p: number) => number };

export const CLIENT_CFG: JourneyCfg = { steps: STEPS, night: nightAt };

/** Route des partenaires : fenêtres des six chapitres. */
export const PARTNER_STEPS: [number, number][] = [
  [0.04, 0.19],
  [0.19, 0.35],
  [0.35, 0.51],
  [0.51, 0.66],
  [0.66, 0.81],
  [0.81, 1],
];
/** Une journée de travail du véhicule : aube bleutée, plein jour, puis le soir tombe sur la flotte. */
export const partnerNight = (p: number) => (p < 0.15 ? lerp(0.62, 0, smooth(p / 0.15)) : p < 0.62 ? 0 : smooth((p - 0.62) / 0.3));
export const PARTNER_CFG: JourneyCfg = { steps: PARTNER_STEPS, night: partnerNight };

/**
 * Cadrage des scènes 3D selon la forme de l'écran. Les plans de caméra sont écrits pour un écran large. Sur un téléphone
 * tenu en hauteur, le champ de vision horizontal devient minuscule (le véhicule est rogné, l'image paraît « zoomée »).
 * On élargit alors le champ vertical (`fov`, degrés) et on recule la caméra (`zoom` = facteur de recul sur sa distance au
 * point visé) ; `kk` réduit les décalages latéraux des plans. Aucun changement dès que l'écran est plus large que haut.
 */
export function frameFor(aspect: number, baseFov: number) {
  const narrow = clamp01((1.3 - aspect) / 0.85); // 0 à partir de 1,3 ; 1 à 0,45 (téléphone en hauteur)
  return { narrow, fov: baseFov + narrow * 22, zoom: 1 + narrow, kk: Math.max(0.35, Math.min(1, aspect / 1.3)) };
}

/**
 * La 3D n'est tentée que sur un appareil qui s'y prête : pas de « réduire les animations », pas
 * d'économie de données ni de connexion 2G, assez de mémoire et de cœurs, WebGL disponible.
 */
export function canUse3D(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if (nav.connection?.effectiveType && /2g$/.test(nav.connection.effectiveType)) return false;
  if (nav.deviceMemory && nav.deviceMemory < 4) return false;
  if (nav.hardwareConcurrency && nav.hardwareConcurrency < 4) return false;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    return false;
  }
  return true;
}
