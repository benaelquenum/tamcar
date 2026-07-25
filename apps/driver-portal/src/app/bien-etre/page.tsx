import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export const metadata = {
  title: 'Bien-être chauffeur — TamCar',
};

/**
 * Section « Bien-être chauffeur ».
 * Présente le paquet d'avantages : véhicule (cession), épargne retraite
 * (obligatoire, auto-financée par le chauffeur — divulgation honnête), santé
 * et montée en compétence.
 *
 * Formulation validée (option A) : on ne prétend JAMAIS que TamCar finance
 * l'épargne retraite. On dit la vérité — 1 000 F/jour prélevés sur les gains —
 * en vendant l'indolore et le « c'est à vous », pas un faux « c'est gratuit ».
 * Vouvoiement partout.
 */
export default function BienEtrePage() {
  return (
    <main className="relative min-h-dvh bg-neutral-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-70 blur-3xl" />
        <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-gold/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center justify-between">
          <Link
            href="/dashboard"
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
          <div className="w-11" />
        </header>

        {/* Hero */}
        <section className="mt-lg rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 p-lg text-white shadow-glow">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-100">
            Bien-être chauffeur
          </p>
          <h1 className="mt-xs text-2xl font-extrabold leading-tight">
            On construit votre avenir avec vous.
          </h1>
          <p className="mt-sm text-sm text-primary-100/90">
            Vous ne conduisez pas juste pour aujourd&apos;hui. Avec TamCar,
            chaque course vous rapproche de{' '}
            <strong className="text-white">votre véhicule</strong>,{' '}
            <strong className="text-white">votre santé</strong> et{' '}
            <strong className="text-white">votre retraite</strong>.
          </p>
        </section>

        {/* Votre véhicule */}
        <Benefit
          emoji="🚗"
          title="Votre véhicule"
          badge="Formule Cession"
          badgeTone="primary"
        >
          Au terme de votre contrat, le véhicule{' '}
          <strong>vous appartient</strong> — moto, tricycle ou voiture. Chaque
          course alimente votre fonds de rachat : vous travaillez pour un bien
          qui devient le vôtre, pas celui d&apos;un patron.
        </Benefit>

        {/* Épargne retraite — le cœur */}
        <section className="mt-lg rounded-xl border-2 border-gold/40 bg-white p-lg shadow-sm">
          <div className="flex items-start justify-between gap-md">
            <h2 className="flex items-center gap-xs text-base font-extrabold text-neutral-900">
              <span aria-hidden>💰</span> Votre épargne retraite
            </h2>
            <span className="flex-none rounded-full bg-gold px-md py-xs text-[10px] font-bold text-neutral-900 shadow-glow-gold">
              Incluse
            </span>
          </div>

          <p className="mt-md text-sm text-neutral-700">
            <strong className="text-neutral-900">
              1 000 F par jour — le prix d&apos;un café
            </strong>{' '}
            — que vous ne sentez même pas passer. Au bout de 2 ans :
          </p>

          <div className="mt-md rounded-xl bg-gold/10 p-lg text-center">
            <p
              className="text-4xl font-extrabold text-neutral-900"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              600 000 F
            </p>
            <p className="mt-xs text-xs font-bold uppercase tracking-wider text-neutral-500">
              à vous, + les intérêts
            </p>
          </div>

          <ul className="mt-md space-y-xs text-sm text-neutral-700">
            <li className="flex gap-sm">
              <span className="text-primary-500">•</span>
              <span>
                Mis de côté <strong>automatiquement chaque jour</strong>, sans
                effort de votre part.
              </span>
            </li>
            <li className="flex gap-sm">
              <span className="text-primary-500">•</span>
              <span>
                Après 24 mois de cotisation, vous pouvez demander une{' '}
                <strong>avance</strong>.
              </span>
            </li>
            <li className="flex gap-sm">
              <span className="text-primary-500">•</span>
              <span>
                <strong>TamCar ouvre et gère le plan pour vous</strong> — tarif
                de groupe négocié, vous n&apos;avez rien à faire.
              </span>
            </li>
          </ul>

          {/* Divulgation honnête du financement — ton pro / marketing */}
          <div className="mt-md rounded-xl bg-gold/10 p-md">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-gold">
              Votre argent, votre avenir — au grand jour
            </p>
            <p className="mt-xs text-[12px] leading-relaxed text-neutral-700">
              Ces 1 000 F/jour ne sont pas une charge : c&apos;est{' '}
              <strong>votre</strong> capital qui se construit tout seul pendant
              que vous roulez. TamCar négocie le plan de groupe et gère tout —
              vous n&apos;avancez rien, aucun papier à remplir. Résultat : au
              terme de votre contrat, vous repartez avec un pécule que{' '}
              <strong>9 chauffeurs sur 10 ne réussiront jamais à mettre de côté
              seuls</strong>. La discipline en plus, sans l&apos;effort.
            </p>
          </div>
        </section>

        {/* Santé */}
        <Benefit
          emoji="🏥"
          title="Votre santé"
          badge="Sur option"
          badgeTone="neutral"
        >
          Jusqu&apos;à <strong>80 % de vos frais de santé remboursés</strong>,
          vous et votre famille. TamCar négocie un{' '}
          <strong>tarif de groupe</strong> que vous n&apos;obtiendriez jamais
          seul.
        </Benefit>

        {/* Montée en compétence */}
        <Benefit
          emoji="🎓"
          title="Votre montée en compétence"
          badge="Incluse"
          badgeTone="primary"
        >
          Formation à la qualité de service, à la sécurité et à la relation
          client — pour <strong>gagner plus et mieux</strong>, course après
          course.
        </Benefit>

        <p className="mt-xl text-center text-sm font-semibold text-neutral-700">
          Aucun autre service ne vous offre ça.
          <br />
          <span className="text-neutral-500">
            Avec TamCar, vous travaillez pour votre présent{' '}
            <strong className="text-primary-700">et</strong> votre avenir.
          </span>
        </p>

        <div className="h-2xl" />
      </div>
    </main>
  );
}

function Benefit({
  emoji,
  title,
  badge,
  badgeTone,
  children,
}: {
  emoji: string;
  title: string;
  badge: string;
  badgeTone: 'primary' | 'neutral';
  children: ReactNode;
}) {
  return (
    <section className="mt-lg rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
      <div className="flex items-start justify-between gap-md">
        <h2 className="flex items-center gap-xs text-base font-extrabold text-neutral-900">
          <span aria-hidden>{emoji}</span> {title}
        </h2>
        <span
          className={`flex-none rounded-full px-md py-xs text-[10px] font-bold ${
            badgeTone === 'primary'
              ? 'bg-primary-50 text-primary-700'
              : 'bg-neutral-100 text-neutral-500'
          }`}
        >
          {badge}
        </span>
      </div>
      <p className="mt-sm text-sm text-neutral-700">{children}</p>
    </section>
  );
}
