import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { TERMS_VERSION } from '@/lib/terms';

export const metadata = {
  title: 'Conditions Générales d’Utilisation — TamCar',
};

export default function CguPage() {
  return (
    <main className="mx-auto max-w-2xl px-lg py-xl">
      <header className="flex flex-col items-center gap-sm pb-lg">
        <Logo className="h-10 w-auto" />
        <h1 className="text-center text-2xl font-extrabold text-neutral-900">
          Conditions Générales d’Utilisation
        </h1>
        <p className="text-xs text-neutral-500">
          Version {TERMS_VERSION} · Tam Logistics SARL (en cours de constitution) · Cotonou, Bénin
        </p>
      </header>

      <div className="space-y-lg text-justify text-sm leading-relaxed text-neutral-700">
        <Section n="1" title="Objet et champ d’application">
          <p>
            Les présentes Conditions Générales d’Utilisation (« CGU ») régissent
            l’accès et l’utilisation de la plateforme TamCar (applications web
            et mobiles client et chauffeur), éditée par Tam Logistics
            (« TamCar », « la Plateforme »). Elles s’appliquent à tout
            utilisateur, Client comme Chauffeur, dès la création d’un compte.
            Les relations commerciales entre TamCar et les Chauffeurs
            (répartition des revenus, cession de véhicule, objectifs de
            performance) font l’objet de contrats séparés qui complètent les
            présentes CGU sans les remplacer.
          </p>
        </Section>

        <Section n="2" title="Définitions">
          <ul className="ml-lg list-disc space-y-xs">
            <li><strong>Chauffeur</strong> : professionnel indépendant inscrit sur la Plateforme et réalisant les courses ;</li>
            <li><strong>Client</strong> : utilisateur commandant une course pour son déplacement ;</li>
            <li><strong>Course</strong> : prestation de transport de personnes conclue entre un Client et un Chauffeur via la Plateforme ;</li>
            <li><strong>Empreinte</strong> : montant temporairement bloqué sur le TamCar Crédit à titre de garantie de commande ;</li>
            <li><strong>Matching</strong> : attribution automatique d’un Chauffeur à une commande ;</li>
            <li><strong>TamCar Crédit</strong> : avoir prépayé utilisable exclusivement pour les services de la Plateforme.</li>
          </ul>
        </Section>

        <Section n="3" title="Rôle de TamCar — intermédiaire technique et commissionnaire">
          <p>
            TamCar agit exclusivement en qualité d’<strong>intermédiaire
            technique et de commissionnaire</strong>. Le contrat de transport est
            conclu <strong>directement entre le Client et le Chauffeur</strong>.
            TamCar n’est pas transporteur ; elle fournit la mise en relation, le
            calcul du prix, l’encaissement pour le compte du Chauffeur et les
            outils de suivi et de sécurité. Les sommes versées par le Client
            sont encaissées par TamCar en qualité de mandataire du Chauffeur,
            puis réparties conformément aux accords conclus avec ce dernier.
          </p>
        </Section>

        <Section n="4" title="Éligibilité et compte utilisateur">
          <p>
            L’inscription est réservée aux personnes âgées d’au moins
            <strong> 18 ans</strong> et juridiquement capables. Les mineurs ne
            peuvent voyager qu’accompagnés d’un adulte titulaire du compte. La
            création d’un compte requiert des informations exactes et à jour ;
            <strong> un seul compte par personne</strong> est autorisé.
            L’utilisateur est responsable de la confidentialité de ses
            identifiants et de toute activité effectuée depuis son compte.
            L’acceptation des présentes CGU et de la Politique de
            confidentialité est obligatoire, horodatée et conservée à valeur de
            preuve.
          </p>
        </Section>

        <Section n="5" title="Zone de service et disponibilité">
          <p>
            Le service est disponible dans les zones ouvertes par TamCar,
            actuellement le Grand Nokoué (Cotonou, Abomey-Calavi, Porto-Novo)
            et le corridor Cotonou–Porto-Novo. TamCar s’efforce d’assurer la
            disponibilité de la Plateforme mais ne garantit ni un accès
            ininterrompu (maintenance, incidents techniques, réseaux), ni la
            disponibilité d’un Chauffeur à tout moment et en tout lieu.
          </p>
        </Section>

        <Section n="6" title="Commande et exécution de la course">
          <p>
            Le Client peut commander une course immédiate ou la programmer
            jusqu’à 30 jours à l’avance. Il peut ajouter des arrêts
            intermédiaires ou modifier la destination en cours de course ; ces
            modifications sont tarifées selon la grille affichée dans
            l’application (distance, temps, frais d’attente). Le Chauffeur
            attribué, son véhicule et sa note sont affichés avant la prise en
            charge. Le nombre de passagers ne peut excéder le nombre de places
            du véhicule de la catégorie choisie.
          </p>
        </Section>

        <Section n="7" title="Prix">
          <p>
            Le prix de chaque course est <strong>affiché avant la
            commande</strong> et n’augmente pas en cours de trajet, hors
            modifications demandées par le Client (arrêts, changement de
            destination, attente prolongée) tarifées selon la grille affichée.
            TamCar ne pratique <strong>aucune majoration dynamique</strong>
            (« surge pricing »). Les liaisons corridor entre points de
            rendez-vous désignés bénéficient d’un tarif forfaitaire affiché. Une
            facture électronique est émise automatiquement à la fin de chaque
            course.
          </p>
        </Section>

        <Section n="8" title="Paiement">
          <p>
            Le paiement s’effectue, au choix du Client : en espèces (le Client
            fait son affaire de l’appoint), via le TamCar Crédit, ou par Mobile
            Money. Le paiement en espèces est confirmé par le Chauffeur dans
            l’application. Tout paiement doit transiter par les moyens proposés
            par la Plateforme — voir l’article 14 (contournement).
          </p>
        </Section>

        <Section n="9" title="TamCar Crédit">
          <p>
            Le TamCar Crédit est un <strong>avoir prépayé, utilisable
            exclusivement pour régler les services de la Plateforme</strong>. Il
            ne constitue ni un dépôt bancaire, ni de la monnaie électronique au
            sens de la réglementation BCEAO : il n’est ni rémunéré, ni
            transférable à un tiers, ni utilisable en dehors de la Plateforme.
            La recharge s’effectue par Mobile Money ou carte (montant minimum
            affiché dans l’application). En cas de clôture du compte, le solde
            non utilisé est remboursé sur demande écrite à contact@tamcar.app,
            après déduction des sommes éventuellement dues.
          </p>
          <p className="mt-sm">
            <strong>Dettes du Client.</strong> Si le solde du TamCar Crédit
            devient débiteur (frais d’annulation, empreinte consommée,
            dégradations ou toute autre somme due au titre des présentes CGU),
            le Client est tenu de régulariser sa dette sans délai. TamCar peut
            imputer toute somme due sur les recharges ultérieures et suspendre
            la possibilité de commander jusqu’à régularisation complète. La
            clôture du compte ne libère pas le Client des sommes restant dues,
            qui demeurent exigibles. Les frais de recouvrement engagés du fait
            de la défaillance du Client (mise en demeure, procédure de
            recouvrement) peuvent être mis à sa charge dans les limites
            permises par la loi.
          </p>
        </Section>

        <Section n="10" title="Empreinte de garantie (500 FCFA)">
          <p>
            À la commande, un montant de <strong>500 FCFA</strong> est
            temporairement bloqué sur le TamCar Crédit du Client à titre de
            garantie. Il est intégralement libéré à la fin de la course
            (paiement espèces ou Mobile Money) ou imputé sur le prix (paiement
            TamCar Crédit). En acceptant les présentes CGU, le Client consent
            expressément à ce mécanisme. Pour certains profils (nouveau compte
            sur une course de plus de 5 000 FCFA, score de fiabilité dégradé),
            une empreinte majorée ou un pré-paiement partiel ou total peut être
            exigé ; le montant est toujours affiché avant la confirmation de la
            commande.
          </p>
        </Section>

        <Section n="11" title="Annulations">
          <p>Les frais d’annulation suivants s’appliquent, débités du TamCar Crédit :</p>
          <ul className="ml-lg list-disc space-y-xs">
            <li>Avant l’attribution d’un chauffeur : <strong>gratuit</strong> ;</li>
            <li>Dans les 30 secondes suivant l’attribution : <strong>gratuit</strong> ;</li>
            <li>Chauffeur en route : <strong>300 FCFA</strong> ;</li>
            <li>Chauffeur arrivé au point de prise en charge : <strong>500 FCFA</strong> ;</li>
            <li>Non-présentation du Client après 5 minutes d’attente : <strong>500 FCFA</strong> ;</li>
            <li>Course commencée puis interrompue à la demande du Client : <strong>50 % du prix estimé</strong>.</li>
          </ul>
          <p className="mt-sm">
            Lorsque le Chauffeur attribué termine une autre course, le barème ne
            court qu’à partir du moment où il fait effectivement route vers le
            Client. Un Chauffeur qui accepte puis annule sans motif légitime est
            soumis à un barème équivalent. Toute annulation peut être contestée
            auprès du support ; un arbitrage est rendu sur la base des éléments
            enregistrés par la Plateforme.
          </p>
        </Section>

        <Section n="12" title="Obligations du Client">
          <p>Le Client s’engage à :</p>
          <ul className="ml-lg list-disc space-y-xs">
            <li>adopter un comportement respectueux envers le Chauffeur et son véhicule ;</li>
            <li>respecter le nombre de places du véhicule et attacher sa ceinture (casque obligatoire fourni sur les motos) ;</li>
            <li>ne transporter ni substances illicites, ni armes, ni matières dangereuses ;</li>
            <li>ne pas voyager en état de nature à compromettre la sécurité ou la salubrité du trajet ;</li>
            <li>obtenir l’accord préalable du Chauffeur pour les animaux (hors chiens d’assistance) ;</li>
            <li>répondre des dégradations qu’il cause au véhicule (frais de remise en état facturables via la Plateforme).</li>
          </ul>
        </Section>

        <Section n="13" title="Obligations du Chauffeur">
          <p>Le Chauffeur s’engage à :</p>
          <ul className="ml-lg list-disc space-y-xs">
            <li>respecter le code de la route et adapter sa conduite à la sécurité des passagers ;</li>
            <li>maintenir son véhicule propre, en bon état et conforme aux exigences d’inspection TamCar ;</li>
            <li>prendre en charge tout Client sans discrimination ;</li>
            <li>suivre l’itinéraire proposé sauf demande du Client ou circonstance justifiée ;</li>
            <li>ne réclamer aucun supplément non affiché par l’application ;</li>
            <li>ne pas transporter d’autres personnes que le Client et ses accompagnants pendant une course.</li>
          </ul>
        </Section>

        <Section n="14" title="Interdiction de contournement">
          <p>
            Il est interdit de conclure, solliciter ou accepter une course en
            dehors de la Plateforme avec un Client ou un Chauffeur rencontré via
            TamCar, ou de régler une course par un moyen non proposé par
            l’application. Le contournement prive les parties des protections de
            la Plateforme (assurance, traçabilité, arbitrage) et entraîne la
            suspension du compte.
          </p>
        </Section>

        <Section n="15" title="Transport de personnes uniquement — marchandises exclues">
          <p>
            La Plateforme est dédiée au <strong>transport de personnes</strong>.
            Les effets personnels et bagages accompagnant le Client (volume
            raisonnable, logeable dans le coffre) voyagent sous sa seule
            responsabilité. <strong>TamCar décline toute responsabilité
            concernant les marchandises, colis ou biens transportés</strong>, y
            compris à bord des tricycles. Tout transport de marchandises convenu
            directement entre un Client et un Chauffeur l’est en dehors de la
            Plateforme et n’engage pas TamCar.
          </p>
        </Section>

        <Section n="16" title="Score de fiabilité et notation">
          <p>
            Chaque compte dispose d’un score de fiabilité affecté par les
            annulations abusives et restauré par les courses menées à terme. Un
            score dégradé peut entraîner une majoration de l’empreinte, une
            exigence de pré-paiement ou la suspension du compte. Clients et
            Chauffeurs se notent mutuellement après chaque course ; les notes
            sont visibles avant la prise en charge.
          </p>
        </Section>

        <Section n="17" title="Fraude">
          <p>
            Sont notamment constitutifs de fraude : la falsification de
            position GPS, la création de comptes multiples, l’abus des
            programmes de parrainage ou codes promotionnels, l’utilisation de
            moyens de paiement frauduleux, la manipulation du matching. Toute
            fraude entraîne l’annulation des avantages indûment acquis, la
            suspension immédiate du compte et, le cas échéant, des poursuites.
          </p>
        </Section>

        <Section n="18" title="Objets oubliés">
          <p>
            Le Client signale tout objet oublié via le support ou la fiche de
            la course concernée, dans les meilleurs délais et au plus tard
            <strong> 48 heures</strong> après la fin de la course, avec une
            description précise de l’objet. <strong>Il appartient au Client
            d’établir que l’objet a été oublié dans le véhicule</strong> et non
            en un autre lieu — notamment par la cohérence entre sa
            déclaration, la description fournie et les données de la course
            (horaires, itinéraire, signalement du Chauffeur). Le Chauffeur qui
            retrouve un objet le signale symétriquement via l’application.
          </p>
          <p className="mt-sm">
            TamCar intervient comme <strong>simple facilitateur</strong> de la
            mise en relation en vue de la restitution : la seule déclaration du
            Client ne suffit pas à engager la responsabilité de TamCar ni celle
            du Chauffeur, et TamCar ne garantit pas la restitution des objets.
            Les frais de retour éventuels (course dédiée) sont à la charge du
            Client. Tout signalement manifestement abusif ou frauduleux est
            traité conformément à l’article 17.
          </p>
        </Section>

        <Section n="19" title="Sécurité et urgences">
          <p>
            Un bouton SOS géolocalisé est disponible pendant la course ; il
            alerte l’équipe TamCar et les contacts désignés, mais ne se
            substitue pas aux services publics de secours (police : 117,
            pompiers : 118). Les trajets sont tracés (heure, itinéraire,
            identité des parties) à des fins de sécurité et d’arbitrage. Les
            dommages corporels subis par les passagers relèvent de l’assurance
            responsabilité civile du véhicule.
          </p>
        </Section>

        <Section n="20" title="Réclamations, arbitrage et convention de preuve">
          <p>
            Toute réclamation relative à une course est adressée au support via
            l’application dans un délai de <strong>30 jours</strong> suivant la
            course. TamCar statue sur la base des données enregistrées par la
            Plateforme (horodatages, géolocalisation, échanges in-app,
            transactions), que les parties <strong>reconnaissent comme mode de
            preuve admissible et fiable</strong> entre elles. L’arbitrage de
            TamCar ne prive pas les parties de leurs droits de recours devant
            les juridictions compétentes.
          </p>
        </Section>

        <Section n="21" title="Responsabilité de TamCar">
          <p>
            En sa qualité d’intermédiaire, TamCar n’est pas partie au contrat
            de transport et ne répond pas de l’exécution de la course
            (retards, itinéraires, incidents de circulation). TamCar n’est pas
            responsable des dommages résultant d’une utilisation non conforme
            de la Plateforme, des cas de force majeure, ni des interruptions
            imputables aux réseaux de télécommunication ou à ses prestataires.
            En tout état de cause, la responsabilité de TamCar au titre d’une
            course est limitée au montant de ladite course. Rien dans les
            présentes n’exclut une responsabilité qui ne peut l’être en vertu
            de la loi.
          </p>
        </Section>

        <Section n="22" title="Suspension et résiliation du compte">
          <p>
            TamCar peut suspendre ou résilier un compte en cas de violation des
            présentes CGU, de fraude, de comportement dangereux ou d’impayés,
            après notification motivée sauf urgence. L’utilisateur peut
            supprimer son compte à tout moment depuis l’application ou par
            demande à contact@tamcar.app ; la suppression entraîne le
            traitement du solde TamCar Crédit selon l’article 9 et la
            conservation des données selon la Politique de confidentialité.
          </p>
        </Section>

        <Section n="23" title="Propriété intellectuelle">
          <p>
            La marque TamCar, le logo, l’application, sa charte graphique et
            ses contenus sont la propriété exclusive de Tam Logistics. Toute
            reproduction, extraction ou utilisation non autorisée — y compris
            l’extraction automatisée de données et l’ingénierie inverse — est
            interdite.
          </p>
        </Section>

        <Section n="24" title="Données personnelles">
          <p>
            Le traitement des données personnelles est décrit dans la{' '}
            <Link href="/confidentialite" className="font-semibold text-primary-600 underline">
              Politique de confidentialité
            </Link>
            , qui fait partie intégrante des présentes CGU.
          </p>
        </Section>

        <Section n="25" title="Communications">
          <p>
            L’utilisateur accepte de recevoir les communications
            transactionnelles nécessaires au service (confirmations, suivi de
            course, sécurité, factures) par notification, SMS ou email. Les
            communications promotionnelles peuvent être désactivées à tout
            moment depuis les réglages du compte.
          </p>
        </Section>

        <Section n="26" title="Modification des CGU">
          <p>
            TamCar peut faire évoluer les présentes CGU. Toute modification
            substantielle donne lieu à une nouvelle version datée, soumise à
            une nouvelle acceptation lors de la connexion suivante. La
            poursuite de l’utilisation après acceptation vaut consentement.
          </p>
        </Section>

        <Section n="27" title="Dispositions diverses">
          <p>
            Si une stipulation des présentes est jugée nulle, les autres
            demeurent en vigueur. Le fait pour TamCar de ne pas se prévaloir
            d’un manquement ne vaut pas renonciation. TamCar peut transférer
            les présentes à toute entité venant aux droits de Tam Logistics,
            notamment à l’issue de sa constitution en société. Les présentes
            CGU sont rédigées en français, seule version faisant foi, et
            constituent l’intégralité de l’accord entre TamCar et
            l’utilisateur quant à l’utilisation de la Plateforme.
          </p>
        </Section>

        <Section n="28" title="Droit applicable et juridiction">
          <p>
            Les présentes CGU sont régies par le droit de la République du
            Bénin et les Actes uniformes OHADA applicables. En cas de litige,
            les parties recherchent d’abord une solution amiable via le
            support ; à défaut d’accord sous 30 jours, le litige relève des
            juridictions compétentes de Cotonou.
          </p>
        </Section>
      </div>

      <footer className="mt-2xl border-t border-neutral-200 pt-lg text-center text-xs text-neutral-400">
        Tam Logistics SARL (en cours de constitution) · Cotonou, Bénin ·
        contact@tamcar.app
      </footer>
    </main>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-sm text-base font-bold text-neutral-900">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}
