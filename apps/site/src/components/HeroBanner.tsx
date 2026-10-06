'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { CLIENT_APP_URL } from '@/lib/config';
import { usePrefersReducedMotion } from '@/components/anim/hooks';

type Cta = { label: string; href: string };

type Slide = {
  tag: string;
  title: string;
  accent: string;
  text: string;
  primary: Cta;
  secondary: Cta;
  photo: { src: string; alt: string; kind: 'photo' | 'cutout'; position: string };
};

// Ordre de la bannière : Clients, Chauffeurs, Partenaires, Corridor.
const SLIDES: Slide[] = [
  {
    tag: 'Clients · TamPass',
    title: 'TamPass : plus de trajets,',
    accent: 'plus d’avantages.',
    text: 'Réservez vos trajets réguliers une fois pour toute la semaine : plus vous roulez, plus vous profitez. Et toujours le prix annoncé avant de partir, un chauffeur à la photo vérifiée et le suivi en direct.',
    primary: { label: 'Découvrir TamPass', href: '/clients#tampass' },
    secondary: { label: 'Ouvrir l’application', href: CLIENT_APP_URL },
    photo: { src: '/img/tampass-cliente.webp', alt: 'Une cliente souriante à la vitre d’un véhicule TamCar, sa carte TamPass à la main', kind: 'photo', position: '60% 40%' },
  },
  {
    tag: 'Chauffeurs',
    title: 'Prenez le volant.',
    accent: 'Devenez propriétaire.',
    text: 'Roulez avec un véhicule fourni par un partenaire et devenez-en propriétaire au terme du contrat, ou venez avec le vôtre.',
    primary: { label: 'Voir les formules', href: '/chauffeurs' },
    secondary: { label: 'Prendre rendez-vous', href: `${CLIENT_APP_URL}/devenir-chauffeur` },
    photo: { src: '/img/chauffeur.webp', alt: 'Un chauffeur TamCar souriant, casque et gilet aux couleurs de la marque', kind: 'photo', position: '50% 14%' },
  },
  {
    tag: 'Partenaires véhicule',
    title: 'Votre véhicule roule.',
    accent: 'Vous encaissez.',
    text: 'Confiez votre voiture, votre moto ou votre tricycle à TamCar. Un chauffeur vérifié le fait rouler, et vous suivez vos gains en direct.',
    primary: { label: 'Devenir partenaire', href: '/partenaires' },
    secondary: { label: 'Espace partenaire', href: '/connexion' },
    photo: { src: '/img/voiture.webp', alt: 'Une berline aux couleurs de TamCar', kind: 'cutout', position: 'center' },
  },
  {
    tag: 'Cotonou · Porto-Novo · corridor',
    title: 'Cotonou ↔ Porto-Novo',
    accent: 'à prix fixe.',
    text: 'Un prix fixe pour la route entre les deux villes, annoncé avant le départ.',
    primary: { label: 'Commander une course', href: CLIENT_APP_URL },
    secondary: { label: 'Ce que nous offrons', href: '/clients' },
    photo: { src: '/img/tricycle.webp', alt: 'Un tricycle TamCar devant la ville', kind: 'photo', position: '50% 42%' },
  },
];

/** Durée d'affichage d'une diapositive (s). La barre de progression et l'enchaînement partagent cette durée. */
const SLIDE_SECONDS = 7;

function CtaLink({ cta, className }: { cta: Cta; className: string }) {
  const external = /^https?:\/\//.test(cta.href);
  return external ? (
    <a href={cta.href} className={className}>
      {cta.label}
    </a>
  ) : (
    <Link href={cta.href} className={className}>
      {cta.label}
    </Link>
  );
}

/**
 * Bannière d'accueil : une photo grand format par diapositive, un texte qui change, enchaînement en fondu.
 * Le passage à la suivante est déclenché par la fin de la barre de progression (même durée, mise en pause
 * au survol ou au clavier). Avec « réduire les animations », rien ne défile : on navigue avec les repères.
 */
export function HeroBanner({ initialIndex = 0 }: { initialIndex?: number }) {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(initialIndex);
  const [paused, setPaused] = useState(false);
  const n = SLIDES.length;
  const go = (i: number) => setActive(((i % n) + n) % n);

  return (
    <section
      aria-roledescription="carrousel"
      aria-label="TamCar en bref"
      className="relative isolate h-[640px] overflow-hidden bg-primary-900 text-white sm:h-[660px] lg:h-[700px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary-900 via-primary-700 to-primary-500" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-[520px] w-[520px] rounded-full bg-white/10 blur-3xl" />

      {SLIDES.map((s, i) => {
        const on = i === active;
        const Heading = i === 0 ? 'h1' : 'h2';
        return (
          <div
            key={s.tag}
            role="group"
            aria-roledescription="diapositive"
            aria-label={`${i + 1} sur ${n}`}
            aria-hidden={!on}
            className={`tc-hero-slide absolute inset-0 transition-[opacity,visibility] duration-[1100ms] ease-in-out ${on ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'}`}
          >
            {/* Photo : plein cadre sur téléphone, à droite et fondue dans le bleu sur grand écran */}
            {s.photo.kind === 'photo' ? (
              <div className="tc-hero-mask absolute inset-0 lg:left-auto lg:w-[62%]">
                <Image
                  src={s.photo.src}
                  alt={s.photo.alt}
                  fill
                  priority={i === 0}
                  sizes="(min-width: 1024px) 62vw, 100vw"
                  className="object-cover"
                  style={{ objectPosition: s.photo.position }}
                />
              </div>
            ) : (
              <div className="absolute inset-x-0 top-8 h-[44%] px-md lg:inset-y-0 lg:left-auto lg:top-0 lg:h-auto lg:w-[52%] lg:px-0 lg:pb-16 lg:pl-0 lg:pr-12 lg:pt-10">
                <div className="relative h-full w-full">
                  <Image
                    src={s.photo.src}
                    alt={s.photo.alt}
                    fill
                    priority={i === 0}
                    sizes="(min-width: 1024px) 62vw, 100vw"
                    className="object-contain drop-shadow-[0_30px_40px_rgba(2,6,23,0.45)]"
                  />
                </div>
              </div>
            )}
            {/* Voile de lisibilité sur téléphone (le texte est en bas) */}
            <div className="absolute inset-0 bg-gradient-to-t from-primary-900 via-primary-900/70 to-transparent lg:hidden" />

            <div className="relative z-10 mx-auto flex h-full max-w-6xl items-end px-lg pb-24 lg:items-center lg:pb-0">
              <div className="max-w-xl lg:max-w-[32rem]">
                <p className="inline-flex rounded-full bg-white/15 px-md py-xs text-xs font-bold uppercase tracking-wider text-white ring-1 ring-white/25 backdrop-blur">
                  {s.tag}
                </p>
                <Heading className="mt-lg text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                  {s.title} <span className="text-[#8BE3FF]">{s.accent}</span>
                </Heading>
                <p className="mt-lg text-base leading-relaxed text-primary-50 sm:text-lg">{s.text}</p>
                <div className="mt-xl flex flex-wrap items-center gap-md">
                  <CtaLink
                    cta={s.primary}
                    className="rounded-full bg-white px-xl py-md text-base font-extrabold text-primary-700 shadow-xl transition hover:scale-[1.03]"
                  />
                  <CtaLink
                    cta={s.secondary}
                    className="rounded-full px-xl py-md text-base font-bold text-white ring-2 ring-white/45 transition hover:bg-white/10"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Repères : la barre active se remplit, et sa fin déclenche la diapositive suivante */}
      <div className="absolute inset-x-0 bottom-6 z-20 mx-auto flex max-w-6xl items-center justify-between gap-md px-lg">
        <div className="flex items-center gap-sm" role="group" aria-label="Choisir une diapositive">
          {SLIDES.map((s, i) => (
            <button
              key={s.tag}
              type="button"
              onClick={() => go(i)}
              aria-label={`Diapositive ${i + 1} : ${s.tag}`}
              aria-current={i === active}
              className="group flex h-6 w-12 items-center"
            >
              <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-white/30 transition group-hover:bg-white/50">
                {i === active && (
                  <span
                    key={active}
                    className="tc-hero-fill absolute inset-0 rounded-full bg-white"
                    style={{ ['--tc-hero-dur' as string]: `${SLIDE_SECONDS}s`, animationPlayState: paused ? 'paused' : 'running' } as React.CSSProperties}
                    onAnimationEnd={() => !reduced && go(active + 1)}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-xs">
          <button
            type="button"
            onClick={() => go(active - 1)}
            aria-label="Diapositive précédente"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 transition hover:bg-white/25"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12.5 4.5 7 10l5.5 5.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => go(active + 1)}
            aria-label="Diapositive suivante"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 transition hover:bg-white/25"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7.5 4.5 13 10l-5.5 5.5" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
