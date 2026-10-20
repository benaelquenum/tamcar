import 'server-only';
import { type CategoryId, type SimLine, type SimOutput, type SimRequest } from './simulator-ui';

// RÈGLES DU SIMULATEUR : confidentielles, elles ne doivent JAMAIS être importées par un composant client
// (le mot-clé « server-only » ci-dessus fait échouer le build si cela arrive). Elles ne sont accessibles qu'à
// un partenaire ou à un administrateur connecté, via l'action serveur de /espace/simulateur.
//
// Aux recettes minimales prévues au contrat, 26 jours actifs par mois :
//   - part course : 30 % du volume, versée chaque mois ;
//   - fonds de rachat : 5 % du volume, versé à la cession du véhicule au chauffeur, sans aucun prélèvement ;
//   - les frais d'entrée de 30 000 F, les senteurs, les gadgets et les forfaits internet sont financés par TamCar sur sa
//     propre part ; aucune avance de démarrage n'est demandée au propriétaire (clé du plan d'affaires v6, 19/10/2026).
// Les charges du propriétaire (achat, assurance, entretien…) ne sont PAS modélisées : il peut les saisir pour
// obtenir son rendement. À tenir alignées avec plan-affaires/build_proposition_flotte.py.

type Category = { label: string; floor: number; months: number; note?: string };

const CATEGORIES: Record<CategoryId, Category> = {
  moto: { label: 'Moto', floor: 4_167, months: 12 },
  tricycle: { label: 'Tricycle', floor: 8_333, months: 36 },
  essentiel: { label: 'Voiture Essentiel', floor: 12_000, months: 36 },
  confort: { label: 'Voiture Confort', floor: 15_000, months: 48 },
  vip: {
    label: 'Voiture VIP',
    floor: 15_000,
    months: 60,
    note: 'VIP : recettes minimales à convenir ensemble ; simulation alignée sur le Confort.',
  },
};

const DAYS_PER_MONTH = 26;
const PART_COURSE = 0.3;
const RACHAT = 0.05; // fonds de rachat : 5 % du volume, versé au propriétaire à la cession

export const KNOWN_CATEGORIES = Object.keys(CATEGORIES) as CategoryId[];

function line(id: CategoryId, qty: number, factor: number, cost: number | null): SimLine {
  const cat = CATEGORIES[id];
  const monthlyVolume = cat.floor * DAYS_PER_MONTH * factor;
  const cashPerMonth = PART_COURSE * monthlyVolume;
  const cash = cashPerMonth * cat.months;
  const fundNet = RACHAT * monthlyVolume * cat.months;
  const total = cash + fundNet;
  const years = cat.months / 12;
  const hasCost = cost !== null && cost > 0;
  return {
    id,
    label: cat.label,
    qty,
    months: cat.months,
    floor: cat.floor,
    cashPerMonth,
    fundNet,
    total,
    margin: hasCost ? total - cost : null,
    roi: hasCost ? (total - cost) / cost : null,
    roiPerYear: hasCost ? (total - cost) / cost / years : null,
    note: cat.note,
  };
}

/** Simule une flotte. L'entrée doit déjà être validée par l'appelant (identifiants connus, quantités entières). */
export function simulateFleet(req: SimRequest): SimOutput {
  const lines = req.items.filter((i) => i.qty > 0).map((i) => line(i.id, i.qty, req.factor, i.cost));
  const costs = req.items.filter((i) => i.qty > 0);
  const allCosted = costs.length > 0 && costs.every((i) => i.cost !== null && i.cost > 0);

  const qty = lines.reduce((a, l) => a + l.qty, 0);
  const cashPerMonth = lines.reduce((a, l) => a + l.qty * l.cashPerMonth, 0);
  const fundNet = lines.reduce((a, l) => a + l.qty * l.fundNet, 0);
  const total = lines.reduce((a, l) => a + l.qty * l.total, 0);
  const cost = allCosted ? costs.reduce((a, i) => a + i.qty * (i.cost as number), 0) : null;

  const notes = [
    `Simulation indicative aux recettes minimales prévues au contrat (${DAYS_PER_MONTH} jours actifs par mois), multipliées par le rythme choisi.`,
    `Part en cash : ${Math.round(PART_COURSE * 100)} % du volume ; fonds de rachat : ${Math.round(RACHAT * 100)} % du volume, versé à la cession, sans prélèvement.`,
    'Aucune avance de démarrage : TamCar avance les frais d’entrée du véhicule (inspection, habillage, kit chauffeur).',
    'Vos propres charges ne sont pas incluses. Ni garantie de rendement, ni engagement avant la signature d’un contrat.',
  ];

  return {
    ok: true,
    lines,
    totals: {
      qty,
      cashPerMonth,
      fundNet,
      total,
      cost,
      margin: cost !== null ? total - cost : null,
      roi: cost !== null && cost > 0 ? (total - cost) / cost : null,
    },
    notes,
  };
}
