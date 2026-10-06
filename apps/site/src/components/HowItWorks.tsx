'use client';

import { useEffect, useRef, useState } from 'react';
import { TrafficLight } from '@/components/anim/TrafficLight';
import { TireTracks } from '@/components/anim/TireTracks';

const STEPS = [
  {
    color: 'text-error',
    ring: 'ring-error/30',
    tag: 'Rouge · on s’arrête et on prépare',
    title: 'Vous apportez votre véhicule',
    body: 'Voiture, moto ou tricycle. Vous versez une avance de démarrage remboursable, qui couvre l’inspection, l’habillage et les formalités. Elle vous est rendue.',
  },
  {
    color: 'text-warning',
    ring: 'ring-warning/30',
    tag: 'Orange · TamCar équipe',
    title: 'TamCar prépare le départ',
    body: 'Inspection d’entrée, habillage aux couleurs de TamCar, affectation d’un chauffeur vérifié : pièces contrôlées en personne, photo officielle prise et contrôlée par TamCar.',
  },
  {
    color: 'text-success',
    ring: 'ring-success/30',
    tag: 'Vert · c’est parti',
    title: 'Vous encaissez, chaque mois',
    body: 'Une part de chaque course en cash, plus une part du fonds de rachat versée à la cession. Vous restez propriétaire légal du véhicule jusqu’au terme, et vous suivez vos gains en direct.',
  },
];

/**
 * « Trois feux, trois gestes » : le feu tricolore, collé à l'écran, passe du rouge au vert à mesure
 * qu'on descend dans les trois étapes ; des traces de pneus se dessinent derrière.
 */
export function HowItWorks() {
  const refs = [useRef<HTMLLIElement>(null), useRef<HTMLLIElement>(null), useRef<HTMLLIElement>(null)];
  const [active, setActive] = useState(0);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = refs.findIndex((r) => r.current === e.target);
            if (i >= 0) setActive(i);
          }
        });
      },
      { rootMargin: '-40% 0px -45% 0px', threshold: 0 },
    );
    refs.forEach((r) => r.current && io.observe(r.current));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="relative overflow-hidden bg-neutral-100 py-4xl" id="comment-ca-marche">
      <TireTracks className="pointer-events-none absolute inset-y-0 left-0 hidden w-48 lg:block" />
      <div className="mx-auto max-w-6xl px-lg">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">Comment ça marche</p>
        <h2 className="mt-sm max-w-2xl text-3xl font-extrabold leading-tight text-neutral-900 sm:text-4xl">
          Trois feux, trois gestes.
        </h2>

        <div className="mt-3xl grid gap-3xl lg:grid-cols-[220px_1fr]">
          <div className="hidden lg:block">
            <div className="sticky top-32">
              <TrafficLight active={active} className="mx-auto h-72 w-auto drop-shadow-xl" />
            </div>
          </div>

          <ol className="space-y-xl">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                ref={refs[i]}
                className={`rounded-2xl bg-white p-xl shadow-md ring-2 transition ${active === i ? s.ring : 'ring-transparent'} ${
                  active === i ? 'opacity-100' : 'opacity-60'
                }`}
              >
                <div className="flex items-center gap-md">
                  <div className="lg:hidden">
                    <TrafficLight active={i} className="h-16 w-auto" />
                  </div>
                  <p className={`text-xs font-bold uppercase tracking-wider ${s.color}`}>{s.tag}</p>
                </div>
                <h3 className="mt-sm text-xl font-extrabold text-neutral-900">{s.title}</h3>
                <p className="mt-sm text-base leading-relaxed text-neutral-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
