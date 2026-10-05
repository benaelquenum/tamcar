// Simulateur de gains du propriétaire (partenaire véhicule). Aux recettes minimales prévues au contrat,
// 26 jours actifs par mois :
//   - part course : 30 % du volume, versée chaque mois ;
//   - rachat : 7 % du volume la 1re année, 8 % ensuite, versé à la cession du véhicule au chauffeur ;
//   - voitures : 36 000 F par an de produits de senteur, prélevés sur ce fonds de rachat.
// Les charges du propriétaire (achat, assurance, entretien…) ne sont PAS modélisées : il les maîtrise ; il
// peut les saisir pour obtenir son rendement.

export type CategoryId = 'moto' | 'tricycle' | 'essentiel' | 'confort' | 'vip';

export type Category = {
  id: CategoryId;
  label: string;
  /** Recettes minimales du véhicule par jour (F). */
  floor: number;
  /** Durée du contrat (mois). */
  months: number;
  /** Produits de senteur prélevés sur le fonds (voitures). */
  senteur: boolean;
  note?: string;
};

export const CATEGORIES: Category[] = [
  { id: 'moto', label: 'Moto', floor: 4_500, months: 12, senteur: false },
  { id: 'tricycle', label: 'Tricycle', floor: 8_500, months: 24, senteur: false },
  { id: 'essentiel', label: 'Voiture Essentiel', floor: 12_000, months: 36, senteur: true },
  { id: 'confort', label: 'Voiture Confort', floor: 15_000, months: 48, senteur: true },
  {
    id: 'vip',
    label: 'Voiture VIP',
    floor: 15_000,
    months: 60,
    senteur: true,
    note: 'VIP : recettes minimales à convenir ensemble ; simulation alignée sur le Confort.',
  },
];

export const DAYS_PER_MONTH = 26;
export const PART_COURSE = 0.3;
export const RACHAT_YEAR1 = 0.07;
export const RACHAT_NEXT = 0.08;
export const SENTEUR_PER_YEAR = 36_000;

export type SimResult = {
  /** Volume mensuel du véhicule (F). */
  monthlyVolume: number;
  /** Part en cash, par mois. */
  cashPerMonth: number;
  /** Fonds de rachat versé à la cession, net des produits de senteur. */
  fundNet: number;
  /** Total encaissé sur la durée du contrat. */
  total: number;
  months: number;
  /** Rendement si le coût de revient est connu : marge, % sur la durée, % par an. */
  margin: number | null;
  roi: number | null;
  roiPerYear: number | null;
};

/**
 * @param factor rythme du chauffeur par rapport aux recettes minimales (1 = au minimum, 1,25 = +25 %)
 * @param cost coût de revient du propriétaire pour ce véhicule (achat + ses charges), ou null
 */
export function simulate(cat: Category, factor: number, cost: number | null): SimResult {
  const monthlyVolume = cat.floor * DAYS_PER_MONTH * factor;
  const cashPerMonth = PART_COURSE * monthlyVolume;
  const cash = cashPerMonth * cat.months;
  let fund = 0;
  for (let m = 0; m < cat.months; m++) fund += (m < 12 ? RACHAT_YEAR1 : RACHAT_NEXT) * monthlyVolume;
  const senteur = cat.senteur ? (SENTEUR_PER_YEAR * cat.months) / 12 : 0;
  const fundNet = Math.max(0, fund - senteur);
  const total = cash + fundNet;
  const years = cat.months / 12;
  const hasCost = cost !== null && cost > 0;
  return {
    monthlyVolume,
    cashPerMonth,
    fundNet,
    total,
    months: cat.months,
    margin: hasCost ? total - cost : null,
    roi: hasCost ? (total - cost) / cost : null,
    roiPerYear: hasCost ? (total - cost) / cost / years : null,
  };
}

const NBSP = ' ';

export function fmtF(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, NBSP)}${NBSP}F`;
}

export function fmtM(n: number): string {
  return `${(n / 1_000_000).toFixed(2).replace('.', ',')}${NBSP}M`;
}

export function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${Math.round(n * 100)}${NBSP}%`;
}
