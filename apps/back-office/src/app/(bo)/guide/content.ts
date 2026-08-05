/**
 * Contenu du guide d'utilisation de TamCar Office.
 * Texte en chaînes JS : **gras** rendu par RichText.
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
  title: string;
  blocks: GuideBlock[];
};

export const GUIDE_SECTIONS: GuideSection[] = [
  // ----------------------------------------------------------------
  {
    id: 'roles',
    title: 'Qui fait quoi',
    blocks: [
      {
        type: 'p',
        text: 'Chaque compte a un seul rôle, et ce rôle décide de ce que la personne peut faire. Ce n’est pas une question de confiance : c’est une séparation des tâches, le principe de base de toute organisation comptable saine.',
      },
      {
        type: 'table',
        head: ['Rôle', 'Ce que la personne fait'],
        rows: [
          [
            'Fondateur',
            'Accès complet. Seul à pouvoir valider les opérations importantes, passer une écriture à la main et corriger une écriture existante.',
          ],
          [
            'Secrétariat',
            'Enregistre le courrier, les documents, les échéances et les opérations de trésorerie. Ne manipule jamais de comptes ni d’écritures : le logiciel s’en charge à sa place.',
          ],
          [
            'Expert-comptable',
            'Lecture seule sur l’ensemble. Il révise et vise, il ne saisit rien.',
          ],
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Rien ne s’efface, tout est tracé',
        text: 'Chaque action est horodatée et attribuée à son auteur. Ce n’est pas de la surveillance : c’est ce qui rend la comptabilité **opposable** en cas de contrôle fiscal, et crédible face à un investisseur. Une comptabilité qu’on peut retoucher discrètement ne prouve rien.',
      },
    ],
  },

  // ----------------------------------------------------------------
  {
    id: 'vocabulaire',
    title: 'Le vocabulaire, en clair',
    blocks: [
      {
        type: 'p',
        text: 'Quelques mots reviennent partout dans l’application. Les comprendre une fois suffit ; vous n’aurez jamais à les manipuler vous-même.',
      },
      {
        type: 'table',
        head: ['Mot', 'Ce que ça veut dire'],
        rows: [
          [
            'Pièce (ou justificatif)',
            'Le papier qui prouve l’opération : facture, reçu, capture Mobile Money. Sans pièce, une dépense est contestable — et en contrôle fiscal, une dépense contestée est une dépense refusée.',
          ],
          [
            'Écriture',
            'La traduction comptable d’une opération. Toute écriture a deux faces d’un montant strictement égal : d’où vient l’argent, où il va.',
          ],
          [
            'Débit et crédit',
            'Ce ne sont **pas** « moins » et « plus ». Ce sont juste les noms des deux colonnes. Payer le loyer en espèces met la charge « loyer » au débit et la caisse au crédit. L’application le fait pour vous.',
          ],
          [
            'Journal',
            'Le classeur dans lequel l’écriture est rangée : Banque, Caisse, Mobile Money, Achats, Opérations diverses, Plateforme. Choisi automatiquement d’après le moyen de paiement.',
          ],
          [
            'Numéro de pièce',
            'Chaque document et chaque écriture reçoit un numéro unique et définitif : PC-2026-0001, BQ-2026-0014. Il ne se modifie pas et ne se réutilise pas.',
          ],
          [
            'Charge',
            'Une dépense consommée dans l’année : carburant, loyer, électricité. Elle diminue le résultat de l’année.',
          ],
          [
            'Immobilisation',
            'Un bien qui sert plusieurs années : ordinateur, tricycle, mobilier, travaux. L’argent sort pareil, mais le bien apparaît au bilan et perd de la valeur petit à petit. Il suffit de choisir la bonne catégorie, le reste suit.',
          ],
          [
            'Grand livre',
            'L’historique complet d’un compte : tous les mouvements, dans l’ordre, avec le solde qui évolue.',
          ],
          [
            'Balance',
            'La photo de tous les comptes à une date donnée. C’est là que se lit le résultat provisoire.',
          ],
          [
            'Extourne',
            'La façon propre de corriger une écriture fausse. Voir la section « Corriger une erreur ».',
          ],
          [
            'Wallets / encours plateforme',
            'L’argent des clients et des chauffeurs détenu par la plateforme. **Ce n’est pas l’argent de TamCar** : il apparaît séparément de la trésorerie société, et ne doit jamais être confondu avec elle.',
          ],
        ],
      },
    ],
  },

  // ----------------------------------------------------------------
  {
    id: 'documents',
    title: 'Enregistrer un document ou un courrier',
    blocks: [
      {
        type: 'p',
        text: 'Toute pièce qui entre ou qui sort de l’entreprise passe par « Enregistrer un document » : lettre reçue, courrier envoyé, contrat signé, attestation, facture, document administratif. Photographiez-la ou déposez le PDF, choisissez le type, donnez un objet clair — l’application attribue un numéro et la range dans le coffre.',
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Soignez l’objet',
        text: 'L’objet doit permettre de retrouver la pièce dans six mois **sans l’ouvrir**. « Facture » est un mauvais objet. « Facture SBEE électricité juillet 2026 » est un bon objet. C’est le champ sur lequel porte la recherche.',
      },
      { type: 'h3', text: 'Les quatre statuts' },
      {
        type: 'table',
        head: ['Statut', 'Quand l’utiliser'],
        rows: [
          [
            'À traiter',
            'Le document vient d’être enregistré, personne ne s’en est encore occupé. C’est le statut d’arrivée, attribué automatiquement.',
          ],
          [
            'En cours',
            'Quelqu’un s’en occupe : réponse en préparation, dossier en attente d’une pièce manquante, sujet en discussion.',
          ],
          [
            'Traité',
            'L’affaire est close : la réponse est partie, la facture est payée, le dossier est bouclé. Le document reste consultable normalement.',
          ],
          [
            'Archivé',
            'Rangé définitivement. On le sort de la vue courante pour ne garder sous les yeux que ce qui est vivant. Il reste retrouvable par la recherche.',
          ],
        ],
      },
      {
        type: 'p',
        text: 'Le tableau de bord compte les documents « À traiter » : c’est votre liste du jour. Le travail consiste à la faire descendre.',
      },
      {
        type: 'note',
        tone: 'warn',
        title: 'On ne supprime pas un document',
        text: 'Un document enregistré par erreur se met en **Archivé**, avec une note expliquant pourquoi. Supprimer casserait la numérotation continue, qui est précisément ce qui rend le registre crédible.',
      },
    ],
  },

  // ----------------------------------------------------------------
  {
    id: 'operations',
    title: 'Enregistrer une opération de trésorerie',
    blocks: [
      {
        type: 'p',
        text: 'Dès que de l’argent sort, allez dans « Nouvelle opération ». C’est le geste le plus fréquent de la journée, et le plus important : c’est lui qui alimente toute la comptabilité.',
      },
      {
        type: 'steps',
        items: [
          'Photographiez le justificatif, **ou** décrivez l’opération en une phrase, **ou** les deux — les deux ensemble donnent le meilleur résultat.',
          'Cliquez sur « Analyser ». L’assistant lit la pièce, comprend la nature de la dépense et pré-remplit tous les champs.',
          'Vérifiez trois choses : **le montant**, **la date**, **la catégorie**.',
          'Confirmez. L’écriture comptable est passée, la pièce est numérotée et rattachée.',
        ],
      },
      {
        type: 'note',
        tone: 'warn',
        title: 'Vérifiez toujours le montant',
        text: 'L’assistant se trompe rarement, mais il se trompe. Sur un reçu froissé ou mal éclairé, il peut lire un numéro de téléphone ou de facture à la place du total. L’étape de vérification n’est pas une formalité : c’est votre travail, et c’est pour cela que le logiciel vous montre le degré de confiance de l’analyse.',
      },
      { type: 'h3', text: 'Payé, ou à payer ?' },
      {
        type: 'ul',
        items: [
          'La facture est **déjà réglée** : choisissez le moyen de paiement (Banque, MTN, Moov, Caisse) et la date du règlement.',
          'La facture n’est **pas encore réglée** : choisissez « À crédit ». L’application inscrit la dette au fournisseur ; vous enregistrerez le paiement plus tard, à sa date.',
        ],
      },
      {
        type: 'note',
        tone: 'warn',
        title: 'Un devis ou un bon de commande n’est pas une dépense',
        text: 'Tant qu’aucun engagement ferme n’existe, il n’y a rien à comptabiliser : enregistrez la pièce comme **document** et créez l’opération le jour où l’argent sort. Et si le paiement est **échelonné**, c’est **une opération par versement**, chacune à sa propre date — pas une seule opération pour le total.',
      },
      { type: 'h3', text: 'Bien choisir la catégorie' },
      {
        type: 'p',
        text: 'Les catégories sont regroupées en cinq familles. La distinction qui compte vraiment est entre les **dépenses courantes** et les **équipements** : un ordinateur, un tricycle, du mobilier ou des travaux ne sont pas des charges de l’année, ce sont des biens durables. Choisir la bonne famille suffit — le logiciel place l’écriture dans le bon compte, et le bilan est juste dès la saisie.',
      },
      {
        type: 'ul',
        items: [
          '**Dépenses courantes** — loyer, carburant, électricité, téléphone, fournitures, entretien, marketing, honoraires…',
          '**Équipements et immobilisations** — matériel informatique, mobilier, logiciels achetés, aménagements, tricycles, motos, avances sur commande, cautions versées.',
          '**Personnel et social** — salaires nets, avances sur salaire, cotisations CNSS.',
          '**Impôts, taxes et finances** — patente, redevances ANATT, droits d’enregistrement, frais bancaires et Mobile Money, intérêts, avances fournisseurs.',
          '**Divers** — tout le reste.',
        ],
      },
    ],
  },

  // ----------------------------------------------------------------
  {
    id: 'echeances',
    title: 'Ne rien rater : les échéances',
    blocks: [
      {
        type: 'p',
        text: 'La page Échéances rassemble tout ce qui a une date butoir : autorisation ANATT, patente, primes d’assurance, visites techniques, déclarations CNSS, assemblée générale, dépôt des états financiers. Ce sont les oublis qui coûtent le plus cher dans une jeune entreprise, parce qu’ils arrivent avec des pénalités.',
      },
      {
        type: 'p',
        text: 'Ajoutez une échéance avec son intitulé, sa catégorie, sa date et — si elle revient — sa périodicité. Quand elle est faite, cochez-la : si elle est récurrente, **la suivante se reprogramme toute seule** à la bonne date. Le tableau de bord affiche celles des trente prochains jours et signale en rouge celles qui sont dépassées.',
      },
    ],
  },

  // ----------------------------------------------------------------
  {
    id: 'validations',
    title: 'Les validations (fondateur)',
    blocks: [
      {
        type: 'p',
        text: 'Une opération saisie par le secrétariat est comptabilisée automatiquement quand elle remplit **deux conditions** : elle est inférieure ou égale à 100 000 F, et l’assistant est sûr de son analyse. Sinon, elle attend dans la page « Validations ».',
      },
      {
        type: 'p',
        text: 'Vous y voyez le montant, la catégorie proposée, le justificatif, la phrase d’origine et le degré de confiance de l’analyse. Deux boutons : **Valider et comptabiliser**, qui passe l’écriture ; ou **Rejeter**, avec un motif. Dans les deux cas, la décision est enregistrée avec votre nom et l’heure.',
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Le seuil est un réglage, pas une loi',
        text: 'Les 100 000 F et le niveau de confiance requis peuvent être relevés ou abaissés à tout moment. Commencez prudent, puis desserrez quand la confiance s’installe avec la personne qui saisit.',
      },
    ],
  },

  // ----------------------------------------------------------------
  {
    id: 'extourne',
    title: 'Corriger une erreur : l’extourne',
    blocks: [
      {
        type: 'p',
        text: 'Une écriture validée ne se modifie jamais et ne s’efface jamais. Pour corriger, on l’**extourne** : le logiciel crée automatiquement une écriture jumelle, inversée, qui annule exactement la première. Les deux restent visibles. Vous saisissez ensuite la bonne opération.',
      },
      {
        type: 'p',
        text: 'Cela paraît lourd, et c’est volontaire. Une comptabilité qu’on peut retoucher après coup ne prouve rien du tout ; l’extourne laisse la trace de l’erreur **et** de sa correction. C’est exactement ce qu’attendent un contrôleur fiscal, un expert-comptable qui vise vos comptes, et un investisseur en audit d’acquisition.',
      },
      {
        type: 'steps',
        items: [
          'Ouvrez l’écriture fautive depuis la page Écritures.',
          'Cliquez sur « Extourner cette écriture », puis confirmez.',
          'L’écriture d’origine se marque « Extournée » et une écriture inverse apparaît, datée du jour.',
          'Saisissez la bonne opération normalement.',
        ],
      },
      {
        type: 'note',
        tone: 'warn',
        title: 'Réservé au fondateur',
        text: 'L’extourne et la saisie libre d’écritures sont réservées au fondateur. Si le secrétariat repère une erreur sur une écriture déjà passée, il **ne la corrige pas** : il la signale.',
      },
    ],
  },

  // ----------------------------------------------------------------
  {
    id: 'compta',
    title: 'Lire ses chiffres (fondateur)',
    blocks: [
      {
        type: 'table',
        head: ['Page', 'Ce qu’on y lit'],
        rows: [
          [
            'Trésorerie',
            'Combien vous avez et où : banque, Mobile Money, caisse. En dessous, séparément, l’encours des wallets — l’argent des clients et chauffeurs, qui ne vous appartient pas.',
          ],
          [
            'Écritures',
            'Le journal complet, filtrable par type. Chaque ligne s’ouvre sur le détail et son justificatif.',
          ],
          [
            'Balance',
            'Tous les comptes mouvementés, groupés par classe, avec le contrôle « débits = crédits » et le résultat provisoire (produits moins charges).',
          ],
          [
            'Grand livre',
            'L’historique d’un compte précis, avec le solde qui évolue ligne après ligne. C’est ici qu’on vient quand un chiffre de la balance surprend.',
          ],
          [
            'Plan de comptes',
            'La liste de référence des comptes utilisés. Consultation seulement.',
          ],
          [
            'Sync plateforme',
            'Un bouton à cliquer une fois par jour ou par semaine : il comptabilise l’activité des courses. **Aucun risque à cliquer deux fois** — un jour déjà comptabilisé n’est jamais repris.',
          ],
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Le premier geste après l’installation',
        text: 'Passez l’**écriture d’ouverture** via Écritures → Nouvelle écriture, journal OD : la libération des apports en capital (débit Banque, crédit Capital social). Sans elle, la trésorerie affichera un solde négatif dès la première dépense, ce qui est normal mais déroutant.',
      },
    ],
  },

  // ----------------------------------------------------------------
  {
    id: 'regles',
    title: 'Les cinq règles d’or',
    blocks: [
      {
        type: 'steps',
        items: [
          '**Une opération, une pièce.** Photographiez systématiquement, même un petit reçu de taxi. Une dépense sans justificatif est une dépense qu’un contrôleur peut refuser.',
          '**Décrire, pas interpréter.** Écrivez ce qui s’est passé (« payé 45 000 F de carburant à la station JNP en espèces »), pas ce que vous croyez qu’il faut écrire en comptabilité. Le logiciel s’occupe du reste.',
          '**Chaque chose à sa date.** La date de l’opération est celle du paiement (ou celle de la facture si vous choisissez « À crédit »), jamais celle de la saisie.',
          '**Ne jamais supprimer.** Un document se met en Archivé, une écriture s’extourne. Jamais de suppression, jamais de retouche discrète.',
          '**Dans le doute, envoyer en validation.** Une opération qui part en validation ne fait perdre à personne plus de quelques heures. Une opération mal classée qui passe inaperçue se paie au moment du bilan.',
        ],
      },
    ],
  },

  // ----------------------------------------------------------------
  {
    id: 'depannage',
    title: 'Que faire si…',
    blocks: [
      {
        type: 'table',
        head: ['Situation', 'La bonne réaction'],
        rows: [
          [
            'Je me suis trompé de montant sur une opération déjà comptabilisée',
            'Prévenez le fondateur. Il extourne l’écriture, et vous ressaisissez l’opération correctement. Ne tentez rien d’autre.',
          ],
          [
            'L’assistant a mal classé la dépense',
            'Corrigez la catégorie **avant** de confirmer — c’est précisément à cela que sert l’étape de vérification. Aucune conséquence.',
          ],
          [
            'Je n’ai pas le justificatif sous la main',
            'Saisissez l’opération avec la description seule, écrivez « justificatif à récupérer » dans les notes, et rattachez la pièce plus tard.',
          ],
          [
            'La photo est floue ou l’analyse échoue',
            'Reprenez la photo à plat, sans ombre. Si le reçu reste illisible, saisissez les champs à la main : tous restent modifiables.',
          ],
          [
            'Le montant dépasse le seuil',
            'C’est normal : l’opération part en validation. Prévenez le fondateur si elle est urgente.',
          ],
          [
            'Je ne retrouve pas un document',
            'Page Documents : la recherche porte sur l’objet, le correspondant et le numéro de pièce. Le filtre par type réduit la liste.',
          ],
          [
            'Le bouton dont parle ce guide n’apparaît pas',
            'Il est probablement réservé au fondateur. Les fonctions comptables sensibles — saisie libre, extourne, validation — ne s’affichent que pour lui.',
          ],
        ],
      },
    ],
  },
];
