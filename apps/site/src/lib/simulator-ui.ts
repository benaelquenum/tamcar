// Types et mise en forme du simulateur de gains, SANS aucune règle de calcul : ce fichier est envoyé au navigateur.
// Les règles (parts, planchers, durées) sont dans simulator.server.ts, qui ne quitte jamais le serveur.

export type CategoryId = 'moto' | 'tricycle' | 'essentiel' | 'confort' | 'vip';

export const CATEGORY_OPTIONS: { id: CategoryId; label: string }[] = [
  { id: 'moto', label: 'Moto' },
  { id: 'tricycle', label: 'Tricycle' },
  { id: 'essentiel', label: 'Voiture Essentiel' },
  { id: 'confort', label: 'Voiture Confort' },
  { id: 'vip', label: 'Voiture VIP' },
];

export const MAX_QTY = 20;

export type SimRequest = {
  /** Rythme du chauffeur par rapport aux recettes minimales (1 = au minimum, 1,5 = +50 %). */
  factor: number;
  items: { id: CategoryId; qty: number; /** Coût de revient d'un véhicule pour le propriétaire, ou null. */ cost: number | null }[];
};

/** Valeurs POUR UN véhicule de la catégorie. */
export type SimLine = {
  id: CategoryId;
  label: string;
  qty: number;
  months: number;
  /** Recettes minimales du véhicule par jour (F). */
  floor: number;
  cashPerMonth: number;
  fundNet: number;
  total: number;
  margin: number | null;
  roi: number | null;
  roiPerYear: number | null;
  note?: string;
};

export type SimTotals = {
  qty: number;
  cashPerMonth: number;
  fundNet: number;
  total: number;
  cost: number | null;
  margin: number | null;
  roi: number | null;
};

export type SimOutput = { ok: true; lines: SimLine[]; totals: SimTotals; notes: string[] } | { ok: false; error: string };

const NBSP = ' ';

export function fmtF(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, NBSP)}${NBSP}F`;
}

export function fmtM(n: number): string {
  return `${(n / 1_000_000).toFixed(2).replace('.', ',')}${NBSP}M`;
}

export function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${Math.round(n * 100)}${NBSP}%`;
}
