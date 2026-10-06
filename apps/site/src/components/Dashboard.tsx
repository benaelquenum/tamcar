'use client';

import { Gauge } from '@/components/anim/Gauge';
import { Reveal } from '@/components/anim/Reveal';

// Les aiguilles sont décoratives : aucune valeur ne correspond à une part réelle.
const ITEMS = [
  {
    value: 0.58,
    valueText: 'Chaque mois',
    label: 'VOTRE PART EN CASH',
    sub: 'versée sur chaque course',
  },
  {
    value: 0.8,
    valueText: 'À la cession',
    label: 'LE FONDS DE RACHAT',
    sub: 'quand le chauffeur devient propriétaire',
  },
  {
    value: 1,
    valueText: 'Direct',
    label: 'VOS GAINS EN TEMPS RÉEL',
    sub: 'à chaque course terminée',
  },
];

/** Le tableau de bord : trois compteurs dont les aiguilles montent quand ils entrent à l'écran. */
export function Dashboard() {
  return (
    <section className="bg-neutral-900 py-4xl text-white">
      <div className="mx-auto max-w-6xl px-lg">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-500">Le tableau de bord</p>
        <h2 className="mt-sm max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">
          Ce que votre véhicule vous rapporte, lisible comme un compteur.
        </h2>
        <p className="mt-md max-w-2xl text-base text-neutral-400">
          Une part de chaque course, des gains qui se mettent à jour d’eux-mêmes, et un espace où chaque
          véhicule a sa jauge.
        </p>

        <div className="mt-3xl grid gap-xl sm:grid-cols-3">
          {ITEMS.map((it, i) => (
            <Reveal key={it.label} delay={i * 120}>
              <Gauge value={it.value} valueText={it.valueText} label={it.label} sub={it.sub} className="mx-auto w-full max-w-[280px] drop-shadow-2xl" />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
