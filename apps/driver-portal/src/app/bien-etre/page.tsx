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
 * et protection famille (sur option).
 *
 * Formulation validée (option A) : on ne prétend JAMAIS que TamCar finance
 * l'épargne retraite. On dit la vérité — 1 000 F/jour prélevés sur les gains —
 * en vendant l'indolore et le « c'est à toi », pas un faux « c'est gratuit ».
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
            On construit ton avenir avec toi.
          </h1>
          <p className="mt-sm text-sm text-primary-100/90">
            Tu ne conduis pas juste pour aujourd&apos;hui. Avec TamCar, chaque
            course te rapproche de <strong className="text-white">ta voiture</strong>,{' '}
            <strong className="text-white">ta santé</strong> et{' '}
            <strong className="text-white">ta retraite</strong>.
          </p>
        </section>

        {/* Ta voiture */}
        <Benefit
          emoji="🚗"
          title="Ta voiture"
          badge="Formule Cession"
          badgeTone="primary"
        >
          Au terme de ton contrat, le véhicule <strong>t&apos;appartient</strong>.
          Chaque course alimente ton fonds de rachat — tu bosses pour un bien qui
          devient le tien, pas celui d&apos;un patron.
        </Benefit>

        {/* Épargne retraite — le cœur */}
        <section className="mt-lg rounded-xl border-2 border-gold/40 bg-white p-lg shadow-sm">
          <div className="flex items-start justify-between gap-md">
            <h2 className="flex items-center gap-xs text-base font-extrabold text-neutral-900">
              <span aria-hidden>💰</span> Ton épargne retraite
            </h2>
            <span className="flex-none rounded-full bg-gold px-md py-xs text-[10px] font-bold text-neutral-900 shadow-glow-gold">
              Incluse
            </span>
          </div>

          <p className="mt-md text-sm text-neutral-700">
            <strong className="text-neutral-900">
              1 000 F par jour — le prix d&apos;un café
            </strong>{' '}
            — que tu ne sens même pas passer. Au bout de 2 ans :
          </p>

          <div className="mt-md rounded-xl bg-gold/10 p-lg text-center">
            <p
              className="text-4xl font-extrabold text-neutral-900"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              624 000 F
            </p>
            <p className="mt-xs text-xs font-bold uppercase tracking-wider text-neutral-500">
              à toi, + les intérêts
            </p>
          </div>

          <ul className="mt-md space-y-xs text-sm text-neutral-700">
            <li className="flex gap-sm">
              <span className="text-primary-500">•</span>
              <span>
                <strong>26 000 F/mois</strong> épargnés automatiquement, sans
                effort de ta part.
              </span>
            </li>
            <li className="flex gap-sm">
              <span className="text-primary-500">•</span>
              <span>
                Après 24 mois de cotisation, tu peux demander une{' '}
                <strong>avance</strong>.
              </span>
            </li>
            <li className="flex gap-sm">
              <span className="text-primary-500">•</span>
              <span>
                <strong>TamCar ouvre et gère le plan pour toi</strong> — tarif
                de groupe négocié, tu n&apos;as rien à faire.
              </span>
            </li>
          </ul>

          {/* Divulgation honnête du financement */}
          <div className="mt-md rounded-md bg-neutral-100 p-md text-[11px] leading-relaxed text-neutral-600">
            <strong className="text-neutral-800">En toute transparence :</strong>{' '}
            ces 1 000 F/jour sont prélevés sur tes gains et versés sur{' '}
            <strong>ton</strong> compte épargne. C&apos;est ton argent qui
            travaille pour ton futur toi. C&apos;est obligatoire parce
            qu&apos;on veut que <strong>tous</strong> nos chauffeurs sortent de
            2 ans avec un capital — pas les mains vides.
          </div>
        </section>

        {/* Santé */}
        <Benefit emoji="🏥" title="Ta santé" badge="Sur option" badgeTone="neutral">
          Jusqu&apos;à <strong>80 % de tes frais de santé remboursés</strong>,
          pour toi et ta famille. TamCar négocie un <strong>tarif de groupe</strong>{' '}
          que tu n&apos;obtiendrais jamais seul.
        </Benefit>

        {/* Protection famille */}
        <Benefit
          emoji="🛡️"
          title="Protection famille"
          badge="Sur option"
          badgeTone="neutral"
        >
          Pour <strong>1 000 F/mois</strong>, tes proches sont protégés en cas
          de coup dur. Une sécurité de plus pour ceux qui comptent sur toi.
        </Benefit>

        <p className="mt-xl text-center text-sm font-semibold text-neutral-700">
          Aucun autre service ne t&apos;offre ça.
          <br />
          <span className="text-neutral-500">
            Avec TamCar, tu bosses pour ton présent{' '}
            <strong className="text-primary-700">et</strong> ton avenir.
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
