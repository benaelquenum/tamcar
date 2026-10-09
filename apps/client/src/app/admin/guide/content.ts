/**
 * Contenu du guide d'utilisation du back-office TamCar (console d'administration).
 * Source unique : la fenêtre « Guide » du back-office ET le PDF téléchargeable (scripts/build-admin-guide.mjs) en sont tirés.
 * Texte en chaînes JS : **gras** rendu par RichText. À tenir à jour quand un onglet change.
 *
 * ⚠ La déclaration de la liste des sections (en bas) et tout ce qui la suit doit rester du JavaScript valide une fois les
 * annotations de type retirées : le script du PDF découpe le fichier à cet endroit.
 */

export type GuideBlock =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'note'; tone: 'info' | 'warn'; title: string; text: string };

export type GuideSection = {
  id: string;
  /** Rubrique du sommaire */
  group: string;
  /** Nom de l'onglet tel qu'il apparaît dans le menu */
  title: string;
  /** Adresse de la page dans le back-office (onglets uniquement) */
  path?: string;
  blocks: GuideBlock[];
};

export const GUIDE_SECTIONS: GuideSection[] = [
  // ================================================================ POUR COMMENCER
  {
    id: 'prise-en-main',
    group: 'Pour commencer',
    title: 'Prise en main',
    blocks: [
      {
        type: 'p',
        text: 'Le back-office est la salle de contrôle de TamCar : c’est ici que l’on enregistre les chauffeurs, les véhicules et les partenaires, que l’on suit les courses, que l’on règle l’argent dû aux chauffeurs et aux partenaires, et que l’on pilote les réglages de la plateforme. Il n’est accessible qu’aux comptes administrateurs.',
      },
      { type: 'h3', text: 'Se repérer' },
      {
        type: 'ul',
        items: [
          '**Le menu à gauche** liste tous les onglets. L’onglet ouvert est en blanc. Sur téléphone, le menu s’ouvre avec le **bouton rond en bas à gauche**.',
          '**Les pastilles rouges** du menu comptent ce qui attend une action : alertes SOS, dettes de chauffeurs, demandes de retrait d’épargne TamAssur. Une pastille qui clignote est une urgence.',
          '**La sirène** retentit tant qu’un SOS n’est pas pris en charge. Gardez le back-office ouvert ; si le navigateur bloque le son, un premier clic dans la page l’autorise.',
          '**En bas du menu** : votre nom (il ouvre votre compte) et le bouton **Déconnexion**.',
          'Le bouton **Guide d’utilisation** (en bas du menu) ouvre ce guide à tout moment, sur n’importe quelle page. Le bouton « Télécharger le guide (PDF) » de la fenêtre en donne une version imprimable.',
        ],
      },
      { type: 'h3', text: 'Règles de base' },
      {
        type: 'ul',
        items: [
          'Toutes les heures sont celles de **Porto-Novo**. Les journées de travail vont du **lundi au samedi** : le dimanche, il n’y a ni cotisation, ni versement, ni bonus.',
          'Les actions importantes (suspendre, archiver, payer, supprimer) demandent une **confirmation** avant de s’exécuter.',
          'Un **mot de passe temporaire** n’est affiché qu’une fois, au moment de la création du compte : copiez-le avant de quitter l’écran.',
          'Les montants sont en **francs CFA (F)**.',
        ],
      },
    ],
  },
  {
    id: 'aide-memoire',
    group: 'Pour commencer',
    title: 'Où aller pour… ?',
    blocks: [
      {
        type: 'p',
        text: 'Le tableau ci-dessous répond à la question « où faut-il aller pour faire telle chose ? ». Le nom en gras est celui de l’onglet dans le menu de gauche.',
      },
      {
        type: 'table',
        head: ['Je veux…', 'Où aller'],
        rows: [
          ['Enregistrer un chauffeur', '**Chauffeurs**, formulaire « Enregistrer un chauffeur » en haut de la page. Autre voie : **Rendez-vous**, ouvrir le dossier du candidat, puis « Approuver ».'],
          ['Enregistrer un véhicule', '**Véhicules**, formulaire « Enregistrer un véhicule ». Il est créé « en attente » : cliquer ensuite sur **Activer**.'],
          ['Donner un véhicule à un chauffeur', '**Véhicules**, liste « Véhicules actifs » : choisir le chauffeur dans la liste de la ligne, puis **Affecter**.'],
          ['Valider un candidat chauffeur', '**Rendez-vous**, ouvrir le dossier, vérifier les documents, puis **Approuver** (ou Refuser / Marquer no-show).'],
          ['Enregistrer un partenaire véhicule (concessionnaire, propriétaire de flotte)', '**Partenaires véhicule**, formulaire « Enregistrer un partenaire véhicule ».'],
          ['Payer un partenaire véhicule', 'Payer hors application (Mobile Money, virement), puis **Partenaires véhicule** → « Versements aux partenaires » → **Enregistrer le versement**.'],
          ['Aider un chauffeur qui a oublié son mot de passe', '**Chauffeurs**, ligne du chauffeur, bouton de réinitialisation du mot de passe.'],
          ['Suspendre, réactiver ou archiver un chauffeur', '**Chauffeurs**, boutons de la ligne du chauffeur.'],
          ['Voir tout ce qu’un chauffeur a fait', '**Chauffeurs** → lien « Historique complet » sous son nom (fiche chauffeur).'],
          ['Déclarer une panne ou une maladie (jours non travaillés)', '**Chauffeurs** → « Historique complet » → carte « Contrat de cession et versement ».'],
          ['Enregistrer un paiement de dette reçu en espèces', '**Dettes chauffeur**, ligne du chauffeur → **Enregistrer le paiement**.'],
          ['Payer un retrait de gains demandé par un chauffeur', '**Retraits chauffeur** : envoyer l’argent, puis **Payé** (ou **Refuser**).'],
          ['Payer un retrait d’épargne TamAssur', '**Retraits TamAssur** : **Payé en espèces** ou **Payé par Mobile Money**.'],
          ['Changer les objectifs, versements, bonus, cotisations, durée TamAssur', '**Bonus chauffeur**, groupe de réglages concerné.'],
          ['Passer les paiements en réel (fin du mode TEST)', '**Bonus chauffeur** → groupe « Paiements » → « Paiements en mode TEST » à 0.'],
          ['Répondre à une alerte SOS', '**SOS** (ou la carte rouge du **Tableau de bord**) → Prendre en charge, puis Résoudre.'],
          ['Voir où sont les chauffeurs en ce moment', '**Carte en direct**.'],
          ['Retrouver une course', '**Courses**.'],
          ['Créer une location VIP', '**Locations VIP** → « Créer une location ».'],
          ['Nommer un responsable ville ou régler sa commission', '**Responsables ville**.'],
          ['Suivre les avances de démarrage des partenaires', '**ADR**.'],
          ['Créer un code promo', '**Promos** → « Créer un code ».'],
          ['Changer les bannières de l’accueil', '**Bannières**.'],
          ['Valider ou ajouter un lieu sur la carte', '**Lieux**.'],
          ['Vérifier ou lancer une sauvegarde', '**Sauvegardes**.'],
        ],
      },
    ],
  },

  // ================================================================ PILOTAGE
  {
    id: 'tableau-de-bord',
    group: 'Pilotage',
    title: 'Tableau de bord',
    path: '/admin',
    blocks: [
      {
        type: 'p',
        text: 'La page d’accueil du back-office : une vue en direct de la plateforme. Les chiffres portent sur la période en cours (jour, semaine ou mois calendaire selon la carte).',
      },
      { type: 'h3', text: 'Ce que vous y voyez' },
      {
        type: 'ul',
        items: [
          '**Les indicateurs du haut** : chiffre d’affaires de la plateforme sur le mois, courses terminées, chauffeurs en ligne, taux d’annulation sur 7 jours.',
          '**Financier — mois en cours** : total des courses, prix moyen, frais d’annulation, bonus de parrainage versés, puis la répartition par catégorie de véhicule.',
          '**Chauffeurs** : chauffeurs actifs, note moyenne, candidatures en attente, argent cumulé des chauffeurs, et le top 5 des gains du mois.',
          '**Clients et portefeuilles** : nombre de clients, nouveaux de la semaine, crédit clients cumulé, monnaie rendue par les chauffeurs.',
          '**Opérations** : courses actives, annulées sur 24 h, courses bloquées, SOS ouverts.',
          '**ADR** : avances de démarrage versées par les partenaires, remboursées, en cours.',
        ],
      },
      { type: 'h3', text: 'Ce que vous pouvez y faire' },
      {
        type: 'ul',
        items: [
          '**Alertes SOS actives** : prendre en charge une alerte ou la résoudre avec une note, sans quitter la page.',
          '**Courses bloquées** (en cours depuis plus de 4 heures) : les annuler en indiquant le motif.',
          '**Assurances conducteur impayées** : voir les chauffeurs dont la cotisation n’a pas pu être prélevée.',
          '**Détails par section** : cartes de raccourci vers les autres onglets.',
        ],
      },
    ],
  },
  {
    id: 'sos',
    group: 'Pilotage',
    title: 'SOS',
    path: '/admin/sos',
    blocks: [
      {
        type: 'p',
        text: 'Les alertes de sécurité déclenchées pendant une course. C’est l’onglet le plus urgent : tant qu’une alerte n’est pas prise en charge, le badge du menu clignote en rouge et la sirène retentit.',
      },
      {
        type: 'steps',
        items: [
          'Lire l’alerte : qui l’a déclenchée (chauffeur ou client), le motif indiqué, l’heure, la position GPS (avec un lien vers Google Maps) et la course liée (statut, départ, arrivée).',
          'Cliquer sur **Prendre en charge (arrête la sirène)** dès que vous commencez à traiter le cas.',
          'Contacter la personne et, si nécessaire, les secours.',
          'Une fois la situation réglée, saisir une **note de résolution** (facultative mais recommandée) et cliquer sur **Résoudre**.',
        ],
      },
      {
        type: 'note',
        tone: 'warn',
        title: 'À retenir',
        text: 'Une alerte n’est jamais « fermée » toute seule : elle reste ouverte jusqu’à ce que vous la résolviez. Les dernières alertes résolues sont listées en bas de la page.',
      },
    ],
  },
  {
    id: 'courses',
    group: 'Pilotage',
    title: 'Courses',
    path: '/admin/rides',
    blocks: [
      {
        type: 'p',
        text: 'L’historique complet des courses de la plateforme : trajet, distance, prix, statut et date de réception, avec un lien « Détails » vers le dossier de la course. C’est l’onglet de référence pour répondre à une réclamation ou vérifier un montant.',
      },
      {
        type: 'table',
        head: ['Statut', 'Signification'],
        rows: [
          ['Demandée', 'Le client a commandé, aucun chauffeur n’a encore accepté.'],
          ['Acceptée', 'Un chauffeur a accepté et se rend chez le client.'],
          ['Chauffeur arrivé', 'Le chauffeur est au point de prise en charge.'],
          ['En cours', 'Le client est à bord.'],
          ['Terminée', 'La course est finie ; les montants ont été répartis.'],
          ['Annulée', 'Par le client, par le chauffeur ou par l’administration.'],
          ['Expirée', 'Personne n’a accepté à temps.'],
        ],
      },
    ],
  },
  {
    id: 'carte',
    group: 'Pilotage',
    title: 'Carte en direct',
    path: '/admin/carte',
    blocks: [
      {
        type: 'p',
        text: 'La carte des chauffeurs connectés. Leur position est mise à jour toutes les 5 secondes. Cliquez sur un chauffeur pour voir son profil et sa course en cours.',
      },
    ],
  },

  // ================================================================ CHAUFFEURS ET VÉHICULES
  {
    id: 'chauffeurs',
    group: 'Chauffeurs et véhicules',
    title: 'Chauffeurs',
    path: '/admin/drivers',
    blocks: [
      {
        type: 'p',
        text: 'La liste de tous les chauffeurs, et l’endroit où l’on en **enregistre** de nouveaux. En haut à droite, trois compteurs : actifs, suspendus, archivés.',
      },
      { type: 'h3', text: 'Enregistrer un chauffeur' },
      {
        type: 'steps',
        items: [
          'Ouvrir l’onglet **Chauffeurs** : le formulaire « Enregistrer un chauffeur » est en haut de la page.',
          'Renseigner le **nom complet** (obligatoire) et le **téléphone** ou l’**email** (l’un des deux au moins). Le numéro de permis et celui de la pièce d’identité sont facultatifs mais recommandés.',
          'Choisir la **formule** : **Cession** (le chauffeur roule avec un véhicule en location-vente, appartenant à un partenaire ou à TamCar) ou **Propriétaire** (il possède son véhicule).',
          'Cliquer sur **Enregistrer le chauffeur**. Un encadré vert affiche l’**email** et le **mot de passe temporaire** : utilisez les boutons **Copier** et transmettez-les au chauffeur.',
          'Le chauffeur se connecte à l’application **TamCar Pro** (tamcar-driver-portal.vercel.app) avec ces identifiants, et peut ensuite changer son mot de passe.',
          'Enregistrer ensuite son **véhicule** (onglet Véhicules) et le lui **affecter**. Pour un chauffeur en formule Cession, renseigner aussi le **début de la cession** dans sa fiche.',
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Autre voie : le rendez-vous',
        text: 'Un candidat qui a pris rendez-vous (onglet Rendez-vous) est enregistré comme chauffeur en cliquant sur « Approuver » dans son dossier : pas besoin de ressaisir ses informations.',
      },
      { type: 'h3', text: 'La liste' },
      {
        type: 'ul',
        items: [
          '**Chauffeurs à surveiller** : ceux qui ont des fautes prouvées (strikes) ou des litiges en attente.',
          '**Le tableau** : nom, téléphone, formule, statut (actif, suspendu, en ligne), nombre de courses et d’annulations, strikes, argent cumulé, note.',
          '**Archivés** : les chauffeurs sortis de la plateforme, avec la date et le motif.',
        ],
      },
      { type: 'h3', text: 'Les boutons de chaque ligne' },
      {
        type: 'table',
        head: ['Bouton', 'Effet'],
        rows: [
          ['Réinitialiser le mot de passe', 'Crée un nouveau mot de passe (à saisir ou généré automatiquement) et l’affiche pour que vous le transmettiez au chauffeur.'],
          ['Suspendre', 'Le chauffeur ne peut plus prendre de courses. Réversible avec **Réactiver**.'],
          ['Réactiver', 'Rend l’accès à un chauffeur suspendu.'],
          ['Archiver', 'Retire le chauffeur des listes actives. **Action définitive.**'],
          ['Historique complet', 'Ouvre la fiche du chauffeur (voir ci-dessous).'],
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Suspension automatique',
        text: 'Un chauffeur dont la dette atteint **5 000 F** est suspendu automatiquement, puis réactivé tout seul dès que sa dette repasse sous ce seuil (voir l’onglet Dettes chauffeur). Vous n’avez rien à faire.',
      },
    ],
  },
  {
    id: 'fiche-chauffeur',
    group: 'Chauffeurs et véhicules',
    title: 'Fiche chauffeur',
    path: '/admin/drivers/…',
    blocks: [
      {
        type: 'p',
        text: 'On y accède par le lien « Historique complet » de l’onglet Chauffeurs. C’est le dossier complet d’un chauffeur.',
      },
      {
        type: 'ul',
        items: [
          '**L’en-tête** : statut, formule, téléphone, date d’enrôlement, permis, pièce d’identité, état de la vérification (KYC), véhicule affecté.',
          '**La photo officielle** : téléverser la photo du chauffeur ; elle est traitée automatiquement (détourage, cadrage) avant d’être affichée aux clients.',
          '**Contrat de cession et versement** (formule Cession) : versement quotidien, date de début, jours non travaillés et fin prévue du contrat.',
          '**Depuis l’enrôlement** : courses terminées et annulées, volume, argent gagné, fonds de rachat, note, avertissements, épargne TamAssur nette.',
          '**Chronologie complète** : tout ce qui s’est passé (courses, mouvements d’argent, avertissements, SOS…), filtrable par type.',
        ],
      },
      { type: 'h3', text: 'Déclarer des jours non travaillés (panne, maladie)' },
      {
        type: 'steps',
        items: [
          'Dans la carte « Contrat de cession et versement », section **Déclarer des jours non travaillés**, choisir la date de début, la date de fin (facultative si c’est un seul jour) et le **motif**.',
          'Cliquer sur **Enregistrer les jours**.',
          'Pour ces jours-là, **rien n’est prélevé** (ni le versement quotidien, ni la cotisation TamAssur). Si un jour avait déjà été prélevé, il est **remboursé**.',
          'Le **contrat est prolongé** d’autant de jours : la « fin prévue » se met à jour. Les dimanches sont ignorés.',
          'Un jour déclaré par erreur peut être **retiré** tant qu’il n’est pas clôturé (il l’est dès que la journée est passée et traitée à minuit).',
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Début de la cession',
        text: 'La fin du contrat se calcule à partir de la date de début de la cession (remise du véhicule). Saisissez-la dans la même carte. À défaut, TamCar prend la date du premier prélèvement TamAssur.',
      },
    ],
  },
  {
    id: 'vehicules',
    group: 'Chauffeurs et véhicules',
    title: 'Véhicules',
    path: '/admin/vehicles',
    blocks: [
      {
        type: 'p',
        text: 'Le parc de véhicules de la plateforme. On y enregistre un véhicule, on l’active, puis on l’affecte à un chauffeur.',
      },
      {
        type: 'steps',
        items: [
          'Remplir « Enregistrer un véhicule » : **plaque**, **marque**, **modèle** (obligatoires), année, couleur, nombre de places.',
          'Choisir la **catégorie** : Moto (zémidjan), Tricycle (Kloboto), Essentiel, Confort ou VIP.',
          'Indiquer à qui appartient le véhicule : un **partenaire véhicule** (la formule est alors « Cession ») ou un **chauffeur propriétaire**.',
          'Cliquer sur **Enregistrer** : le véhicule apparaît dans « En attente d’activation ».',
          'Une fois les contrôles faits, cliquer sur **Activer** : il passe dans « Véhicules actifs ».',
          'Dans « Véhicules actifs », choisir un chauffeur dans la liste de la ligne et cliquer sur **Affecter**. Si la formule du chauffeur est différente de celle du véhicule, la liste l’indique (« basculera en … ») et son compte est mis à jour.',
        ],
      },
      {
        type: 'note',
        tone: 'warn',
        title: 'Catégorie = ce qui est facturé',
        text: 'La catégorie du véhicule détermine le prix des courses, l’objectif, le versement quotidien et la cotisation TamAssur du chauffeur. Vérifiez-la avant d’activer.',
      },
    ],
  },
  {
    id: 'candidatures',
    group: 'Chauffeurs et véhicules',
    title: 'Rendez-vous',
    path: '/admin/candidatures',
    blocks: [
      {
        type: 'p',
        text: 'Les candidats chauffeurs qui ont pris rendez-vous. Le haut de la page montre le planning à venir ; un rendez-vous dont l’heure est passée est surligné. Le bas liste les dossiers récemment traités.',
      },
      {
        type: 'steps',
        items: [
          'Cliquer sur le rendez-vous : le dossier s’ouvre avec les **documents attendus** à présenter.',
          'Recevoir le candidat et vérifier ses documents.',
          '**Approuver** : le formulaire demande les informations du véhicule (marque, modèle, couleur, catégorie), des observations, et — pour un véhicule de partenaire — si l’**avance de démarrage (ADR) de 100 000 F** a bien été versée. Le chauffeur est alors créé ; ses identifiants s’affichent.',
          '**Refuser après entretien** : saisir la raison (3 caractères au moins).',
          '**Marquer no-show** : le candidat ne s’est pas présenté.',
        ],
      },
      {
        type: 'note',
        tone: 'warn',
        title: 'ADR : ne cocher que si l’argent est reçu',
        text: 'La case ADR ne se coche que si le partenaire a effectivement remis les 100 000 F. Cette somme est une dette de TamCar envers le partenaire, remboursée plus tard : ce n’est pas un revenu.',
      },
    ],
  },

  // ================================================================ PARTENAIRES
  {
    id: 'partenaires',
    group: 'Partenaires',
    title: 'Partenaires véhicule',
    path: '/admin/dealers',
    blocks: [
      {
        type: 'p',
        text: 'Les concessionnaires et propriétaires de flotte dont les véhicules roulent sur TamCar. On y enregistre un partenaire et on lui verse sa part.',
      },
      { type: 'h3', text: 'Enregistrer un partenaire véhicule' },
      {
        type: 'steps',
        items: [
          'Remplir le formulaire : **téléphone**, **email**, **nom complet du contact**, **raison sociale** (obligatoire), RCCM et **part du partenaire en %** (25 % proposé par défaut).',
          'Cliquer pour enregistrer : un encadré affiche l’email et le mot de passe temporaire, avec un bouton **Copier le message à envoyer** qui prépare le message prêt à transmettre.',
          'Le partenaire se connecte avec ces identifiants et suit ses véhicules et son solde.',
        ],
      },
      { type: 'h3', text: 'Verser sa part à un partenaire' },
      {
        type: 'p',
        text: 'Le solde de chaque partenaire augmente à chaque course terminée sur ses véhicules. Vous le réglez **hors application** (Mobile Money, virement), puis vous l’enregistrez ici : le montant est débité de son portefeuille et apparaît dans son espace.',
      },
      {
        type: 'steps',
        items: [
          'Dans « Versements aux partenaires », repérer le partenaire et son solde.',
          'Payer le partenaire par Mobile Money ou virement.',
          'Saisir le montant versé et une note (ex. « MoMo du 05/01 »), puis cliquer sur **Enregistrer le versement**.',
        ],
      },
      {
        type: 'p',
        text: 'Le tableau « Partenaires véhicule actifs » donne pour chacun la société, le contact, le nombre de véhicules et le chiffre d’affaires cumulé ; un bouton permet d’**archiver** un partenaire.',
      },
    ],
  },
  {
    id: 'simulateur',
    group: 'Partenaires',
    title: 'Simulateur partenaires',
    blocks: [
      {
        type: 'p',
        text: 'Un lien vers le site de TamCar (il demande de se connecter). Il ouvre le simulateur de gains, qui sert à préparer une proposition chiffrée pour un partenaire prospect ; il s’ouvre dans un nouvel onglet.',
      },
      {
        type: 'note',
        tone: 'warn',
        title: 'Confidentialité',
        text: 'Les chiffres de la politique partenaire sont confidentiels : ils ne sont jamais publiés sur le site. Ne les communiquez qu’au moyen du bouton « Recevoir la proposition » du simulateur.',
      },
    ],
  },
  {
    id: 'adr',
    group: 'Partenaires',
    title: 'ADR',
    path: '/admin/dealer-advances',
    blocks: [
      {
        type: 'p',
        text: 'Les **avances de démarrage** : à la signature de son contrat, un partenaire véhicule remet 100 000 F à TamCar. C’est une avance, pas un revenu : elle est remboursée au partenaire.',
      },
      {
        type: 'ul',
        items: [
          'Pour chaque avance : **montant**, date de versement, date d’**activation** (arrivée du premier chauffeur sur ses véhicules), **échéance** de remboursement (12 mois après) et cumul déjà remboursé.',
          'Le remboursement se fait **automatiquement**, par prélèvement sur la part « fonds de rachat » des courses de ses véhicules.',
          'En cas de fin de contrat, le bouton **Résilier (prorata temporis)** clôture l’avance après saisie de la raison.',
        ],
      },
    ],
  },
  {
    id: 'responsables-ville',
    group: 'Partenaires',
    title: 'Responsables ville',
    path: '/admin/ops',
    blocks: [
      {
        type: 'p',
        text: 'Le responsable des opérations d’une ville perçoit **3 % du volume des courses de sa ville**, dans la limite de **150 000 F par mois**. Il suit son activité dans l’application TamCar Pro. Son statut est une **nomination**, pas un rôle du compte : un chauffeur peut très bien être responsable (ses propres courses ne comptent pas).',
      },
      {
        type: 'steps',
        items: [
          '**Nommer** : dans « Nommer un responsable », saisir le téléphone du responsable (la personne doit déjà avoir un compte TamCar), choisir la ville, vérifier le taux et le plafond, puis cliquer sur **Nommer**. S’il y avait déjà un responsable dans cette ville, il est remplacé : il n’y en a qu’un seul par ville.',
          '**Suivre** : « Portefeuilles des responsables » montre ce que chacun a gagné et ce qui lui est dû.',
          '**Régler** : payer hors application (Mobile Money), puis saisir le montant et une note et cliquer sur **Enregistrer le règlement**.',
          '**Mettre fin** à un mandat : bouton sur la ligne du responsable ; il passe dans « Mandats terminés ».',
        ],
      },
    ],
  },
  {
    id: 'locations-vip',
    group: 'Partenaires',
    title: 'Locations VIP',
    path: '/admin/locations',
    blocks: [
      {
        type: 'p',
        text: 'La mise à disposition d’une voiture VIP avec chauffeur sur une période donnée (hôtels, entreprises, événements). La page est découpée en quatre blocs.',
      },
      {
        type: 'ul',
        items: [
          '**Demandes à confirmer** : les demandes reçues. Pour confirmer, choisir un chauffeur VIP libre (ceux qui sont déjà pris sur la période sont grisés).',
          '**À venir et en cours** : les locations confirmées, avec leurs actions.',
          '**Créer une location** : pour une demande prise par téléphone — client, lieu de prise en charge, période, chauffeur.',
          '**Terminées et annulées** : l’historique, avec le contrôle des kilomètres parcourus.',
        ],
      },
    ],
  },

  // ================================================================ ARGENT DES CHAUFFEURS
  {
    id: 'dettes',
    group: 'Argent des chauffeurs',
    title: 'Dettes chauffeur',
    path: '/admin/dettes',
    blocks: [
      {
        type: 'p',
        text: 'Les chauffeurs dont le portefeuille « Revenus » est négatif : commissions des courses payées en espèces et cotisations TamAssur non encore couvertes. Dès que la dette atteint **5 000 F**, le chauffeur est **suspendu automatiquement** ; il est **réactivé automatiquement** dès qu’elle repasse sous ce seuil.',
      },
      {
        type: 'steps',
        items: [
          'Repérer le chauffeur dans la liste (les suspendus sont signalés).',
          'S’il a payé en espèces ou par Mobile Money **directement à TamCar**, saisir le **montant reçu** (et une référence, facultative).',
          'Cliquer sur **Enregistrer le paiement** : la dette baisse et, si elle passe sous 5 000 F, le chauffeur est réactivé.',
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Paiement par l’application',
        text: 'Un chauffeur peut aussi régler sa dette lui-même depuis son portefeuille (bouton « Régulariser »). Ce cas est enregistré automatiquement : il n’y a rien à saisir ici.',
      },
    ],
  },
  {
    id: 'bonus',
    group: 'Argent des chauffeurs',
    title: 'Bonus chauffeur',
    path: '/admin/bonus',
    blocks: [
      {
        type: 'p',
        text: 'Le centre de réglage de tout ce qui touche à l’argent des chauffeurs. Chaque réglage a son champ : modifiez le nombre et cliquez sur **OK** (une confirmation est demandée). Le changement vaut **pour l’avenir**, dès le prochain calcul.',
      },
      {
        type: 'ul',
        items: [
          '**Le haut de la page** : bonus versé ce mois, nombre de bonus, chauffeurs concernés, total versé, primes d’approche du mois. Le tableau « Ce que chaque véhicule rapporte et coûte, par jour » simule le bonus et la cotisation pour chaque catégorie.',
        ],
      },
      {
        type: 'table',
        head: ['Groupe de réglages', 'À quoi il sert'],
        rows: [
          ['Objectifs quotidiens', 'Le volume de courses à atteindre chaque jour par catégorie ; au-delà, le chauffeur gagne un bonus.'],
          ['Part de TamCar sur le volume', 'Le pourcentage de chaque course qui revient à TamCar (et au propriétaire du véhicule) par catégorie.'],
          ['Versement quotidien (formule Cession)', 'La part de TamCar à couvrir chaque jour, du lundi au samedi. Si, à minuit, la part de TamCar sur les courses du jour est inférieure, le manque est prélevé sur le portefeuille Revenus du chauffeur. Au-delà du versement, la part de TamCar continue de compter.'],
          ['Bonus', 'Le pourcentage de sa part que TamCar reverse au chauffeur sur le volume au-dessus de l’objectif (50 % aujourd’hui).'],
          ['Priorité de proximité', 'Comment une course s’ouvre autour du client : les chauffeurs les plus proches la voient d’abord, les autres après un délai. « Priorité active » à 0 remet l’ancien fonctionnement.'],
          ['Prime d’approche', 'Prime versée au chauffeur qui vient de loin chercher le client : distance gratuite, tarif au kilomètre, plafond par course.'],
          ['Produits de senteur', 'Prélèvement mensuel sur le fonds de rachat des chauffeurs en formule Cession.'],
          ['Annulation par le client', 'Les frais appliqués quand le client annule alors que le chauffeur est arrivé ou tout proche.'],
          ['TamAssur : cotisation quotidienne', 'Le montant prélevé chaque jour ouvré sur le chauffeur pour son épargne (1 000 F pour tous les véhicules).'],
          ['TamAssur : durée avant retrait', 'Le nombre de mois de cotisation avant que le chauffeur puisse demander son épargne (moto 12, tricycle et voitures 24).'],
          ['Paiements', 'Le **mode TEST** (recharges et règlements gratuits, simulés) et les **virements automatiques** des retraits.'],
        ],
      },
      {
        type: 'note',
        tone: 'warn',
        title: 'Avant le lancement',
        text: 'Mettre « Paiements en mode TEST » à **0** (groupe Paiements) dès que le paiement réel est branché. Tant qu’il vaut 1, un bandeau jaune s’affiche en haut de tout le back-office. Laissez « virements automatiques » à 0 tant qu’un test réel n’est pas validé : les retraits restent payés à la main.',
      },
    ],
  },
  {
    id: 'retraits',
    group: 'Argent des chauffeurs',
    title: 'Retraits chauffeur',
    path: '/admin/retraits',
    blocks: [
      {
        type: 'p',
        text: 'Les demandes de retrait des gains d’un chauffeur vers son Mobile Money. Le montant est **déjà débité** de ses revenus (mis de côté) au moment de la demande.',
      },
      {
        type: 'steps',
        items: [
          'Envoyer le montant sur le Mobile Money du chauffeur (le numéro figure sur la demande).',
          'Cliquer sur **Payé**, en saisissant si possible la **référence** de l’opération : le chauffeur est prévenu.',
          'Si vous ne pouvez pas payer, cliquer sur **Refuser** (avec un motif facultatif) : le montant est recrédité au chauffeur.',
        ],
      },
      {
        type: 'p',
        text: 'Le bas de la page conserve l’**historique** des retraits payés et refusés.',
      },
    ],
  },
  {
    id: 'retraits-tamassur',
    group: 'Argent des chauffeurs',
    title: 'Retraits TamAssur',
    path: '/admin/tamassur',
    blocks: [
      {
        type: 'p',
        text: '**TamAssur** est l’épargne du chauffeur : chaque jour ouvré, une cotisation est mise de côté pour lui. Quand il remplit les conditions, il demande son retrait depuis l’application, et la demande arrive ici (le badge du menu s’allume).',
      },
      {
        type: 'ul',
        items: [
          'Le chauffeur n’a pu demander son retrait qu’après la durée de son véhicule (**12 mois pour la moto, 24 mois pour le tricycle et les voitures**), avec une épargne d’au moins **300 000 F (moto)** ou **600 000 F (tricycle et voitures)**, et un **compte à jour**.',
          'Le montant est déjà réservé sur son épargne. **Rien n’est viré automatiquement.**',
        ],
      },
      {
        type: 'steps',
        items: [
          'Dans « À régler », repérer la demande ; le délai restant est indiqué (60 jours au plus à compter de la demande).',
          'Payer le chauffeur en espèces ou par Mobile Money.',
          'Cliquer sur **Payé en espèces** ou **Payé par Mobile Money** : le chauffeur est prévenu et la demande passe dans l’historique.',
        ],
      },
    ],
  },

  // ================================================================ COMMUNICATION ET CONTENUS
  {
    id: 'promos',
    group: 'Communication et contenus',
    title: 'Promos',
    path: '/admin/promos',
    blocks: [
      {
        type: 'p',
        text: 'Les codes promotionnels que les clients saisissent à la commande.',
      },
      {
        type: 'steps',
        items: [
          'Dans « Créer un code », saisir le **code** (ex. LANCEMENT), le **type** de remise et sa **valeur**.',
          'Fixer, si besoin, la **limite totale** d’utilisations (vide = illimité), la **limite par client** et la **date de fin de validité**. Ajouter une description interne.',
          'Cliquer sur **Créer le code**.',
        ],
      },
      {
        type: 'p',
        text: 'La liste des codes montre pour chacun la réduction, les limites, la validité, le nombre d’utilisations et le coût cumulé pour TamCar ; un code peut être **activé ou désactivé** à tout moment sans être supprimé.',
      },
    ],
  },
  {
    id: 'bannieres',
    group: 'Communication et contenus',
    title: 'Bannières',
    path: '/admin/banners',
    blocks: [
      {
        type: 'p',
        text: 'Les visuels affichés en haut de l’accueil des applications. Les changements sont **immédiats**. Il y a des bannières pour trois publics : **clients**, **chauffeurs** et **partenaires véhicule**.',
      },
      {
        type: 'steps',
        items: [
          'Dans « Nouvelle bannière », choisir l’**audience**, téléverser l’**image**, saisir le titre et le sous-titre, le texte du bouton et le **lien** au clic, et l’**ordre d’affichage**.',
          'Image conseillée : **1400 × 560 px** (format 2,5:1). Elle est réduite automatiquement à l’envoi.',
          'Sur une bannière existante : **monter / descendre** pour l’ordre, **modifier** le titre et le lien, **remplacer l’image**, **activer / désactiver**, **supprimer**.',
        ],
      },
    ],
  },
  {
    id: 'lieux',
    group: 'Communication et contenus',
    title: 'Lieux',
    path: '/admin/places',
    blocks: [
      {
        type: 'p',
        text: 'La base des lieux qui apparaissent dans la recherche d’adresses des clients (quartiers, commerces, hôpitaux, écoles, hôtels…). Les clients peuvent en proposer : ces propositions attendent votre validation.',
      },
      {
        type: 'ul',
        items: [
          '**À modérer** : les lieux proposés par les utilisateurs. **Valider** pour les publier, **Rejeter** pour les écarter.',
          '**Ajouter un lieu** : nom, coordonnées (latitude, longitude), quartier et catégorie.',
          '**La liste des lieux** : on peut y supprimer un lieu erroné. L’origine de chaque lieu est indiquée (OpenStreetMap, ajouté par l’administration, proposé par un utilisateur…).',
        ],
      },
    ],
  },

  // ================================================================ SYSTÈME
  {
    id: 'sauvegardes',
    group: 'Système',
    title: 'Sauvegardes',
    path: '/admin/sauvegardes',
    blocks: [
      {
        type: 'p',
        text: 'La mémoire de la plateforme : une copie des données est faite **chaque jour à 5 h**. Un fichier de secours est conservé chaque semaine (12 semaines) et une copie lisible est archivée chaque mois sur un dossier Google Drive dédié.',
      },
      {
        type: 'ul',
        items: [
          '**Sauvegarder maintenant** : lance une sauvegarde immédiate (avant une opération délicate, par exemple).',
          '**Envoyer sur Drive maintenant** : pousse la copie vers le dossier Drive.',
          '**Ouvrir le dossier Drive** : consulter les archives.',
          '**Télécharger (Excel)** : récupérer une sauvegarde sous forme de classeur lisible.',
        ],
      },
    ],
  },

  // ================================================================ RÉFÉRENCES
  {
    id: 'automatismes',
    group: 'À savoir',
    title: 'Ce qui se fait tout seul',
    blocks: [
      {
        type: 'p',
        text: 'Plusieurs opérations tournent automatiquement. Vous n’avez pas à les lancer : sachez seulement qu’elles existent, pour comprendre ce que vous voyez dans les portefeuilles.',
      },
      {
        type: 'table',
        head: ['Quand', 'Ce qui se passe'],
        rows: [
          ['Chaque soir, 22 h (lundi–samedi)', 'Prélèvement de la cotisation **TamAssur** sur le portefeuille Revenus de chaque chauffeur actif (jamais le dimanche, ni un jour non travaillé déclaré).'],
          ['Chaque soir, 23 h 55 (lundi–samedi)', 'Calcul et crédit du **bonus de performance** des chauffeurs qui ont dépassé leur objectif.'],
          ['Chaque nuit, 00 h 10 (lundi–samedi, pour la veille)', 'Clôture du **versement quotidien** des chauffeurs en formule Cession : le manque éventuel est prélevé sur leur portefeuille Revenus.'],
          ['Chaque jour, 5 h', '**Sauvegarde** des données.'],
          ['En continu', '**Suspension** d’un chauffeur dont la dette atteint 5 000 F, **réactivation** dès qu’elle repasse sous ce seuil.'],
          ['En continu', 'Les **litiges** sur les annulations sont tranchés par des règles automatiques.'],
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Date de démarrage',
        text: 'Le bonus, la cotisation TamAssur et le versement quotidien démarrent à la date de lancement (1er janvier 2027 sauf changement). Avant cette date, ils n’ont aucun effet sur les portefeuilles.',
      },
    ],
  },
  {
    id: 'vocabulaire',
    group: 'À savoir',
    title: 'Vocabulaire',
    blocks: [
      {
        type: 'table',
        head: ['Terme', 'Signification'],
        rows: [
          ['Formule Cession', 'Le chauffeur roule avec un véhicule en **location-vente** (appartenant à un partenaire véhicule ou à TamCar) et en devient propriétaire au terme du contrat. Il verse chaque jour un minimum à TamCar.'],
          ['Formule Propriétaire', 'Le chauffeur possède son véhicule. Pas de versement quotidien ni de contrat de cession.'],
          ['Partenaire véhicule', 'Un concessionnaire ou propriétaire de flotte qui met des véhicules à disposition des chauffeurs en Cession et perçoit sa part des courses.'],
          ['Catégories', 'Moto (zémidjan), Tricycle (Kloboto), Essentiel, Confort, VIP.'],
          ['Portefeuille Revenus', 'L’argent du chauffeur : ses gains, moins les commissions des courses en espèces, les cotisations et les versements. S’il est négatif, c’est une dette.'],
          ['Portefeuille Épargne', 'L’épargne TamAssur du chauffeur.'],
          ['Fonds de rachat', 'Une part des courses mise de côté pour racheter le véhicule en Cession.'],
          ['TamCar Crédit', 'Le portefeuille du client, rechargeable, qui sert à payer les courses.'],
          ['Part de TamCar', 'Pour une course, ce qui ne revient pas au chauffeur (la part de TamCar et celle du partenaire propriétaire).'],
          ['Versement', 'Le minimum que la part de TamCar doit atteindre chaque jour pour un chauffeur en Cession.'],
          ['Strike', 'Une faute prouvée du chauffeur, comptée sur sa fiche.'],
          ['KYC', 'La vérification d’identité du chauffeur (permis, pièce d’identité).'],
          ['ADR', 'Avance de démarrage remise par un partenaire véhicule, remboursée plus tard.'],
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Une question que ce guide ne couvre pas ?',
        text: 'Notez-la et transmettez-la au fondateur : le guide sera complété. Il est mis à jour avec chaque nouveauté du back-office.',
      },
    ],
  },
];
