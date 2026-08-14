import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { TERMS_VERSION } from '@/lib/terms';

export const metadata = {
  title: 'Politique de confidentialité — TamCar',
};

export default function ConfidentialitePage() {
  return (
    <main className="mx-auto max-w-2xl px-lg py-xl">
      <header className="flex flex-col items-center gap-sm pb-lg">
        <Link href="/" aria-label="Retour à l’accueil" className="transition hover:opacity-80">
          <Logo className="h-10 w-auto" />
        </Link>
        <h1 className="text-center text-2xl font-extrabold text-neutral-900">
          Politique de confidentialité
        </h1>
        <p className="text-xs text-neutral-500">
          Version {TERMS_VERSION} · Tam Logistics SARL · Cotonou, Bénin
        </p>
      </header>

      <div className="space-y-lg text-justify text-sm leading-relaxed text-neutral-700">
        <Section title="1. Responsable du traitement">
          <p>
            Tam Logistics (« TamCar »), Cotonou, Bénin — contact :
            contact@tamcar.app. Le traitement des données personnelles est
            effectué conformément à la loi n° 2017-20 du 20 avril 2018 portant
            Code du numérique en République du Bénin, sous le contrôle de
            l’Autorité de Protection des Données Personnelles (APDP).
          </p>
        </Section>

        <Section title="2. Données collectées">
          <ul className="ml-lg list-disc space-y-xs">
            <li><strong>Identité</strong> : nom, prénom, email, numéro de téléphone, photo de profil si vous en ajoutez une ;</li>
            <li><strong>Localisation précise</strong> : votre position pendant la commande et la course, nécessaire à la mise en relation, au calcul de l’itinéraire et au suivi. Côté Chauffeur, la position continue d’être transmise pendant une course même lorsque l’écran est éteint ou l’application en arrière-plan ;</li>
            <li><strong>Localisation approximative</strong> : la position des Chauffeurs en service est <strong>arrondie à environ 200 mètres</strong> avant d’être affichée sur la carte des Clients (voir l’article 4) ;</li>
            <li><strong>Lieux enregistrés</strong> : les adresses que vous choisissez de mémoriser, notamment votre domicile et votre lieu de travail. Vous pouvez les supprimer à tout moment depuis « Mes lieux » ;</li>
            <li><strong>Contenus de course</strong> : messages écrits, photos et messages vocaux échangés entre Client et Chauffeur pendant une course ;</li>
            <li><strong>Courses</strong> : itinéraires, horaires, prix, réservations, notations ;</li>
            <li><strong>Transactions</strong> : mouvements du portefeuille TamCar Crédit, références de paiement Mobile Money (jamais vos codes secrets) ;</li>
            <li><strong>Techniques</strong> : type d’appareil, identifiants de session, journaux de connexion, et l’identifiant de notification de votre appareil lorsque vous acceptez de recevoir des alertes.</li>
          </ul>
        </Section>

        <Section title="3. Finalités">
          <p>
            Mise en relation Client-Chauffeur, calcul des prix, exécution et
            suivi des courses, guidage du Chauffeur, affichage de la
            disponibilité des véhicules, envoi des notifications liées à vos
            courses et réservations, facturation, gestion du portefeuille,
            prévention de la fraude et des annulations abusives, sécurité des
            utilisateurs et traçabilité en cas d’incident, support et arbitrage
            des litiges, obligations légales et comptables.
          </p>
        </Section>

        <Section title="4. Position des Chauffeurs affichée aux Clients">
          <p>
            Lorsqu’un Chauffeur est en service, un véhicule apparaît sur la
            carte des Clients connectés afin qu’ils sachent si une course est
            réellement disponible autour d’eux. Cet affichage est encadré :
          </p>
          <ul className="ml-lg mt-sm list-disc space-y-xs">
            <li>la position est <strong>arrondie à une grille d’environ 200 mètres</strong> — elle situe un véhicule dans un quartier, elle ne permet pas de le suivre ;</li>
            <li><strong>aucune identité n’est transmise</strong> : ni nom, ni photo, ni immatriculation, ni identifiant. Seule la catégorie du véhicule est indiquée ;</li>
            <li>l’affichage est <strong>limité à cinq véhicules</strong> et à un rayon restreint autour du Client ;</li>
            <li>il cesse dès que le Chauffeur se met hors service.</li>
          </ul>
          <p className="mt-sm">
            La position <strong>précise</strong> d’un Chauffeur n’est communiquée
            qu’au Client de la course qu’il a acceptée, et pour la seule durée de
            cette course.
          </p>
        </Section>

        <Section title="5. Partage des données">
          <ul className="ml-lg list-disc space-y-xs">
            <li>Pendant une course, le Chauffeur et le Client voient réciproquement le prénom, la note, le numéro de téléphone et la position de l’autre, pour la seule durée de la course ;</li>
            <li>Si vous partagez le lien de suivi d’une course, toute personne disposant de ce lien peut voir le trajet en temps réel jusqu’à la fin de la course. Vous seul décidez de l’envoyer ;</li>
            <li>Prestataires techniques strictement nécessaires : <strong>Supabase</strong> et <strong>Vercel</strong> (hébergement et base de données), <strong>Mapbox</strong> (cartographie, itinéraires et recherche d’adresses), <strong>Google</strong> (recherche de lieux, en secours lorsque notre propre base ne trouve pas une adresse, et acheminement des notifications sur Android), <strong>FeexPay</strong> (paiement Mobile Money) ;</li>
            <li>Si vous nous écrivez sur WhatsApp, l’échange est soumis à la politique de confidentialité de Meta ;</li>
            <li>Autorités : uniquement sur réquisition légale.</li>
          </ul>
          <p className="mt-sm">
            <strong>TamCar ne vend ni ne loue jamais vos données personnelles.</strong>
          </p>
        </Section>

        <Section title="6. Durées de conservation">
          <p>
            Données de compte : durée de vie du compte + 12 mois. Données de
            courses et transactions : 5 ans (obligations comptables et
            fiscales). Messages, photos et vocaux échangés pendant une course :
            12 mois, puis suppression. Lieux enregistrés : jusqu’à ce que vous
            les supprimiez ou que vous fermiez votre compte. Identifiants de
            notification : jusqu’à la désinstallation de l’application ou le
            refus des notifications. Journaux techniques : 12 mois. Localisation
            en temps réel : traitée pendant la course, agrégée ensuite.
          </p>
        </Section>

        <Section title="7. Sécurité">
          <p>
            Chiffrement des échanges (TLS), cloisonnement des accès en base de
            données (row-level security), authentification sécurisée. L’accès
            interne aux données est limité aux besoins du support et de
            l’exploitation.
          </p>
        </Section>

        <Section title="8. Vos droits">
          <p>
            Conformément au Code du numérique béninois, vous disposez de droits
            d’accès, de rectification, d’opposition, de suppression et de
            portabilité de vos données. Exercice : contact@tamcar.app (réponse
            sous 30 jours). Vous pouvez également saisir l’APDP.
          </p>
        </Section>

        <Section title="9. Modification de la présente politique">
          <p>
            Toute modification substantielle donne lieu à une nouvelle version
            datée, soumise à une nouvelle acceptation lors de la connexion
            suivante.
          </p>
        </Section>
      </div>

      <footer className="mt-2xl border-t border-neutral-200 pt-lg text-center text-xs text-neutral-400">
        Tam Logistics SARL · Cotonou, Bénin ·
        contact@tamcar.app
      </footer>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-sm text-base font-bold text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}
