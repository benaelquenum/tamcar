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
      glyphs: `${PM_ASSETS}/fonts/{fontstack}/{range}.pbf`,
      sprite: `${PM_ASSETS}/sprites/v4/light`,
      sources: {
        protomaps: {
          type: 'vector',
          url: `pmtiles://${PMTILES_URL}`,
          attribution: '© OpenStreetMap',
        },
      },
      layers: protomapsLayers('protomaps', namedTheme('light'), { lang: 'fr' }),
    } satisfies StyleSpecification;
  }
  return MAP_STYLE_URL as string;
}
