import type { Metadata } from 'next';
import { DocsTabs } from '@/components/DocsTabs';
import { Reveal } from '@/components/anim/Reveal';
import { TrafficLight } from '@/components/anim/TrafficLight';
import { CLIENT_APP_URL, DRIVER_APP_URL } from '@/lib/config';
import { FORMULAS, type Formula } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Chauffeurs',
  description: 'Devenez chauffeur TamCar : deux formules, un véhicule fourni ou le vôtre, des pièces simples à apporter au rendez-vous.',
};

const ORDER: Formula[] = ['cession', 'proprietaire'];

export default function DriversPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-white pb-3xl pt-4xl">
        <div className="mx-auto grid max-w-6xl items-center gap-2xl px-lg lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">Chauffeurs</p>
            <h1 className="mt-sm text-4xl font-extrabold leading-tight text-neutral-900 sm:text-5xl">Prenez le volant. Deux formules, vous décidez.</h1>
            <p className="mt-lg max-w-xl text-lg text-neutral-600">
              Roulez avec un véhicule fourni par un partenaire et devenez-en propriétaire au terme du contrat, ou venez avec le vôtre.
              Le rendez-vous se prend dans l’application TamCar.
            </p>
            <div className="mt-xl flex flex-wrap gap-md">
              <a href={`${CLIENT_APP_URL}/devenir-chauffeur`} className="rounded-full bg-gradient-to-r from-primary-500 to-primary-700 px-xl py-md text-base font-bold text-white shadow-glow transition hover:brightness-110">
                Prendre rendez-vous
              </a>
              <a href={DRIVER_APP_URL} className="rounded-full px-xl py-md text-base font-bold text-primary-700 ring-2 ring-primary-200 transition hover:bg-primary-50">
                Déjà chauffeur : TamCar Pro
              </a>
            </div>
          </div>
          <div className="mx-auto hidden w-32 lg:block">
            <TrafficLight loop className="h-auto w-full drop-shadow-xl" />
          </div>
        </div>
      </section>

      <section className="bg-neutral-100 py-4xl">
        <div className="mx-auto grid max-w-6xl gap-xl px-lg md:grid-cols-2">
          {ORDER.map((id, i) => {
            const f = FORMULAS[id];
            return (
              <Reveal key={id} delay={i * 120}>
                <article className="h-full rounded-2xl bg-white p-xl shadow-md ring-1 ring-neutral-200">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary-600">{id === 'cession' ? 'Formule A' : 'Formule B'}</p>
                  <h2 className="mt-xs text-2xl font-extrabold text-neutral-900">{f.label}</h2>
                  <p className="mt-sm text-base text-neutral-600">{f.tagline}</p>
                  <ul className="mt-lg space-y-sm">
                    {f.perks.map((p) => (
                      <li key={p} className="flex items-start gap-sm text-base text-neutral-900">
                        <span className="mt-1.5 inline-block h-2 w-2 flex-none rounded-full bg-primary-500" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section className="py-4xl">
        <div className="mx-auto max-w-3xl px-lg">
          <h2 className="text-3xl font-extrabold leading-tight text-neutral-900 sm:text-4xl">Les pièces à apporter au rendez-vous.</h2>
          <p className="mt-md text-base text-neutral-600">Choisissez votre formule : la liste s’adapte.</p>
          <div className="mt-xl">
            <DocsTabs />
          </div>
        </div>
      </section>
    </>
  );
}
