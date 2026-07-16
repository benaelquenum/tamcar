import { Logo } from '@/components/Logo';

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <Header />
      <Hero />
      <Corridor />
      <Trust />
      <Cta />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-lg py-lg">
      <Logo className="h-10 w-auto" />
      <nav className="hidden gap-xl md:flex">
        <a className="text-neutral-600 hover:text-primary-500" href="#corridor">
          Corridor Cotonou ↔ Porto-Novo
        </a>
        <a className="text-neutral-600 hover:text-primary-500" href="#trust">
          Pourquoi TamCar
        </a>
        <a className="text-neutral-600 hover:text-primary-500" href="#contact">
          Contact
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-lg pb-4xl pt-2xl md:pt-3xl">
      <div className="grid gap-2xl md:grid-cols-2 md:items-center">
        <div>
          <span className="inline-block rounded-full bg-primary-100 px-md py-xs text-sm font-semibold text-primary-700">
            Nouveau au Bénin
          </span>
          <h1 className="mt-lg text-4xl font-extrabold leading-tight md:text-5xl">
            Roulez tranquille
            <br />
            <span className="text-primary-500">à Porto-Novo</span> et sur le
            corridor.
          </h1>
          <p className="mt-lg max-w-lg text-lg text-neutral-600">
            Réservez une course en quelques secondes, avec un prix fixe garanti
            à l'avance. Chauffeurs vérifiés, voitures récentes, paiement
            Mobile Money.
          </p>
          <div className="mt-xl flex flex-col gap-md sm:flex-row">
            <a
              href="#cta"
              className="inline-flex items-center justify-center rounded-md bg-primary-500 px-xl py-md text-base font-semibold text-white shadow-md transition hover:bg-primary-700"
            >
              Bientôt disponible
            </a>
            <a
              href="#corridor"
              className="inline-flex items-center justify-center rounded-md border-2 border-primary-300 px-xl py-md text-base font-semibold text-primary-700 transition hover:bg-primary-50"
            >
              Découvrir le corridor
            </a>
          </div>
        </div>
        <div className="relative">
          <div className="aspect-square rounded-xl bg-primary-50 p-xl">
            <div className="flex h-full w-full flex-col justify-between rounded-lg bg-white p-lg shadow-lg">
              <div>
                <p className="text-sm font-medium text-neutral-400">
                  De Cotonou vers
                </p>
                <p className="mt-xs text-2xl font-bold text-neutral-900">
                  Porto-Novo, Songhaï
                </p>
              </div>
              <div className="my-lg flex items-center gap-md">
                <span className="h-3 w-3 rounded-full bg-primary-500" />
                <span className="h-px flex-1 bg-neutral-200" />
                <span className="h-3 w-3 rounded-full border-2 border-primary-500 bg-white" />
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm text-neutral-400">Prix affiché</p>
                  <p
                    className="text-3xl font-bold text-primary-500"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    3 500 FCFA
                  </p>
                </div>
                <span className="rounded-full bg-accent-500/20 px-md py-xs text-sm font-semibold text-neutral-900">
                  30 min
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Corridor() {
  return (
    <section id="corridor" className="bg-primary-50 py-3xl">
      <div className="mx-auto max-w-6xl px-lg">
        <h2 className="text-3xl font-extrabold md:text-4xl">
          Corridor Cotonou ↔ Porto-Novo
        </h2>
        <p className="mt-md max-w-2xl text-lg text-neutral-600">
          30 kilomètres, deux fois par jour pour des milliers de Béninois.
          Réservez à l'avance pour éviter l'attente, avec un prix connu dès la
          commande.
        </p>
        <div className="mt-2xl grid gap-lg md:grid-cols-3">
          <FeatureCard
            title="Prix fixe garanti"
            body="Le prix affiché est celui que vous payez, quel que soit le trafic. Fini les mauvaises surprises."
          />
          <FeatureCard
            title="Réservation à l'avance"
            body="Bookez votre trajet la veille pour un départ à l'aube. Un chauffeur vous attend."
          />
          <FeatureCard
            title="Paiement flexible"
            body="Cash, MTN Mobile Money, Moov Money, ou depuis votre TamCar Crédit intégré."
          />
        </div>
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section id="trust" className="py-3xl">
      <div className="mx-auto max-w-6xl px-lg">
        <h2 className="text-3xl font-extrabold md:text-4xl">
          Pourquoi choisir TamCar
        </h2>
        <div className="mt-2xl grid gap-lg md:grid-cols-2">
          <TrustPoint
            title="Chauffeurs vérifiés"
            body="Chaque chauffeur passe une vérification d'identité, de permis et de casier. Notation transparente après chaque course."
          />
          <TrustPoint
            title="Voitures récentes"
            body="Notre flotte est fournie par des concessionnaires partenaires. Entretien professionnel, sécurité vérifiée."
          />
          <TrustPoint
            title="Local et à l'écoute"
            body="TamCar est béninoise. Nos concessionnaires partenaires sont actionnaires — on partage l'ambition d'un service qui dure."
          />
          <TrustPoint
            title="Appel gratuit dans l'app"
            body="Contactez votre chauffeur (ou votre client) sans partager votre numéro. Zéro coût pour vous."
          />
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section id="cta" className="bg-neutral-900 py-3xl text-neutral-100">
      <div className="mx-auto max-w-4xl px-lg text-center">
        <h2 className="text-3xl font-extrabold md:text-4xl">
          Lancement à Porto-Novo prochainement
        </h2>
        <p className="mt-md text-lg text-neutral-100/80">
          Laissez-nous votre contact — vous serez informé du lancement et
          bénéficierez d'une course offerte.
        </p>
        <form
          id="contact"
          className="mx-auto mt-2xl flex max-w-md flex-col gap-md sm:flex-row"
          action="#"
          method="post"
        >
          <input
            type="tel"
            required
            placeholder="Votre numéro (+229 …)"
            className="flex-1 rounded-md bg-neutral-100/10 px-lg py-md text-white placeholder:text-neutral-100/50 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            className="rounded-md bg-primary-500 px-xl py-md font-semibold text-white transition hover:bg-primary-700"
          >
            Me prévenir
          </button>
        </form>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-0 py-xl">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-md px-lg text-sm text-neutral-600 md:flex-row">
        <div className="flex items-center gap-md">
          <Logo className="h-8 w-auto" />
          <span>© 2026 TamCar SARL. Tous droits réservés.</span>
        </div>
        <div className="flex gap-lg">
          <a href="/mentions" className="hover:text-primary-500">
            Mentions légales
          </a>
          <a href="/confidentialite" className="hover:text-primary-500">
            Confidentialité
          </a>
          <a href="mailto:contact@tamcar.bj" className="hover:text-primary-500">
            contact@tamcar.bj
          </a>
        </div>
      </div>
    </footer>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg bg-white p-xl shadow-sm">
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="mt-md text-neutral-600">{body}</p>
    </div>
  );
}

function TrustPoint({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-md">
      <div className="mt-xs h-md w-md flex-none rounded-full bg-primary-500" />
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-xs text-neutral-600">{body}</p>
      </div>
    </div>
  );
}
