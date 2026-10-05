import Link from 'next/link';
import { Road } from '@/components/anim/Road';
import { Exhaust } from '@/components/anim/Exhaust';
import { Reveal } from '@/components/anim/Reveal';
import { HeroBanner } from '@/components/HeroBanner';
import { HowItWorks } from '@/components/HowItWorks';
import { Dashboard } from '@/components/Dashboard';
import { CLIENT_APP_URL } from '@/lib/config';

const MARQUEE = [
  'Prix fixe garanti',
  'Jamais de surge pricing',
  'Photo du chauffeur vérifiée par TamCar',
  'Partage du trajet en direct',
  'Bouton SOS',
  'Réservation à l’avance',
  'Corridor Cotonou ↔ Porto-Novo',
];

export default function HomePage() {
  return (
    <>
      <HeroBanner />

      {/* ----------------------------------------------- Bandeau « pneu » */}
      <section className="overflow-hidden bg-neutral-900 py-md" aria-label="Nos engagements">
        <div className="tc-marquee flex w-max gap-3xl whitespace-nowrap">
          {[...MARQUEE, ...MARQUEE].map((t, i) => (
            <span key={i} className="flex items-center gap-3xl text-sm font-bold uppercase tracking-widest text-neutral-300">
              {t}
              <span className="inline-block h-2 w-2 rounded-full bg-gold" />
            </span>
          ))}
        </div>
      </section>

      <HowItWorks />
      <Dashboard />

      {/* ----------------------------------------------- Trois profils */}
      <section className="py-4xl">
        <div className="mx-auto max-w-6xl px-lg">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">Une plateforme, trois profils</p>
          <h2 className="mt-sm max-w-2xl text-3xl font-extrabold leading-tight text-neutral-900 sm:text-4xl">
            Chacun a son application, ce site a son espace.
          </h2>
          <div className="mt-3xl grid gap-xl md:grid-cols-3">
            {[
              {
                tag: 'Clients',
                title: 'Une course claire',
                text: 'Le prix avant de partir, le chauffeur et sa photo vérifiée, le suivi en direct, et le partage du trajet avec un proche, surtout la nuit.',
                href: '/clients',
                cta: 'Découvrir',
                accent: 'from-primary-500 to-cyan-500',
              },
              {
                tag: 'Chauffeurs',
                title: 'Un véhicule à vous',
                text: 'Roulez avec un véhicule fourni par un partenaire et devenez-en propriétaire au terme du contrat, ou venez avec le vôtre.',
                href: '/chauffeurs',
                cta: 'Voir les formules',
                accent: 'from-violet-500 to-primary-500',
              },
              {
                tag: 'Partenaires',
                title: 'Un revenu régulier',
                text: 'Une part de chaque course chaque mois, le rachat à la cession, et un espace pour suivre chaque véhicule en direct.',
                href: '/partenaires',
                cta: 'Simuler mes gains',
                accent: 'from-gold to-warning',
              },
            ].map((c, i) => (
              <Reveal key={c.tag} delay={i * 110}>
                <article className="group flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-xl shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <span className={`inline-block h-1.5 w-14 rounded-full bg-gradient-to-r ${c.accent}`} />
                  <p className="mt-lg text-xs font-bold uppercase tracking-wider text-neutral-500">{c.tag}</p>
                  <h3 className="mt-xs text-2xl font-extrabold text-neutral-900">{c.title}</h3>
                  <p className="mt-md flex-1 text-base leading-relaxed text-neutral-600">{c.text}</p>
                  <Link href={c.href} className="mt-lg inline-flex items-center gap-xs text-sm font-bold text-primary-600 group-hover:text-primary-700">
                    {c.cta} <span aria-hidden>→</span>
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------- Mettez les gaz */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-700 to-primary-500 py-4xl text-white">
        <div className="mx-auto max-w-4xl px-lg text-center">
          <h2 className="text-4xl font-extrabold leading-tight sm:text-5xl">Mettez les gaz.</h2>
          <p className="mx-auto mt-md max-w-xl text-lg text-primary-100">
            Parlons de votre véhicule : combien il peut rapporter, quel contrat, quelle durée.
          </p>
          <div className="relative mx-auto mt-xl inline-block">
            <Exhaust className="-left-6 top-1/2" color="#BFDBFE" />
            <Link
              href="/partenaires"
              className="relative inline-block rounded-full bg-white px-2xl py-md text-base font-extrabold text-primary-700 shadow-xl transition hover:scale-105"
            >
              Devenir partenaire
            </Link>
          </div>
          <p className="mt-lg text-sm text-primary-100">
            Vous voulez seulement commander une course ?{' '}
            <a href={CLIENT_APP_URL} className="font-bold underline underline-offset-4">
              Ouvrez l’application TamCar
            </a>
            .
          </p>
        </div>
        <Road bare className="absolute inset-x-0 bottom-0 translate-y-[60px] opacity-40" height={110} speed={0.8} />
      </section>
    </>
  );
}
