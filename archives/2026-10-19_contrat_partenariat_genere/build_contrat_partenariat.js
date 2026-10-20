// Contrat de partenariat véhicule : Tam Logistics SARL (TamCar) × propriétaire de véhicules (Afric Group Consulting).
// Projet du 19 octobre 2026, aligné sur le plan d'affaires v6. Le projet du 11 octobre 2026 est archivé dans archives/2026-10-11_contrat_partenaire_vehicule.
// Usage : NODE_PATH=<dossier contenant node_modules/docx> node build_contrat_partenariat.js   → écrit D:\TERENCE\TamCar\App\TamCar_contrat_partenariat_vehicule.docx
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Header, Footer,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, Tab, TabStopType,
} = require('docx');

const OUT = 'D:/TERENCE/TamCar/App/TamCar_contrat_partenariat_vehicule.docx';
const LOGO = 'D:/TERENCE/TamCar/App/plan-affaires/assets/logo-couleur.png';
const DATE = '19 octobre 2026';
const NB = '\u00a0';
const FONT = 'Arial';
const BLUE = '1E3A8A';
const GREY = '475569';
const LINE = 'CBD5E1';
const W = 9638; // largeur utile (A4, marges de 2 cm)

// ---------- Chiffres (mêmes formules que la proposition) ----------
const JOURS_AN = 312, PART = 0.30, FONDS = 0.05;
const CATS = [
  { nom: 'Essentiel', n: 6, plancher: 12000, ans: 3 },
  { nom: 'Confort', n: 3, plancher: 15000, ans: 4 },
  { nom: 'VIP', n: 1, plancher: 15000, ans: 5 },
];
function calc(c) {
  const vol = c.plancher * JOURS_AN;
  const rachatNet = FONDS * vol * c.ans;
  const cash = PART * vol * c.ans;
  return { cashMois: PART * c.plancher * 26, rachatNet, total: cash + rachatNet };
}
const num = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
const k = (v) => num(Math.round(v / 1000) * 1000);

// ---------- Typographie française + balisage ----------
function fr(s) {
  return s
    .replace(/(?<=\S) ([:;!?»])/g, NB + '$1')
    .replace(/(«) /g, '$1' + NB)
    .replace(/(\d) (\d{3})\b/g, '$1' + NB + '$2')
    .replace(/(\d) (F CFA|F|FCFA|km|ans|an|mois|jours?|%|‰)(?![\p{L}])/gu, '$1' + NB + '$2')
    .replace(/\b([Aa]rticles?|[Aa]nnexes?|art\.) (\d)/g, '$1' + NB + '$2');
}
// **gras**, {{à compléter}} (surligné), _italique_ non géré volontairement
function runs(text, base = {}) {
  const out = [];
  for (const part of fr(text).split(/(\*\*[^*]+\*\*|\{\{[^}]+\}\})/)) {
    if (!part) continue;
    if (part.startsWith('**')) out.push(new TextRun({ ...base, text: part.slice(2, -2), bold: true }));
    else if (part.startsWith('{{')) out.push(new TextRun({ ...base, text: '[' + part.slice(2, -2) + ']', highlight: 'yellow' }));
    else out.push(new TextRun({ ...base, text: part }));
  }
  return out;
}

const P = (text, o = {}) => new Paragraph({
  alignment: o.align ?? AlignmentType.JUSTIFIED,
  spacing: { after: o.after ?? 100, before: o.before ?? 0, line: 276 },
  indent: o.indent,
  keepNext: o.keepNext,
  children: runs(text, o.run ?? {}),
});
// Clause numérotée : « 3.1 » en marge, texte en retrait
const Cl = (n, text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 100, line: 276 },
  indent: { left: 567, hanging: 567 },
  children: [new TextRun({ text: n, bold: true, color: BLUE }), new TextRun({ children: [new Tab()] }), ...runs(text)],
});
const B = (text) => new Paragraph({
  numbering: { reference: 'bul', level: 0 },
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 60, line: 276 },
  children: runs(text),
});
const Art = (n, title, o = {}) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  keepNext: true,
  pageBreakBefore: o.pageBreak,
  children: [new TextRun({ text: `Article${NB}${n} — ${title}` })],
});
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun({ text: fr(text) })] });

const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: none, bottom: none, left: none, right: none };

function cell(content, width, o = {}) {
  const paras = Array.isArray(content) ? content : [content];
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: o.noBorder ? noBorders : borders,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    columnSpan: o.span,
    verticalAlign: o.valign,
    children: paras.map((p) => (typeof p === 'string'
      ? new Paragraph({ alignment: o.align ?? AlignmentType.LEFT, spacing: { after: 20, line: 260 }, children: runs(p, { size: o.size ?? 19, bold: o.bold }) })
      : p)),
  });
}
function table(widths, rows, o = {}) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, i) => new TableRow({
      cantSplit: true,
      tableHeader: o.header && i === 0,
      children: r.map((c, j) => cell(c, widths[j], {
        fill: o.header && i === 0 ? 'EFF6FF' : (o.firstColFill && j === 0 ? 'F8FAFC' : undefined),
        bold: (o.header && i === 0) || (o.firstColBold && j === 0),
        align: o.aligns ? o.aligns[j] : undefined,
      })),
    })),
  });
}
const gap = (after = 120) => new Paragraph({ spacing: { after }, children: [] });

// ---------- Contenu ----------
const children = [];

// En-tête de première page
children.push(new Paragraph({
  spacing: { after: 60 },
  children: [new ImageRun({ type: 'png', data: fs.readFileSync(LOGO), transformation: { width: 84, height: 67 }, altText: { title: 'TamCar', description: 'Logo TamCar', name: 'logo' } })],
}));
children.push(new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: 'CONTRAT DE PARTENARIAT VÉHICULE', bold: true, size: 40, color: BLUE })] }));
children.push(new Paragraph({
  spacing: { after: 200 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '2563EB', space: 8 } },
  children: [new TextRun({ text: fr('Mise en flotte de véhicules sur la plateforme TamCar, avec cession au chauffeur à l’issue du contrat'), size: 22, color: GREY })],
}));

// Encadré « projet »
children.push(new Table({
  width: { size: W, type: WidthType.DXA },
  columnWidths: [W],
  rows: [new TableRow({
    children: [new TableCell({
      width: { size: W, type: WidthType.DXA },
      borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'EAB308' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'EAB308' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'EAB308' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'EAB308' } },
      shading: { type: ShadingType.CLEAR, fill: 'FEF9C3', color: 'auto' },
      margins: { top: 90, bottom: 90, left: 140, right: 140 },
      children: [new Paragraph({ spacing: { after: 0, line: 260 }, children: runs(`**PROJET du ${DATE} — non signé.** Ce document est confidentiel. Il doit être relu par un juriste (droit béninois et OHADA) avant toute signature. Les passages surlignés sont à compléter ou à valider ; la dernière page recense les points à trancher et se retire avant signature.`, { size: 18 }) })],
    })],
  })],
}));
children.push(gap(160));

children.push(P('**ENTRE LES SOUSSIGNÉS**', { align: AlignmentType.LEFT, keepNext: true }));
children.push(P(`**Tam Logistics SARL**, exploitant la plateforme TamCar, société à responsabilité limitée de droit béninois {{en cours de constitution — à mettre à jour à l’immatriculation}}, au capital de {{35 000 000}} F CFA, dont le siège est à Cotonou (Bénin), {{adresse}}, immatriculée au RCCM sous le numéro {{RCCM}}, IFU {{IFU}}, représentée par M. Térence Quenum, fondateur et gérant, dûment habilité, ci-après « **TamCar** » ;`));
children.push(P('d’une part,', { align: AlignmentType.LEFT }));
children.push(P('**ET**', { align: AlignmentType.LEFT, keepNext: true }));
children.push(P(`**Afric Group Consulting**, {{forme juridique}} au capital de {{capital}} F CFA, dont le siège est à {{adresse}}, immatriculée au RCCM sous le numéro {{RCCM}}, IFU {{IFU}}, représentée par M. {{prénom}} Ouedraogo, {{qualité}}, dûment habilité, ci-après le « **Partenaire** » ;`));
children.push(P('d’autre part.', { align: AlignmentType.LEFT }));
children.push(P('TamCar et le Partenaire sont désignés ensemble les « **Parties** » et séparément une « **Partie** ».'));

children.push(P('**PRÉAMBULE**', { align: AlignmentType.LEFT, before: 120, keepNext: true }));
children.push(P('**A.** TamCar exploite une plateforme de transport avec chauffeur à Cotonou et dans le Grand Nokoué. Dans sa formule dite « **Cession** », un véhicule est confié à un chauffeur indépendant, qui en devient propriétaire au terme du contrat sans paiement supplémentaire : une part de chaque course alimente un fonds de rachat, qui rémunère la cession auprès du propriétaire.'));
children.push(P('**B.** Le Partenaire possède des véhicules qu’il souhaite faire travailler sur la plateforme. Il perçoit une part de chaque course, qu’il suit sur une plateforme dédiée et dont il peut demander le versement à tout moment après un mois d’activité, puis le prix de cession en fin de contrat.'));
children.push(P('**C.** À la différence d’autres plateformes, TamCar ne demande **aucune avance de démarrage** au Partenaire : elle avance elle-même les frais d’entrée des véhicules (article 9.1) et les finance sur sa propre part de chaque course.'));
children.push(P(`**D.** Le Partenaire est {{ou sera à la constitution de TamCar — à confirmer}} associé de TamCar. Le présent contrat est conclu aux conditions de marché, en tant que contrat distinct du pacte d’associés ; les revenus qu’il procure au Partenaire ne sont pas des dividendes.`));
children.push(P('**IL A ÉTÉ CONVENU CE QUI SUIT :**', { align: AlignmentType.LEFT, before: 80 }));

// Art. 1
children.push(Art(1, 'Définitions'));
children.push(table([2300, 7338], [
  ['**Plateforme**', 'L’application de transport TamCar (applications client et chauffeur, site internet et espace partenaire), éditée par TamCar.'],
  ['**Véhicule**', 'Chaque véhicule du Partenaire accepté par TamCar et décrit dans une fiche véhicule conforme à l’Annexe 1.'],
  ['**Catégorie**', 'Essentiel, Confort ou VIP, selon l’Annexe 2.'],
  ['**Chauffeur**', 'Le chauffeur indépendant, agréé par TamCar, auquel un Véhicule est confié dans la formule Cession.'],
  ['**Volume**', 'Le prix total des courses terminées par le Véhicule sur la Plateforme.'],
  ['**Jour actif**', 'Tout jour du lundi au samedi, à l’exception des jours non travaillés reconnus par TamCar (panne, maladie, force majeure).'],
  ['**Recettes minimales**', 'Le Volume minimal par Jour actif propre à chaque Catégorie (Annexe 2).'],
  ['**Part du Partenaire**', '30 % du Volume (article 9.2).'],
  ['**Espace partenaire**', 'La plateforme dédiée où le Partenaire suit ses gains et demande leur versement (articles 9.3 et 9.5).'],
  ['**Part disponible**', 'La Part du Partenaire déjà créditée et effectivement encaissée par TamCar, non encore versée au Partenaire (article 9.5).'],
  ['**Fonds de rachat** ou **Fonds**', 'La réserve de 5 % du Volume, tenue par TamCar au nom du Chauffeur, qui sert à payer le prix de Cession (articles 5.3 et 9.4).'],
  ['**Frais d’entrée**', 'Les frais de mise en service d’un Véhicule avancés par TamCar : inspection, habillage TamCar et kit chauffeur, soit 30 000 F CFA (Annexe 3).'],
  ['**Mise en service**', 'La date de la première course du Véhicule sur la Plateforme, après une inspection d’entrée satisfaisante.'],
  ['**Durée**', 'La durée de la Catégorie du Véhicule (article 4.2).'],
  ['**Cession**', 'Le transfert de propriété du Véhicule au Chauffeur au terme de la Durée (article 5.3).'],
], { firstColFill: true }));
children.push(gap(60));

// Art. 2
children.push(Art(2, 'Objet'));
children.push(Cl('2.1', 'Le présent contrat fixe les conditions dans lesquelles le Partenaire confie des Véhicules à TamCar pour qu’ils soient exploités sur la Plateforme par des Chauffeurs en formule Cession, la rémunération du Partenaire, et l’organisation de la Cession au terme.'));
children.push(Cl('2.2', 'TamCar organise la Plateforme, sélectionne les Chauffeurs, encaisse et répartit les paiements, tient le Fonds de rachat et gère la Cession. TamCar n’acquiert aucun droit de propriété sur les Véhicules.'));

// Art. 3
children.push(Art(3, 'Véhicules admis'));
children.push(Cl('3.1', 'Chaque Véhicule est accepté après une **inspection d’entrée** réalisée par TamCar. TamCar peut refuser, par écrit et en motivant sa décision, un véhicule non conforme aux conditions ci-dessous.'));
children.push(Cl('3.2', 'Conditions communes à toutes les Catégories :'));
children.push(B('motorisation essence (ni diesel à filtre à particules, ni hybride rechargeable, ni électrique), boîte de vitesses classique (pas de boîte à double embrayage), deux roues motrices, pneus standards, climatisation ;'));
children.push(B('papiers en règle : carte grise au nom du Partenaire, véhicule dédouané, visite technique valide, assurance conforme à l’article 6.1 ;'));
children.push(B('**Essentiel** : citadine ou compacte essence, 4 à 5 places, en bon état, moins de 120 000 km ; **Confort** : berline compacte ou crossover spacieux, entretien impeccable ; **VIP** : véhicule récent et soigné.'));
children.push(Cl('3.3', 'La fiche véhicule (Annexe 1), signée par les deux Parties à l’issue de l’inspection, vaut état des lieux d’entrée. Un véhicule supplémentaire s’ajoute au contrat par une nouvelle fiche, sans autre formalité.'));
children.push(Cl('3.4', 'Le Partenaire garantit qu’il est propriétaire de chaque Véhicule, que celui-ci est libre de tout gage, saisie ou litige non déclaré, que ses papiers sont authentiques et qu’il a été régulièrement importé et dédouané.'));

// Art. 4
children.push(Art(4, 'Durée et engagement minimum'));
children.push(Cl('4.1', 'Le contrat prend effet à la signature et reste en vigueur tant qu’au moins un Véhicule est en flotte.'));
children.push(Cl('4.2', 'La Durée de chaque Véhicule court à compter de sa Mise en service : **Essentiel 3 ans, Confort 4 ans, VIP 5 ans**. Elle est prolongée du nombre de jours non travaillés reconnus par TamCar au Chauffeur (panne, maladie, force majeure), la Part du Partenaire étant due aussi longtemps que le Véhicule travaille.'));
children.push(Cl('4.3', 'Le Partenaire s’engage à maintenir chaque Véhicule en flotte pendant **12 mois au moins** à compter de sa Mise en service. S’il le retire avant, hors manquement de TamCar, il rembourse à TamCar les Frais d’entrée **au prorata des mois restants sur les 12** (soit 30 000 F × mois restants ÷ 12), dans les 30 jours de la demande, et l’article 12.4 s’applique.'));
children.push(Cl('4.4', 'Passé ce délai, le Partenaire ne peut retirer un Véhicule avant la Cession que dans les cas prévus à l’article 15.'));

// Art. 5
children.push(Art(5, 'Propriété et Cession'));
children.push(Cl('5.1', 'Le Partenaire **reste propriétaire légal** de chaque Véhicule et titulaire de la carte grise jusqu’à la Cession.'));
children.push(Cl('5.2', 'Pendant la Durée, le Partenaire s’interdit de vendre le Véhicule, de le donner en gage, de le louer à un tiers ou de le retirer de la flotte, sauf dans les cas prévus au contrat.'));
children.push(Cl('5.3', '**Cession au Chauffeur.** Au terme de la Durée, si le Chauffeur a respecté ses engagements, le Partenaire vend le Véhicule au Chauffeur pour un **prix égal au solde du Fonds de rachat**, quel qu’il soit. TamCar verse ce solde au Partenaire, contre la facture normalisée prévue à l’article 9.7 ; le Partenaire remet la carte grise, le quitus et les pièces de mutation dans les 15 jours de la demande de TamCar. Les frais de mutation sont à la charge du Chauffeur.'));
children.push(Cl('5.4', 'Le Partenaire reconnaît que ce prix peut être inférieur à la valeur de marché du Véhicule : sa rémunération est constituée de la Part du Partenaire, perçue au fil des courses, et du solde du Fonds.'));
children.push(Cl('5.5', 'Le Chauffeur n’acquiert aucun droit sur le Véhicule avant la Cession. Après la Cession, le Véhicule peut continuer à travailler sur la Plateforme sous la formule propriétaire ; le présent contrat prend fin pour ce Véhicule, sous réserve des articles 12 à 14 et 19, qui survivent.'));

// Art. 6
children.push(Art(6, 'Obligations du Partenaire'));
children.push(Cl('6.1', '**Assurance.** Le Partenaire souscrit et maintient en cours de validité, à ses frais, une assurance responsabilité civile couvrant l’**usage « transport public de personnes / taxi »**. Une assurance d’usage « promenade et affaires » ne suffit pas : en cas de sinistre, l’assureur pourrait refuser de couvrir le transport rémunéré de passagers. TamCar peut proposer une police flotte groupe, à laquelle l’adhésion est facultative. Le Partenaire remet l’attestation à TamCar avant la Mise en service et à chaque renouvellement ; un Véhicule sans assurance conforme est suspendu.'));
children.push(Cl('6.2', '**Entretien et réparations.** L’entretien périodique, les pièces d’usure et les réparations sont à la charge du Partenaire, à l’exception des dégradations imputables au Chauffeur, que TamCar réclame au Chauffeur selon le contrat de celui-ci. Le carburant, la recharge et le lavage sont à la charge du Chauffeur.'));
children.push(Cl('6.3', '**Papiers, taxes et autorisations.** Le Partenaire maintient à jour, à ses frais, la visite technique et les droits et taxes attachés au Véhicule, dont la taxe sur les véhicules à moteur pendant la Durée ; cette taxe incombe au Chauffeur à compter de la Cession. {{Autorisations d’exploitation ANATT : qui les détient et qui en supporte le coût — à confirmer par écrit.}}'));
children.push(Cl('6.4', '**Traceur GPS.** Le Partenaire équipe chaque Véhicule d’un traceur GPS certifié ANATT, à ses frais, avant la Mise en service (article 10.4).'));
children.push(Cl('6.5', '**Réactivité.** Le Partenaire diagnostique et répare toute panne ou tout dommage dans les meilleurs délais, et au plus tard dans les {{5}} jours ouvrés suivant la signalisation de TamCar (article 10.1).'));
children.push(Cl('6.6', '**Pas de reprise de force.** Le Partenaire s’interdit de reprendre le Véhicule ou d’entraver son usage par lui-même (notamment par le traceur), de donner des instructions au Chauffeur ou de le solliciter pour des courses privées. Toute reprise passe par TamCar, selon l’article 15.'));
children.push(Cl('6.7', '**Information.** Le Partenaire informe sans délai TamCar de tout gage, saisie, litige, sinistre ou changement de sa situation (dissolution, procédure collective, changement de représentant).'));

// Art. 7
children.push(Art(7, 'Obligations de TamCar'));
children.push(Cl('7.1', 'TamCar :'));
children.push(B('réalise l’inspection d’entrée et **avance les Frais d’entrée** (inspection, habillage TamCar, kit chauffeur) ;'));
children.push(B('sélectionne et agrée les Chauffeurs (identité, permis, vérifications d’usage) et conclut avec eux un contrat distinct, qui les oblige notamment à atteindre les Recettes minimales, à accepter les courses reçues dans la Plateforme dans les limites qu’il fixe, à garer le Véhicule en lieu sûr la nuit et à ne pas l’exploiter hors Plateforme ;'));
children.push(B('exploite la Plateforme, encaisse les paiements et **répartit automatiquement** chaque course ;'));
children.push(B('tient le Fonds de rachat séparément de ses fonds propres, au nom du Chauffeur ;'));
children.push(B('met à disposition du Partenaire une **plateforme dédiée**, l’espace partenaire, où il suit ses gains, demande leur versement et retrouve ses relevés (articles 9.3 à 9.8) ;'));
children.push(B('organise des inspections périodiques du Véhicule, selon une fréquence qu’elle fixe, et signale au Partenaire les anomalies constatées ;'));
children.push(B('remplace le Chauffeur dans les cas de l’article 8.4 et organise la Cession au terme ;'));
children.push(B('désigne un interlocuteur chargé de la relation avec le Partenaire.'));
children.push(Cl('7.2', 'TamCar assume une obligation de moyens pour le fonctionnement de la Plateforme.'));

// Art. 8
children.push(Art(8, 'Le Chauffeur et les Recettes minimales'));
children.push(Cl('8.1', 'Le Chauffeur est un travailleur indépendant. Il n’est salarié ni de TamCar ni du Partenaire.'));
children.push(Cl('8.2', '**Recettes minimales.** Le contrat du Chauffeur l’oblige à atteindre chaque Jour actif les Recettes minimales de sa Catégorie (Annexe 2).'));
children.push(Cl('8.3', '**Complément.** Lorsque le Volume d’un Jour actif est inférieur aux Recettes minimales, TamCar prélève le complément sur le compte du Chauffeur. Le Volume retenu pour calculer la Part du Partenaire et l’alimentation du Fonds est alors le plus élevé entre le Volume réel et les Recettes minimales, **dans la limite des sommes effectivement recouvrées auprès du Chauffeur**. TamCar ne garantit ni la solvabilité du Chauffeur, ni un volume de courses.'));
children.push(Cl('8.4', '**Défaillance durable.** Si le Volume moyen du Véhicule, sur {{4}} semaines consécutives, reste inférieur aux Recettes minimales, TamCar met le Chauffeur en demeure. Faute de redressement dans les {{2}} semaines, TamCar remplace le Chauffeur. Si aucun remplaçant n’est affecté dans les {{30}} jours, le Partenaire peut demander la restitution du Véhicule (article 15.4).'));
children.push(Cl('8.5', '**Vacance.** Pendant une période sans Chauffeur, aucune Part du Partenaire n’est due, faute de courses. Le sort du Fonds du Chauffeur sortant est réglé par l’article 12.'));

// Art. 9
children.push(Art(9, 'Conditions financières, versements et facturation'));
children.push(Cl('9.1', '**Aucune avance.** Le Partenaire ne verse ni avance de démarrage, ni droit d’entrée, ni dépôt de garantie. TamCar avance les Frais d’entrée de chaque Véhicule (Annexe 3) et les finance sur sa propre part de chaque course, sous réserve de l’article 4.3.'));
children.push(Cl('9.2', '**Répartition du Volume.** La Plateforme répartit automatiquement chaque course terminée. Sur le Volume : (i) **30 %** constituent la Part du Partenaire ; (ii) **5 %** alimentent le Fonds de rachat ; (iii) le solde revient au Chauffeur et à TamCar, selon leurs conditions propres. Aucun autre prélèvement n’est opéré sur la Part du Partenaire ni sur le Fonds.'));
children.push(Cl('9.3', '**Espace partenaire : suivi des gains.** TamCar met à la disposition du Partenaire une plateforme dédiée, l’espace partenaire, accessible par des identifiants personnels. Le Partenaire y consulte, Véhicule par Véhicule et à tout moment, ses gains (la Part du Partenaire créditée au fil des courses terminées), sa Part disponible, le solde du Fonds, l’historique de ses demandes et de ses versements, ainsi que ses relevés. Les données affichées sont mises à jour au fil des courses ; les relevés mensuels (article 9.8) font foi, sauf erreur manifeste. L’accès est strictement personnel et soumis à l’article 13.'));
children.push(Cl('9.4', '**Fonds de rachat.** Le Fonds est tenu au nom du Chauffeur, séparément des fonds propres de TamCar. Il sert à payer le prix de Cession (article 5.3) ou à être réparti en cas de fin anticipée (article 12). Il n’est pas disponible avant la Cession. Hors les cas prévus au présent contrat, aucune somme n’en est prélevée.'));
children.push(Cl('9.5', '**Demande de versement.** Le Partenaire peut demander à TamCar le versement de sa Part disponible **à tout moment**, dès qu’un mois d’activité s’est écoulé depuis la Mise en service de son premier Véhicule. Il formule sa demande depuis l’espace partenaire ou, à défaut, par écrit. TamCar verse le montant demandé, dans la limite de la Part disponible, par Mobile Money ou par virement sur le compte indiqué à l’Annexe 1, dans un délai de {{2}} jours ouvrés à compter de la demande et sous réserve de la facture normalisée prévue à l’article 9.7. La Part disponible reste inscrite au nom du Partenaire tant qu’elle n’est pas versée. TamCar ne verse que ce qu’elle a effectivement encaissé.'));
children.push(Cl('9.6', '**Frais de transaction.** Les frais de transaction liés à chaque versement (frais de l’opérateur de paiement, de Mobile Money ou de virement bancaire, y compris les frais de retrait) sont **à la charge du Partenaire**. Ils sont déduits du montant versé et leur montant est indiqué au Partenaire avant la validation de sa demande. TamCar les répercute au coût facturé par l’opérateur de paiement.'));
children.push(Cl('9.7', '**Facturation normalisée et AIB.** Les sommes perçues par le Partenaire au titre du présent contrat (Part du Partenaire et solde du Fonds à la Cession) font l’objet de **factures normalisées**, conformes à l’article 481 du Code général des impôts dans sa rédaction en vigueur. Pour chaque versement, la facture est établie sur la base du relevé de l’espace partenaire {{par le Partenaire, ou par TamCar pour son compte — mécanisme de facturation à confirmer avec l’expert-comptable}}. TamCar est **chargée de retenir l’acompte sur impôt assis sur les bénéfices (AIB)**, selon les circonstances (notamment la situation du Partenaire au regard de l’identifiant fiscal unique et la nature de l’opération) et conformément à la réglementation en vigueur ; elle le reverse à l’administration fiscale dans les délais légaux et remet au Partenaire le justificatif de la retenue. Le montant versé est le montant de la facture, net de l’AIB et des frais de transaction (article 9.6). TamCar peut différer un versement tant que la facture normalisée conforme ne lui a pas été remise.'));
children.push(Cl('9.8', '**Relevés et contestation.** TamCar met à disposition un relevé mensuel par Véhicule : Jours actifs, Part du Partenaire, solde du Fonds, versements, retenues et frais. Le Partenaire dispose de 30 jours pour le contester par écrit ; TamCar répond sous 15 jours.'));
children.push(Cl('9.9', '**Compensation.** TamCar peut compenser, sur la Part disponible, toute somme certaine, liquide et exigible due par le Partenaire (notamment au titre de l’article 4.3), après l’en avoir informé.'));
children.push(Cl('9.10', '**Impôts et taxes.** Chaque Partie supporte les impôts et taxes qui la concernent. Le Partenaire reste seul redevable de ses propres impôts ; l’AIB retenu par TamCar s’impute sur ses obligations dans les conditions prévues par la réglementation. {{Régime de TVA applicable à la Part du Partenaire (hors taxes ou toutes taxes comprises) à confirmer avec l’expert-comptable.}}'));
children.push(Cl('9.11', '**Pas de garantie de rendement.** Les chiffres de l’Annexe 2 sont des illustrations calculées aux Recettes minimales, sur 26 Jours actifs par mois. Ils ne garantissent ni un volume de courses, ni un rendement.'));
children.push(Cl('9.12', '**Aucune autre charge.** Aucun frais, prélèvement ou retenue autre que ceux du présent contrat (dont les frais de transaction de l’article 9.6 et l’AIB de l’article 9.7) ne peut être mis à la charge du Partenaire sans avenant signé.'));

// Art. 10
children.push(Art(10, 'Immobilisation, sinistre, vol et traceur'));
children.push(Cl('10.1', '**Immobilisation.** Lorsqu’un Véhicule est immobilisé plus de {{5}} jours ouvrés (panne, accident), le Partenaire le répare ou le remplace par un véhicule équivalent. Pendant l’immobilisation, aucune Part du Partenaire n’est due, faute de courses ; les jours non travaillés prolongent la Durée (article 4.2).'));
children.push(Cl('10.2', '**Sinistre.** Les dommages au Véhicule et aux tiers relèvent de l’assurance du Partenaire. La franchise et les dégradations imputables à une faute du Chauffeur sont réclamées au Chauffeur par TamCar, d’abord sur le Fonds.'));
children.push(Cl('10.3', '**Vol et perte totale.** Le vol dû à une négligence du Chauffeur (clés laissées, stationnement non sécurisé) est une dette du Chauffeur. Le vol avec effraction ou agression, établi par procès-verbal, est un risque du Partenaire et de son assureur. En cas de perte totale ou de vol non résolu, la Durée prend fin pour ce Véhicule et le Fonds est réparti selon l’article 12.'));
children.push(Cl('10.4', '**Traceur.** Le traceur est certifié ANATT et installé avant la Mise en service. Il appartient au Partenaire, qui accorde à TamCar un accès en lecture aux positions. **Aucun coupe-circuit ne peut être activé sur un véhicule en circulation** : il ne peut l’être qu’à l’arrêt, en cas de vol déclaré ou de résiliation prononcée, après notification à TamCar et au Chauffeur.'));

// Art. 11
children.push(Art(11, 'Exclusivité'));
children.push(Cl('11.1', 'Pendant la Durée, le Véhicule ne peut être exploité sur aucune plateforme concurrente de transport avec chauffeur ni mis à disposition hors Plateforme pour des courses payantes. Le Partenaire s’y engage pour lui-même et fait respecter cette règle au Chauffeur via son contrat.'));
children.push(Cl('11.2', 'En cas de manquement du Partenaire, TamCar peut résilier le contrat pour faute (article 15.2), sans préjudice d’une pénalité forfaitaire de {{montant}} F CFA par Véhicule concerné et de dommages et intérêts.'));

// Art. 12
children.push(Art(12, 'Fin anticipée : sort du Fonds de rachat'));
children.push(Cl('12.1', 'Lorsque le contrat du Chauffeur prend fin avant le terme de la Durée, le solde du Fonds est d’abord affecté au paiement des sommes dues par le Chauffeur (dettes sur son compte, dégâts imputables), puis réparti comme suit.'));
children.push(Cl('12.2', '**Départ pour faute du Chauffeur** (défaut, abandon, non-performance persistante, faute grave) : le solde est **acquis à 100 % au Partenaire**. La faute est appréciée par TamCar, sur preuves (données de la Plateforme, rapports d’incident, inspections). Le Partenaire ne peut ni la déclarer à la place de TamCar ni la provoquer ; si une manœuvre de sa part est établie, le solde est restitué au Chauffeur.'));
children.push(Cl('12.3', '**Départ sans faute du Chauffeur** (maladie, invalidité, décès, force majeure, défaut du Véhicule ou de la Plateforme) : le solde est partagé **50 % au Chauffeur et 50 % au Partenaire**.'));
children.push(Cl('12.4', '**Retrait du Véhicule par le Partenaire**, hors manquement de TamCar, ou **manquement du Partenaire** : le solde est restitué intégralement au Chauffeur.'));
children.push(Cl('12.5', 'La Part du Partenaire déjà créditée ou versée reste acquise au Partenaire, sous réserve de l’article 9.9.'));
children.push(Cl('12.6', 'Un nouveau Chauffeur est affecté au Véhicule dans les conditions du présent contrat ; un nouveau Fonds est ouvert à son nom. {{Durée applicable au nouveau Chauffeur : durée de la Catégorie à compter de son entrée, ou durée restant à courir — à trancher.}}'));

// Art. 13
children.push(Art(13, 'Confidentialité'));
children.push(Cl('13.1', 'Sont confidentiels : les taux de répartition, les Recettes minimales, les simulations et propositions chiffrées de TamCar, le contenu du présent contrat, les données et écrans de l’espace partenaire, ainsi que les procédures et informations commerciales ou techniques de TamCar (les « **Informations confidentielles** »).'));
children.push(Cl('13.2', 'Le Partenaire s’interdit de les divulguer ou de les reproduire, **y compris par captures d’écran, photographies ou copies de l’espace partenaire**, sous réserve de ses conseils, commissaires aux comptes, financeurs et autorités, strictement dans la mesure nécessaire et à condition qu’ils soient eux-mêmes tenus à la confidentialité. Il répond de leur respect.'));
children.push(Cl('13.3', 'Cette obligation court pendant le contrat et {{5}} ans après son terme. Elle ne s’applique pas aux informations tombées dans le domaine public sans faute du Partenaire, ni à ce que la loi ou une décision de justice impose de révéler (avec information préalable de TamCar lorsque c’est possible).'));
children.push(Cl('13.4', '**Sanction.** Tout manquement donne lieu à une pénalité forfaitaire de {{montant}} F CFA par manquement, sans préjudice de dommages et intérêts et de la résiliation pour faute (article 15.2). TamCar peut suspendre l’accès du Partenaire à l’espace partenaire.'));

// Art. 14
children.push(Art(14, 'Données personnelles'));
children.push(Cl('14.1', 'Chaque Partie traite les données personnelles auxquelles elle accède conformément à la législation béninoise sur la protection des données à caractère personnel.'));
children.push(Cl('14.2', 'Le Partenaire n’a accès ni à l’identité ou aux données des clients, ni au détail des courses, ni à la rémunération du Chauffeur. Il reçoit les relevés prévus à l’article 9.8 et les informations utiles à la gestion de son Véhicule (Jours actifs, état, incidents, identité du Chauffeur affecté).'));

// Art. 15
children.push(Art(15, 'Résiliation'));
children.push(Cl('15.1', 'Chaque Partie peut résilier le contrat, pour un ou plusieurs Véhicules, en cas de manquement grave de l’autre non réparé **30 jours** après une mise en demeure écrite ({{15}} jours pour le non-paiement de la Part du Partenaire).'));
children.push(Cl('15.2', 'TamCar peut résilier **sans délai** en cas de fraude ou de fausse déclaration (papiers falsifiés, propriété contestée), de reprise de force du Véhicule (article 6.6), de violation de l’exclusivité (article 11) ou de la confidentialité (article 13), ou de Véhicule présentant un danger pour la sécurité.'));
children.push(Cl('15.3', 'Si TamCar cesse d’exploiter la Plateforme ou est mise en liquidation, les Parties organisent ensemble la restitution des Véhicules ou leur Cession aux Chauffeurs au vu du solde des Fonds de rachat.'));
children.push(Cl('15.4', '**Effets.** La résiliation arrête la Mise en service de nouveaux Chauffeurs. TamCar fait cesser l’exploitation du Véhicule et le restitue au Partenaire dans un délai raisonnable, après retrait de l’habillage TamCar ; les comptes sont arrêtés sous 30 jours et le Fonds est réparti selon l’article 12.'));

// Art. 16
children.push(Art(16, 'Responsabilité'));
children.push(Cl('16.1', 'TamCar répond des sommes qu’elle encaisse et doit répartir. Elle ne garantit ni le volume de courses, ni la solvabilité ou la performance des Chauffeurs, hormis le remplacement prévu à l’article 8.4.'));
children.push(Cl('16.2', 'Le Partenaire répond de la conformité du Véhicule, de ses vices et de ses papiers, et garantit TamCar contre toute réclamation de tiers liée à la propriété ou à l’état du Véhicule, sous réserve de ce qui est imputable au Chauffeur.'));
children.push(Cl('16.3', 'Aucune Partie ne répond des dommages indirects (perte de chance, manque à gagner), sauf faute lourde ou dol.'));
children.push(Cl('16.4', '**Force majeure.** Un événement hors du contrôle d’une Partie, imprévisible et irrésistible, suspend ses obligations pendant sa durée. Au-delà de 90 jours, chaque Partie peut résilier sans indemnité.'));

// Art. 17
children.push(Art(17, 'Cession du contrat'));
children.push(Cl('17.1', 'Le contrat est conclu en considération de la personne du Partenaire. Il ne peut être cédé ni transféré, en tout ou partie, sans l’accord écrit de TamCar.'));
children.push(Cl('17.2', 'TamCar peut le céder à toute entité qui viendrait à ses droits dans l’exploitation de la Plateforme, en en informant le Partenaire.'));

// Art. 18
children.push(Art(18, 'Modification'));
children.push(Cl('18.1', 'Toute modification du contrat résulte d’un avenant écrit signé des deux Parties.'));
children.push(Cl('18.2', 'TamCar peut faire évoluer la Plateforme et ses règles techniques en en informant le Partenaire {{30}} jours à l’avance lorsque l’évolution l’affecte. Elle ne peut modifier sans avenant ni la Part du Partenaire, ni l’alimentation du Fonds, ni les Recettes minimales.'));

// Art. 19
children.push(Art(19, 'Droit applicable et règlement des différends'));
children.push(Cl('19.1', 'Le contrat est soumis au droit béninois et aux Actes uniformes de l’OHADA.'));
children.push(Cl('19.2', 'Les Parties s’efforcent de régler à l’amiable tout différend : le Partenaire notifie par écrit son objet à TamCar, et les Parties se réunissent dans les 15 jours.'));
children.push(Cl('19.3', 'À défaut d’accord dans les 30 jours de la notification, le différend est porté devant le **Tribunal de commerce de Cotonou**.'));

// Art. 20
children.push(Art(20, 'Dispositions finales'));
children.push(Cl('20.1', '**Intégralité.** Le contrat et ses annexes remplacent tout accord ou proposition antérieur entre les Parties sur le même objet, notamment les propositions de flotte des 5 et 11 octobre 2026 et le projet de contrat du 11 octobre 2026.'));
children.push(Cl('20.2', '**Nullité partielle.** Si une clause est nulle ou inapplicable, les autres demeurent en vigueur ; les Parties lui substituent une clause valable d’effet économique équivalent.'));
children.push(Cl('20.3', '**Notifications.** Les notifications se font par écrit, remises en main propre contre décharge, ou envoyées par courrier électronique avec accusé de réception, aux adresses suivantes : TamCar : {{adresse e-mail}} ; Partenaire : {{adresse e-mail}}. Les Parties élisent domicile à leur siège.'));
children.push(Cl('20.4', '**Annexes.** Les Annexes 1 à 3 font partie du contrat. En cas de contradiction, le corps du contrat prévaut.'));
children.push(Cl('20.5', '**Frais.** Les frais d’enregistrement éventuels sont supportés par {{TamCar}}.'));

// Signatures
children.push(new Paragraph({ spacing: { before: 240, after: 120 }, keepNext: true, children: runs(`Fait à Cotonou, le {{date}}, en deux exemplaires originaux.`) }));
const sigW = [4819, 4819];
children.push(new Table({
  width: { size: W, type: WidthType.DXA },
  columnWidths: sigW,
  rows: [new TableRow({
    cantSplit: true,
    children: [
      cell([
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Pour TamCar (Tam Logistics SARL)', bold: true, size: 19 })] }),
        new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'M. Térence Quenum, fondateur et gérant', size: 19, color: GREY })] }),
        new Paragraph({ spacing: { before: 760, after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8', space: 1 } }, indent: { right: 500 }, children: [] }),
        new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: fr('Signature précédée de « Lu et approuvé »'), size: 16, color: GREY })] }),
      ], sigW[0], { noBorder: true }),
      cell([
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Pour le Partenaire (Afric Group Consulting)', bold: true, size: 19 })] }),
        new Paragraph({ spacing: { after: 0 }, children: runs('M. {{prénom}} Ouedraogo, {{qualité}}', { size: 19, color: GREY }) }),
        new Paragraph({ spacing: { before: 760, after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8', space: 1 } }, indent: { right: 500 }, children: [] }),
        new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: fr('Signature précédée de « Lu et approuvé »'), size: 16, color: GREY })] }),
      ], sigW[1], { noBorder: true }),
    ],
  })],
}));

// ---------- Annexes ----------
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: `Annexe${NB}1 — Fiche véhicule et conformité` })] }));
children.push(P('Une fiche par Véhicule, établie à l’inspection d’entrée et signée par les deux Parties. Elle vaut état des lieux d’entrée (article 3.3).', { align: AlignmentType.LEFT }));
children.push(H2('Identification'));
children.push(table([3200, 6438], [
  ['Catégorie / durée', '{{Essentiel (3 ans) · Confort (4 ans) · VIP (5 ans)}}'],
  ['Marque, modèle, année', '{{ }}'],
  ['Immatriculation', '{{ }}'],
  ['Numéro de châssis', '{{ }}'],
  ['Couleur, kilométrage à l’entrée', '{{ }}'],
  ['Date de l’inspection d’entrée', '{{ }}'],
  ['Date de la Mise en service', '{{ }}'],
  ['Compte de paiement du Partenaire (Mobile Money ou banque)', '{{ }}'],
], { firstColFill: true, firstColBold: true }));
children.push(gap(100));
children.push(H2('Conformité (cocher à l’inspection)'));
children.push(table([5400, 2119, 2119], [
  ['Point de contrôle', 'Conforme', 'Remarque'],
  ['Carte grise au nom du Partenaire, véhicule dédouané', '', ''],
  ['Visite technique valide (échéance : {{date}})', '', ''],
  ['Assurance RC en cours, **usage transport public de personnes / taxi** (compagnie : {{ }} ; n° : {{ }} ; échéance : {{ }})', '', ''],
  ['Traceur GPS certifié ANATT installé (n° : {{ }})', '', ''],
  ['Essence, boîte classique, deux roues motrices, climatisation, pneus standards', '', ''],
  ['État général, carrosserie, intérieur (photos jointes)', '', ''],
], { header: true }));

children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: `Annexe${NB}2 — Conditions par catégorie` })] }));
const rs = CATS.map(calc);
children.push(table([3638, 2000, 2000, 2000], [
  ['', 'Essentiel', 'Confort', 'VIP'],
  ['Véhicules convenus à la signature', ...CATS.map((c) => String(c.n))],
  ['Durée (Cession au chauffeur)', ...CATS.map((c) => `${c.ans} ans`)],
  ['Recettes minimales par Jour actif', ...CATS.map((c) => `${num(c.plancher)} F`)],
  ['Part du Partenaire', '30 % du Volume', '30 % du Volume', '30 % du Volume'],
  ['Alimentation du Fonds de rachat', '5 % du Volume', '5 % du Volume', '5 % du Volume'],
  ['Frais d’entrée avancés par TamCar', '30 000 F', '30 000 F', '30 000 F'],
  ['Avance de démarrage demandée au Partenaire', 'Aucune', 'Aucune', 'Aucune'],
], { header: true, firstColFill: true, aligns: [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER] }));
children.push(gap(120));
children.push(H2('Illustration non contractuelle'));
children.push(P('Calculée aux Recettes minimales, sur 26 Jours actifs par mois, avant les charges propres du Partenaire (assurance, entretien, visite technique, traceur, achat du véhicule). Elle ne garantit aucun rendement (article 9.11) et s’entend avant AIB et frais de transaction (articles 9.6 et 9.7).', { align: AlignmentType.LEFT }));
children.push(table([3638, 2000, 2000, 2000], [
  ['', 'Essentiel', 'Confort', 'VIP'],
  ['Part du Partenaire par mois', ...rs.map((r) => `${num(r.cashMois)} F`)],
  ['Solde du Fonds à la Cession', ...rs.map((r) => `${k(r.rachatNet)} F`)],
  ['Total encaissé sur la Durée', ...rs.map((r) => `${k(r.total)} F`)],
], { header: true, firstColFill: true, aligns: [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER] }));

children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: `Annexe${NB}3 — Frais d’entrée` })] }));
children.push(H2('Frais d’entrée avancés par TamCar, par Véhicule'));
children.push(table([3800, 1700, 4138], [
  ['Poste', 'Montant', 'Propriété à l’issue'],
  ['Inspection d’entrée', '10 000 F', 'Service consommé'],
  ['Habillage TamCar (stickers)', '10 000 F', 'TamCar : retiré à la sortie de flotte'],
  ['Kit chauffeur (tenue, équipements)', '10 000 F', 'Chauffeur'],
  ['**Total**', '**30 000 F**', 'Aucune avance demandée au Partenaire'],
], { header: true, aligns: [AlignmentType.LEFT, AlignmentType.RIGHT, AlignmentType.LEFT] }));
children.push(P('Badge TamCar : propriété de TamCar, restitué à la sortie. Traceur GPS : propriété du Partenaire (article 10.4).', { align: AlignmentType.LEFT, before: 80 }));
children.push(H2('Qui paie quoi'));
children.push(P('Les Frais d’entrée, les produits de senteur, les gadgets et les forfaits internet offerts aux Chauffeurs sont à la charge de TamCar, qui les finance sur sa propre part de chaque course. **Aucune somme n’est prélevée à ce titre sur la Part du Partenaire ni sur le Fonds de rachat.** Assurance, entretien, visite technique, taxes et traceur GPS du Véhicule restent à la charge du Partenaire (article 6).'));

// ---------- Notes de relecture ----------
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: 'Notes de relecture — page à retirer avant signature' })] }));
children.push(P('Points à trancher ou à faire valider avant d’envoyer le contrat à Afric Group Consulting. Les passages concernés sont surlignés dans le texte.', { align: AlignmentType.LEFT }));
const notes = [
  '**Un juriste doit relire l’ensemble** (droit béninois, Actes uniformes OHADA) : le Fonds de rachat joue le rôle d’une réserve tenue pour le chauffeur et d’un prix de cession à terme ; sa qualification et sa protection (patrimoine distinct de TamCar, en cas de procédure collective) sont à vérifier.',
  '**TamCar est en cours de constitution** : signer après l’immatriculation, ou prévoir la reprise du contrat par la société. Compléter RCCM, IFU, capital, siège (parties) et les coordonnées.',
  '**Afric Group Consulting est associé de TamCar** : ce contrat peut relever de la procédure des conventions entre la société et ses associés. À faire valider (information du gérant, approbation par l’assemblée, rapport éventuel).',
  '**Nouvelle clé du plan v6 (article 9.2)** : 30 % au Partenaire, 5 % au Fonds de rachat (au lieu de 7 % puis 8 %), le solde au Chauffeur et à TamCar. Le « maintien en flotte » de 3 points sur le Fonds disparaît : TamCar finance les frais d’entrée et les gadgets sur sa part. **La plateforme applique encore 40 / 10 / 30 / 20 et le prélèvement de 3 points (activé au 1er janvier 2027) : à aligner dans le code, les CGU, le contrat chauffeur, le site, le simulateur, la plaquette et la proposition Afrik Group.**',
  '**Complément de plancher (article 8.3)** : le contrat dit que la Part du Partenaire se calcule sur le plus élevé entre le volume réel et la recette minimale, dans la limite des sommes recouvrées auprès du chauffeur. L’application ne le fait pas encore : le manque est prélevé sur le chauffeur mais reste chez TamCar. À coder, ou à reformuler.',
  '**Remboursement des frais d’entrée (article 4.3)** : prorata sur 12 mois. TamCar récupère aussi ces 30 000 F par sa part de chaque course (≈ 2 mois sur une Essentiel au plancher) : variante plus juste, ne rembourser que la part non encore couverte.',
  '**Demande de versement (article 9.5)** : j’ai lu « fonds » comme la Part du Partenaire déjà encaissée, pas comme le Fonds de rachat, qui reste bloqué jusqu’à la Cession. À trancher : délai de paiement ({{2}} jours ouvrés proposés), montant minimum par demande (des frais de transaction fixes pèsent sur les petits retraits), nombre de demandes par mois. **Dans l’application, le règlement du partenaire est aujourd’hui enregistré par l’administrateur : la demande en ligne, le calcul des frais et de l’AIB et l’affichage de la Part disponible sont à coder.**',
  '**Frais de transaction (article 9.6)** : à la charge du Partenaire, répercutés « au coût facturé par l’opérateur ». Si TamCar veut arrondir ou garder une marge, le dire ici.',
  '**Facturation et AIB (articles 9.7 et 9.10)** : toute opération d’un assujetti à l’IS ou à la TVA exige une facture normalisée (article 481 CGI). À arrêter avec l’expert-comptable : qui émet la facture (le Partenaire, avec sa machine électronique certifiée de facturation, ou TamCar par auto-facturation sous mandat). **AIB (articles 130 à 133 CGI) : 3 % sur les prestations de services d’un fournisseur ayant un IFU, 5 % sans IFU** (taux de la loi de 2026, à reconfirmer). Question à trancher avant signature : la Part du Partenaire est-elle un paiement de prestation (retenue) ou une répartition de sommes encaissées pour compte de tiers (pas de retenue) ? Le contrat retient la première qualification, sans fixer de taux. Régime de TVA à confirmer.',
  '**Nouveau chauffeur (article 12.6)** : durée de la Cession à recommencer (3, 4 ou 5 ans) ou durée restante ? Impacte le prix de Cession et la date de sortie du véhicule.',
  '**Retrait par le Partenaire (articles 4.3 et 12.4)** : le Fonds du chauffeur lui est restitué intégralement si le Partenaire retire son véhicule. Ce choix protège le chauffeur mais n’a pas encore été validé.',
  '**Pénalités (articles 11.2 et 13.4)**, délais (8.4, 9.5, 10.1, 15.1, 18.2) et durée de la confidentialité (13.3) : montants et durées à fixer ; vérifier que la pénalité n’est pas manifestement excessive (révision par le juge).',
  '**Assurance et autorisations ANATT (articles 6.1 et 6.3)** : confirmer par écrit avec Afric Group que l’assurance (usage taxi) et le traceur sont à sa charge, et qui détient l’autorisation d’exploitation ANATT et en supporte le coût.',
  '**Véhicule VIP** : le contrat en prévoit un (6 Essentiel, 3 Confort, 1 VIP) ; le plan v6 ne compte que 9 voitures. À confirmer avec Afric Group.',
  '**Juridiction (article 19)** : Tribunal de commerce de Cotonou par défaut ; l’arbitrage est une alternative (confidentialité, rapidité).',
];
notes.forEach((n) => children.push(B(n)));

// ---------- Document ----------
const doc = new Document({
  creator: 'TamCar',
  title: 'Contrat de partenariat véhicule — TamCar',
  styles: {
    default: { document: { run: { font: FONT, size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 23, bold: true, color: BLUE },
        paragraph: { spacing: { before: 280, after: 110 }, outlineLevel: 0, keepNext: true,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFDBFE', space: 3 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 21, bold: true, color: '1D4ED8' },
        paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 1, keepNext: true } },
    ],
  },
  numbering: {
    config: [{
      reference: 'bul',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1021, hanging: 340 } } } }],
    }],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1247, right: 1134, bottom: 1191, left: 1134, header: 567, footer: 510 } } },
    headers: {
      default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [new TextRun({ text: fr('TamCar · Contrat de partenariat véhicule · PROJET confidentiel'), size: 15, color: '94A3B8' })] })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: W }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0', space: 4 } },
        spacing: { after: 0 },
        children: [
          new TextRun({ text: fr('Tam Logistics SARL · Document confidentiel'), size: 15, color: '94A3B8' }),
          new TextRun({ children: [new Tab()], size: 15 }),
          new TextRun({ children: ['Page ', PageNumber.CURRENT, ' sur ', PageNumber.TOTAL_PAGES], size: 15, color: '94A3B8' }),
        ],
      })] }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('OK', OUT, buf.length, 'octets');
  rs.forEach((r, i) => console.log(CATS[i].nom, 'part/mois', num(r.cashMois), 'fonds net', num(r.rachatNet), 'total', num(r.total)));
});
