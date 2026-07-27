// ============================================================
// Configuration du moteur de carte — pilotée par variables d'env.
//
// RÉVERSIBILITÉ : le choix Mapbox ↔ MapLibre est un simple flag runtime.
//   NEXT_PUBLIC_MAP_ENGINE = 'mapbox' | 'maplibre'  → force explicitement.
//   (non défini) → MapLibre dès qu'une source maison est fournie
//                  (PMTiles ou style URL), sinon Mapbox (historique).
//
// Pour revenir à Mapbox : poser NEXT_PUBLIC_MAP_ENGINE=mapbox et
// redéployer. Aucun changement de code. Le token Mapbox reste en place
// (il sert encore au geocoding / directions, Phases 2-3).
//
// SELF-HOSTING (Phase 1b) : NEXT_PUBLIC_MAP_PMTILES_URL pointe vers ton
// fichier benin.pmtiles (Supabase Storage public ou CDN). Tant qu'il
// n'est pas fourni, on peut passer par NEXT_PUBLIC_MAP_STYLE_URL
// (style MapLibre hébergé) pour évaluer le rendu.
// ============================================================

import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers as protomapsLayers, namedTheme } from 'protomaps-themes-base';

export const PMTILES_URL = process.env.NEXT_PUBLIC_MAP_PMTILES_URL;
export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL;

const explicit = process.env.NEXT_PUBLIC_MAP_ENGINE;
export const MAP_ENGINE: 'mapbox' | 'maplibre' =
  explicit === 'mapbox'
    ? 'mapbox'
    : explicit === 'maplibre'
      ? 'maplibre'
      : PMTILES_URL || MAP_STYLE_URL
        ? 'maplibre'
        : 'mapbox';

// Polices + sprites Protomaps (statiques, libres). À auto-héberger en
// Phase 1b pour zéro dépendance externe résiduelle.
const PM_ASSETS = 'https://protomaps.github.io/basemaps-assets';

// Thème « TamCar Clair » — fond blanc chaud, eau calme, or réservé aux
// autoroutes, verts unifiés, bâtiments discrets, noms de rues contrastés.
// (Base = thème Protomaps « light », on surcharge les couleurs.)
const TAMCAR_THEME = {
  ...namedTheme('light'),
  background: '#E8E9E4', earth: '#F4F3EF', water: '#B4D2E8',
  park_a: '#DDE7CE', park_b: '#D5E0C3', wood_a: '#DBE5CB', wood_b: '#D2DDC0',
  scrub_a: '#DFE7D0', scrub_b: '#D7E0C6',
  sand: '#EFE9D6', beach: '#F0EAD6', buildings: '#E7E4DC', pedestrian: '#ECEAE3',
  minor_service_casing: '#EAE7DF', minor_casing: '#E7E3DA', link_casing: '#E9C878',
  minor_service: '#FFFFFF', minor_a: '#FFFFFF', minor_b: '#FFFFFF', link: '#FBE7B0',
  major_casing_early: '#E3DED2', major_casing_late: '#E3DED2', major: '#FFFFFF',
  highway_casing_early: '#E7C165', highway_casing_late: '#E7C165', highway: '#F7D98C',
  other: '#ECEAE3', boundaries: '#CBC5B8', railway: '#D9D5CC',
  roads_label_major: '#474641', roads_label_major_halo: '#FFFFFF',
  roads_label_minor: '#6C6B65', roads_label_minor_halo: '#FFFFFF',
  city_label: '#26251F', city_label_halo: '#FFFFFF',
  subplace_label: '#4A4941', subplace_label_halo: '#FFFFFF',
  // Police TamCar : Sora (glyphes SDF auto-hébergés dans /public/fonts/Sora).
  regular: 'Sora', bold: 'Sora', italic: 'Sora',
};

let protocolRegistered = false;
export function ensurePmtilesProtocol(): void {
  if (protocolRegistered || typeof window === 'undefined') return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  protocolRegistered = true;
}

/** Le moteur MapLibre a-t-il de quoi afficher une carte ? */
export function maplibreConfigured(): boolean {
  return Boolean(PMTILES_URL || MAP_STYLE_URL);
}

/** Style MapLibre : PMTiles maison prioritaire, sinon style URL fourni. */
export function maplibreStyle(): string | StyleSpecification {
  if (PMTILES_URL) {
    ensurePmtilesProtocol();
    return {
      version: 8,
      glyphs: '/fonts/{fontstack}/{range}.pbf',
      sprite: `${PM_ASSETS}/sprites/v4/light`,
      sources: {
        protomaps: {
          type: 'vector',
          url: `pmtiles://${PMTILES_URL}`,
          attribution: '© OpenStreetMap',
        },
      },
      layers: protomapsLayers('protomaps', TAMCAR_THEME, { lang: 'fr' }),
    } satisfies StyleSpecification;
  }
  return MAP_STYLE_URL as string;
}
