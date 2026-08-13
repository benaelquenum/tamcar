/**
 * Marqueurs de véhicule pour les cartes — dessinés, pas photographiés.
 *
 * Une photo détourée réduite à 30 px devient une tache : les détails se
 * brouillent, l'ombre portée bave, et l'avant du véhicule n'est plus
 * identifiable. On dessine donc une silhouette vue de dessus, simplifiée
 * jusqu'à rester lisible à petite taille, avec trois repères de lecture :
 *
 *   • la COULEUR du véhicule (celle du parc, ou celle de la catégorie) ;
 *   • le CAP, porté par le véhicule entier qui pivote, avant en tête ;
 *   • un CÔNE de direction devant le capot, qui lève toute ambiguïté sur
 *     le sens de marche — c'est la convention des applications de
 *     navigation, et elle se lit même quand le véhicule est minuscule.
 *
 * Le repère est orienté vers le HAUT à 0° : la rotation se fait ensuite
 * par transformation CSS sur le conteneur.
 */

export type VehicleCategory = 'moto' | 'tricycle' | 'essentiel' | 'confort' | 'premium';

/** Teintes du parc TamCar, reprises des visuels de catégorie. */
const CATEGORY_COLOR: Record<string, string> = {
  moto: '#2563EB',
  tricycle: '#2563EB',
  essentiel: '#F5B301',
  confort: '#2563EB',
  premium: '#111827',
};

/**
 * `vehicles.color` est un texte libre saisi à la main. On ne reconnaît que
 * les teintes courantes du parc ; tout le reste retombe sur la couleur de
 * la catégorie, ce qui vaut mieux qu'un gris par défaut.
 */
const NAMED_COLORS: [RegExp, string][] = [
  [/jaune|yellow|or\b/i, '#F5B301'],
  [/bleu|blue/i, '#2563EB'],
  [/noir|black/i, '#111827'],
  [/blanc|white/i, '#E8EAED'],
  [/rouge|red/i, '#DC2626'],
  [/vert|green/i, '#16A34A'],
  [/gris|grey|gray|argent|silver/i, '#9AA0A6'],
  [/orange/i, '#F97316'],
];

export function resolveVehicleColor(category?: string, rawColor?: string | null): string {
  if (rawColor) {
    for (const [re, hex] of NAMED_COLORS) {
      if (re.test(rawColor)) return hex;
    }
  }
  return (category && CATEGORY_COLOR[category]) || '#2563EB';
}

/** Assombrit une couleur hex — contours et vitres, sans second réglage. */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v * factor))),
  );
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Le cône de cap, devant le capot. Non rempli pour les véhicules sombres. */
function headingCone(color: string): string {
  return (
    `<path d="M20 3 L27.5 13 A9 9 0 0 0 12.5 13 Z" fill="${color}" opacity="0.28"/>`
  );
}

function carBody(color: string): string {
  const dark = shade(color, 0.55);
  const glass = '#1F2937';
  return (
    // Carrosserie : capot légèrement plus étroit que l'arrière → l'avant
    // se lit sans avoir besoin de couleur différenciée.
    `<path d="M13.5 9 C13.5 6.8 15 5.5 20 5.5 C25 5.5 26.5 6.8 26.5 9 L27.5 22 ` +
    `C27.5 31 26.5 34.5 20 34.5 C13.5 34.5 12.5 31 12.5 22 Z" ` +
    `fill="${color}" stroke="${dark}" stroke-width="1.1"/>` +
    // Pare-brise avant
    `<path d="M15.5 11.5 C17 10.4 23 10.4 24.5 11.5 L25.2 15.5 L14.8 15.5 Z" fill="${glass}" opacity="0.85"/>` +
    // Toit
    `<rect x="14.6" y="16.6" width="10.8" height="7.6" rx="2.2" fill="${shade(color, 1.12)}" opacity="0.55"/>` +
    // Lunette arrière
    `<path d="M15 25.6 L25 25.6 L24 30 C22.6 30.8 17.4 30.8 16 30 Z" fill="${glass}" opacity="0.7"/>` +
    // Rétroviseurs
    `<rect x="10.6" y="14.2" width="2.6" height="2" rx="1" fill="${dark}"/>` +
    `<rect x="26.8" y="14.2" width="2.6" height="2" rx="1" fill="${dark}"/>` +
    // Phares
    `<rect x="15.2" y="6.2" width="3.2" height="1.7" rx="0.85" fill="#FFF8DC"/>` +
    `<rect x="21.6" y="6.2" width="3.2" height="1.7" rx="0.85" fill="#FFF8DC"/>`
  );
}

function motoBody(color: string): string {
  const dark = shade(color, 0.5);
  return (
    // Roues avant et arrière
    `<rect x="18.4" y="5.5" width="3.2" height="7" rx="1.6" fill="#111827"/>` +
    `<rect x="18.4" y="27.5" width="3.2" height="7" rx="1.6" fill="#111827"/>` +
    // Guidon
    `<rect x="11.5" y="13" width="17" height="2.4" rx="1.2" fill="${dark}"/>` +
    // Cadre et réservoir
    `<path d="M17 12 L23 12 L24 22 C24 27 22.6 29.5 20 29.5 C17.4 29.5 16 27 16 22 Z" ` +
    `fill="${color}" stroke="${dark}" stroke-width="1"/>` +
    // Casque du conducteur
    `<circle cx="20" cy="20.5" r="3.6" fill="${shade(color, 0.75)}" stroke="#111827" stroke-width="0.9"/>` +
    // Phare
    `<rect x="18.2" y="11.4" width="3.6" height="1.8" rx="0.9" fill="#FFF8DC"/>`
  );
}

function tricycleBody(color: string): string {
  const dark = shade(color, 0.5);
  return (
    // Roue avant, roues arrière
    `<rect x="18.6" y="5" width="2.8" height="6" rx="1.4" fill="#111827"/>` +
    `<rect x="7.8" y="25" width="3" height="7" rx="1.5" fill="#111827"/>` +
    `<rect x="29.2" y="25" width="3" height="7" rx="1.5" fill="#111827"/>` +
    // Caisse : nez étroit qui s'élargit vers l'arrière — silhouette du kloboto
    `<path d="M17 10 L23 10 L28.5 20 C29.5 24 29.5 30 28 32.5 L12 32.5 ` +
    `C10.5 30 10.5 24 11.5 20 Z" fill="${color}" stroke="${dark}" stroke-width="1.1"/>` +
    // Auvent
    `<rect x="12.8" y="21" width="14.4" height="9" rx="2.4" fill="${shade(color, 0.7)}" opacity="0.9"/>` +
    // Pare-brise
    `<path d="M16.6 12.2 L23.4 12.2 L25.4 18 L14.6 18 Z" fill="#1F2937" opacity="0.8"/>` +
    // Phare
    `<rect x="18.4" y="9.2" width="3.2" height="1.7" rx="0.85" fill="#FFF8DC"/>`
  );
}

export type MarkerOptions = {
  category?: string;
  /** `vehicles.color`, texte libre. Ignoré s'il n'est pas reconnu. */
  color?: string | null;
  /** Anneau bleu « vous êtes ici » — marqueur du chauffeur lui-même. */
  self?: boolean;
  /** Côté du marqueur en pixels. 30 par défaut, 34 pour le véhicule suivi. */
  size?: number;
};

/**
 * SVG complet du marqueur, avant en haut. La rotation vers le cap réel est
 * appliquée par le conteneur, pas ici.
 */
export function vehicleMarkerSvg({
  category,
  color,
  self = false,
  size = 30,
}: MarkerOptions): string {
  const c = resolveVehicleColor(category, color);
  const body =
    category === 'moto' ? motoBody(c)
    : category === 'tricycle' ? tricycleBody(c)
    : carBody(c);

  return (
    `<svg viewBox="0 0 40 40" width="${size}" height="${size}" ` +
    `style="display:block;overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">` +
    (self
      // L'anneau ne tourne pas avec le véhicule : il dit « moi », pas « cap ».
      ? `<circle cx="20" cy="20" r="17.5" fill="none" stroke="#2563EB" stroke-width="2.5" opacity="0.55"/>`
      : '') +
    headingCone(c) +
    body +
    `</svg>`
  );
}
