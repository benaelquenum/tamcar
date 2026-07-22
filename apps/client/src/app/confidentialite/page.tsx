import { Logo } from '@/components/Logo';
import { TERMS_VERSION } from '@/lib/terms';

export const metadata = {
  title: 'Politique de confidentialité — TamCar',
};

export default function ConfidentialitePage() {
  return (
    <main className="mx-auto max-w-2xl px-lg py-xl">
      <header className="flex flex-col items-center gap-sm pb-lg">
        <Logo className="h-10 w-auto" />
        <h1 className="text-center text-2xl font-extrabold text-neutral-900">
          Politique de confidentialité
        </h1>
        <p className="text-xs text-neutral-500">
          Version {TERMS_VERSION} · Tam Logistics SARL (en cours de constitution) · Cotonou, Bénin
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
            <li><strong>Identité</strong> : nom, prénom, email, numéro de téléphone ;</li>
            <li><strong>Localisation</strong> : position pendant la commande et la course (nécessaire au matching et au suivi) ;</li>
            <li><strong>Courses</strong> : itinéraires, horaires, prix, notations ;</li>
            <li><strong>Transactions</strong> : mouvements du portefeuille TamCar Crédit, références de paiement Mobile Money (jamais vos codes secrets) ;</li>
            <li><strong>Techniques</strong> : type d’appareil, identifiants de session, journaux de connexion.</li>
          </ul>
        </Section>

        <Section title="3. Finalités">
          <p>
            Mise en relation client-chauffeur, calcul des prix, exécution et
            suivi des courses, sécurité des utilisateurs (bouton SOS,
            traçabilité), facturation, gestion du portefeuille, prévention de la
            fraude et des annulations abusives, support et arbitrage des
            litiges, obligations légales et comptables.
          </p>
        </Section>

        <Section title="4. Partage des données">
          <ul className="ml-lg list-disc space-y-xs">
            <li>Le Chauffeur voit le prénom, la note et le point de prise en charge du Client (et réciproquement) ;</li>
            <li>Prestataires techniques strictement nécessaires : hébergement (Supabase, Vercel), cartographie (Mapbox), paiement (FeexPay), SMS (Twilio) ;</li>
            <li>Autorités : uniquement sur réquisition légale.</li>
          </ul>
          <p className="mt-sm">
            <strong>TamCar ne vend ni ne loue jamais vos données personnelles.</strong>
          </p>
        </Section>

        <Section title="5. Durées de conservation">
          <p>
            Données de compte : durée de vie du compte + 12 mois. Données de
            courses et transactions : 5 ans (obligations comptables et
            fiscales). Journaux techniques : 12 mois. Localisation en temps
            réel : traitée pendant la course, agrégée ensuite.
          </p>
        </Section>

        <Section title="6. Sécurité">
          <p>
            Chiffrement des échanges (TLS), cloisonnement des accès en base de
            données (row-level security), authentification sécurisée. L’accès
            interne aux données est limité aux besoins du support et de
            l’exploitation.
          </p>
        </Section>

        <Section title="7. Vos droits">
          <p>
            Conformément au Code du numérique béninois, vous disposez de droits
            d’accès, de rectification, d’opposition, de suppression et de
            portabilité de vos données. Exercice : contact@tamcar.app (réponse
            sous 30 jours). Vous pouvez également saisir l’APDP.
          </p>
        </Section>

        <Section title="8. Modification de la présente politique">
          <p>
            Toute modification substantielle donne lieu à une nouvelle version
            datée, soumise à une nouvelle acceptation lors de la connexion
            suivante.
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
