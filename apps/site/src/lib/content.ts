// Contenus partagés par plusieurs pages. Les pièces à apporter sont les mêmes que sur l'application
// (apps/client/src/lib/appointment.ts) : à tenir alignées.

export type DocItem = { label: string; note?: string };

const DOCS_COMMUNES: DocItem[] = [
  { label: 'CIP ou carte biométrique CEDEAO en cours de validité' },
  { label: 'Permis de conduire en cours de validité' },
  { label: 'Attestation de résidence' },
  { label: 'Attestation IFU', note: 'si vous n’en avez pas, TamCar fait la démarche d’obtention pour vous' },
  { label: 'Casier judiciaire', note: 'à défaut, une déclaration sur l’honneur à retirer dans nos locaux' },
];

const DOCS_PROPRIETAIRE: DocItem[] = [
  { label: 'Carte grise du véhicule' },
  { label: 'Assurance auto valide' },
  { label: 'Visite technique à jour' },
];

export type Formula = 'cession' | 'proprietaire';

export const FORMULAS: Record<Formula, { label: string; tagline: string; perks: string[]; docs: DocItem[]; vehicleNote: string }> = {
  cession: {
    label: 'Formule Cession',
    tagline: 'TamCar vous fournit le véhicule : il est à vous au terme du contrat.',
    perks: [
      '40 % du prix de chaque course en cash',
      'Un fonds de rachat se constitue à chaque course',
      'Véhicule à vous au terme du contrat : moto 12 mois, tricycle 24 mois, voiture 3 à 5 ans',
      'Assurance et grosses réparations couvertes pendant toute la durée du contrat',
    ],
    docs: DOCS_COMMUNES,
    vehicleNote: 'TamCar vous fournit le véhicule : aucun papier de véhicule à apporter.',
  },
  proprietaire: {
    label: 'Formule Propriétaire',
    tagline: 'Vous venez avec votre propre voiture et roulez librement.',
    perks: ['80 % du prix de chaque course pour vous', 'Votre voiture, vos règles', 'Entretien à votre charge', 'Aucun engagement de durée'],
    docs: [...DOCS_COMMUNES, ...DOCS_PROPRIETAIRE],
    vehicleNote: 'Vous venez avec votre véhicule : ses papiers sont à apporter.',
  },
};

export const VEHICLE_PROFILES = [
  { cat: 'Moto', duration: '12 mois', profile: 'Moto neuve ou d’occasion en bon état, contrôlée à l’entrée.' },
  { cat: 'Tricycle', duration: '24 mois', profile: 'Tricycle passagers, contrôlé à l’entrée.' },
  { cat: 'Voiture Essentiel', duration: '3 ans', profile: 'Citadine ou compacte essence, 4 à 5 places, climatisée, en bon état, moins de 120 000 km. Par exemple : Toyota Yaris, Kia Picanto, Suzuki Swift, Hyundai Elantra.' },
  { cat: 'Voiture Confort', duration: '4 ans', profile: 'Berline compacte ou crossover spacieux, climatisé, entretien impeccable. Par exemple : Toyota Corolla, Kia K3 / Cerato, Toyota Venza.' },
  { cat: 'Voiture VIP', duration: '5 ans', profile: 'Véhicule récent et soigné. Par exemple : Toyota Starlet, Hyundai Accent.' },
];

export const PARTNER_FAQ = [
  {
    q: 'Qui conduit mon véhicule ?',
    a: 'Un chauffeur vérifié par TamCar : ses pièces sont contrôlées en personne, sa photo officielle est prise et contrôlée par TamCar. Vous n’avez ni recrutement ni gestion quotidienne.',
  },
  {
    q: 'Suis-je toujours propriétaire du véhicule ?',
    a: 'Oui. Vous restez propriétaire légal pendant toute la durée du contrat (réserve de propriété). Le véhicule n’est cédé au chauffeur qu’au terme, et vous faites alors les formalités de transfert.',
  },
  {
    q: 'Que se passe-t-il si le chauffeur ne fait pas assez de recettes ?',
    a: 'Le chauffeur s’engage sur un niveau de recettes. S’il ne le tient pas durablement, TamCar le remplace ou vous rend le véhicule : vous n’êtes jamais bloqué avec un chauffeur inactif.',
  },
  {
    q: 'Qu’est-ce que le fonds de rachat ?',
    a: 'Une part de chaque course est mise de côté pour le rachat du véhicule par le chauffeur. À la cession, ce fonds vous revient en complément de votre part mensuelle. Les conditions chiffrées figurent dans la proposition et dans votre contrat.',
  },
  {
    q: 'Quelles charges restent à ma charge ?',
    a: 'Les charges de propriété : assurance, visite technique, grosses réparations. Le carburant, le lavage, l’entretien courant et l’usure normale sont à la charge du chauffeur.',
  },
  {
    q: 'Puis-je confier plusieurs véhicules ?',
    a: 'Oui. Chaque véhicule génère sa propre part, suivie séparément dans votre espace partenaire.',
  },
  {
    q: 'Comment suis-je payé ?',
    a: 'Votre part s’ajoute à votre portefeuille à chaque course terminée, visible en direct dans votre espace. Les versements sont enregistrés par l’équipe TamCar et apparaissent aussi dans votre espace.',
  },
];
