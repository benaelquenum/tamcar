import type { Metadata } from 'next';
import Link from 'next/link';
import { FilmPlayer } from '@/components/anim/FilmPlayer';
import { CTA_LABEL, FINAL_LINE, SEQS } from '@/components/anim/film-timeline';
import { PROPOSAL_MAILTO } from '@/lib/config';

// Aperçu de la « version B » de l'animation de la page Partenaires : pas référencée, pas dans le menu.
export const metadata: Metadata = {
  title: 'Votre véhicule. Notre organisation. (aperçu)',
  description: 'Aperçu d’une animation 3D de la page Partenaires : une mobilité de confiance.',
  robots: { index: false, follow: false },
};

export default function PartnersFilmPage() {
  return (
    <>
      <div className="bg-[#0B1A3A] px-lg py-sm text-center text-xs font-bold text-white sm:text-sm">
        Aperçu de travail : animation B (film de 42 s).{' '}
        <Link href="/partenaires" className="underline underline-offset-4 hover:text-cyan-300">
          Voir la page Partenaires et sa route actuelle
        </Link>
      </div>

      <section className="bg-white pb-3xl pt-3xl">
        <div className="mx-auto max-w-6xl px-lg">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">Partenaires véhicule</p>
          <h1 className="mt-sm max-w-3xl text-3xl font-extrabold leading-tight text-neutral-900 sm:text-5xl">
            Votre véhicule. Notre organisation.
            <span className="block text-primary-600">Une mobilité de confiance.</span>
          </h1>
          <p className="mt-lg max-w-2xl text-lg text-neutral-600">
            Vous apportez le véhicule, TamCar met en place un cadre d’exploitation organisé : chauffeurs sélectionnés, activité suivie, règles définies. Dites-nous ce que vous avez
            ou souhaitez acquérir : nous vous envoyons une proposition adaptée à votre cas.
          </p>
          <div className="mt-xl flex flex-wrap items-center gap-md">
            <a
              href={PROPOSAL_MAILTO}
              className="rounded-full bg-gradient-to-r from-primary-500 to-primary-700 px-xl py-md text-base font-bold text-white shadow-glow transition hover:brightness-110"
            >
              {CTA_LABEL}
            </a>
            <Link href="/connexion" className="rounded-full px-xl py-md text-base font-bold text-primary-700 ring-2 ring-primary-200 transition hover:bg-primary-50">
              Espace partenaire
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-neutral-100 pb-3xl pt-xl">
        <div className="mx-auto max-w-6xl px-lg">
          <FilmPlayer ctaHref={PROPOSAL_MAILTO} />
        </div>
      </section>

      {/* le contenu du film, lisible tout de suite : on n'a pas à attendre la fin de l'animation */}
      <section className="bg-white py-4xl">
        <div className="mx-auto max-w-6xl px-lg">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">En bref</p>
          <h2 className="mt-sm max-w-2xl text-3xl font-extrabold leading-tight text-neutral-900 sm:text-4xl">Ce que montre le film, en six idées.</h2>
          <ol className="mt-3xl grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
            {SEQS.map((s, i) => (
              <li key={s.label} className="rounded-2xl bg-neutral-100 p-xl ring-1 ring-neutral-200">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0B1A3A] text-sm font-extrabold text-white">{i + 1}</span>
                <h3 className="mt-md text-xl font-extrabold text-neutral-900">{i === 5 ? 'Votre véhicule. Notre organisation.' : s.title}</h3>
                <p className="mt-xs text-base leading-relaxed text-neutral-600">{i === 5 ? FINAL_LINE : s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-3xl flex flex-wrap items-center gap-md">
            <a
              href={PROPOSAL_MAILTO}
              className="rounded-full bg-[#0B1A3A] px-2xl py-md text-base font-extrabold text-white shadow-xl transition hover:bg-[#12306F]"
            >
              {CTA_LABEL}
            </a>
            <p className="text-sm text-neutral-500">Aucune promesse de gain : une proposition chiffrée, adaptée à votre véhicule, vous est envoyée sur demande.</p>
          </div>
        </div>
      </section>
    </>
  );
}
