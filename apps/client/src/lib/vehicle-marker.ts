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

/**
 * Cap : un cône court et large posé DEVANT le nez, pas une pointe qui
 * dépasse du capot. Il se lit d'un coup d'œil sans alourdir la silhouette.
 */
function headingCone(color: string): string {
  return (
    `<path d="M20 2.5 L29 11.5 A10 10 0 0 0 11 11.5 Z" fill="${color}" opacity="0.22"/>` +
    `<path d="M20 5.5 L23.6 9.6 L20 8.4 L16.4 9.6 Z" fill="${color}" opacity="0.9"/>`
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
    `<rect x="18.4" y="11" width="3.2" height="6.5" rx="1.6" fill="#111827"/>` +
    `<rect x="18.4" y="28" width="3.2" height="6.5" rx="1.6" fill="#111827"/>` +
    // Guidon
    `<rect x="11.5" y="16.5" width="17" height="2.4" rx="1.2" fill="${dark}"/>` +
    // Cadre et réservoir
    `<path d="M17 15.5 L23 15.5 L24 24 C24 28.5 22.6 30.5 20 30.5 C17.4 30.5 16 28.5 16 24 Z" ` +
    `fill="${color}" stroke="${dark}" stroke-width="1"/>` +
    // Casque du conducteur
    `<circle cx="20" cy="23" r="3.4" fill="${shade(color, 0.75)}" stroke="#111827" stroke-width="0.9"/>` +
    // Phare
    `<rect x="18.2" y="14.6" width="3.6" height="1.8" rx="0.9" fill="#FFF8DC"/>`
  );
}

function tricycleBody(color: string): string {
  const dark = shade(color, 0.5);
  return (
    // Roue avant unique, puis les deux roues arrière
    `<rect x="18.7" y="11.5" width="2.6" height="5.5" rx="1.3" fill="#111827"/>` +
    `<rect x="8.6" y="25.5" width="2.8" height="6.5" rx="1.4" fill="#111827"/>` +
    `<rect x="28.6" y="25.5" width="2.8" height="6.5" rx="1.4" fill="#111827"/>` +
    // Caisse : nez étroit qui s'élargit vers l'arrière — silhouette du kloboto
    `<path d="M17.4 13.5 L22.6 13.5 L27.6 21 C28.8 24 28.8 30.5 27.6 33 ` +
    `L12.4 33 C11.2 30.5 11.2 24 12.4 21 Z" fill="${color}" stroke="${dark}" stroke-width="1.1"/>` +
    // Pare-brise
    `<path d="M17.9 15.4 L22.1 15.4 L24.6 20.4 L15.4 20.4 Z" fill="#1F2937" opacity="0.85"/>` +
    // Auvent (toile tendue sur l'arceau)
    `<rect x="13.4" y="22" width="13.2" height="9.4" rx="2.6" fill="${shade(color, 0.72)}"/>` +
    `<rect x="13.4" y="22" width="13.2" height="2.6" rx="1.3" fill="${dark}" opacity="0.6"/>` +
    // Phare
    `<rect x="18.6" y="12.6" width="2.8" height="1.6" rx="0.8" fill="#FFF8DC"/>`
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
