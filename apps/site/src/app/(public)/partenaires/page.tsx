import type { Metadata } from 'next';
import Link from 'next/link';
import { Simulator } from '@/components/Simulator';
import { Reveal } from '@/components/anim/Reveal';
import { Road } from '@/components/anim/Road';
import { Wheel } from '@/components/anim/Wheel';
import { CONTACT_EMAIL } from '@/lib/config';
import { PARTNER_FAQ, VEHICLE_PROFILES } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Partenaires véhicule',
  description: 'Confiez votre voiture, moto ou tricycle à TamCar : une part de chaque course chaque mois, le rachat à la cession, un espace pour suivre vos gains en direct.',
};

const GUARANTEES = [
  { t: 'Vous restez propriétaire', d: 'Réserve de propriété : le véhicule n’est cédé au chauffeur qu’au terme du contrat.' },
  { t: 'Un chauffeur qui performe', d: 'Recettes minimales prévues au contrat ; sinon TamCar remplace le chauffeur ou vous rend le véhicule.' },
  { t: 'Un chauffeur vérifié', d: 'Pièces contrôlées en personne, photo officielle prise et contrôlée par TamCar, badge « photo vérifiée » côté clients.' },
  { t: 'Des gains en direct', d: 'Votre part s’affiche à chaque course terminée, véhicule par véhicule, dans votre espace partenaire.' },
];

export default function PartnersPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-white pb-3xl pt-4xl">
        <Wheel className="pointer-events-none absolute -right-24 top-6 hidden w-[380px] opacity-90 lg:block" spinSeconds={12} scrollFactor={0.2} />
        <div className="relative mx-auto max-w-6xl px-lg">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">Partenaires véhicule</p>
          <h1 className="mt-sm max-w-2xl text-4xl font-extrabold leading-tight text-neutral-900 sm:text-5xl">
            Combien votre véhicule peut-il vous rapporter ?
          </h1>
          <p className="mt-lg max-w-xl text-lg text-neutral-600">
            Simulez-le : choisissez votre véhicule, enfoncez l’accélérateur pour voir l’effet du rythme du chauffeur, et ajoutez
            votre coût de revient pour connaître votre rendement.
          </p>
        </div>
      </section>

      <section className="bg-neutral-100 pb-4xl pt-xl" id="simulateur">
        <div className="mx-auto max-w-6xl px-lg">
          <Simulator />
        </div>
      </section>

      <section className="py-4xl">
        <div className="mx-auto max-w-6xl px-lg">
          <h2 className="max-w-2xl text-3xl font-extrabold leading-tight text-neutral-900 sm:text-4xl">Ce que vous avez, noir sur blanc.</h2>
          <div className="mt-3xl grid gap-lg sm:grid-cols-2">
            {GUARANTEES.map((g, i) => (
              <Reveal key={g.t} delay={i * 90}>
                <div className="h-full rounded-2xl border border-neutral-200 bg-white p-xl shadow-sm">
                  <h3 className="text-lg font-extrabold text-neutral-900">{g.t}</h3>
                  <p className="mt-sm text-base leading-relaxed text-neutral-600">{g.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-neutral-900 py-4xl text-white">
        <div className="mx-auto max-w-6xl px-lg">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-500">Les véhicules recherchés</p>
          <h2 className="mt-sm max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">Cinq profils, une durée de contrat pour chacun.</h2>
          <div className="mt-3xl overflow-hidden rounded-2xl ring-1 ring-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-lg py-md">Véhicule</th>
                  <th className="px-lg py-md">Contrat</th>
                  <th className="hidden px-lg py-md sm:table-cell">Profil attendu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {VEHICLE_PROFILES.map((v) => (
                  <tr key={v.cat}>
                    <td className="px-lg py-md font-bold text-white">{v.cat}</td>
                    <td className="px-lg py-md font-bold text-cyan-500">{v.duration}</td>
                    <td className="hidden px-lg py-md text-neutral-300 sm:table-cell">{v.profile}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-md text-sm text-neutral-400">
            Pour toutes les voitures : essence (ni diesel à filtre à particules, ni hybride rechargeable, ni électrique), boîte classique, papiers en règle, inspection d’entrée par TamCar.
          </p>
        </div>
      </section>

      <section className="py-4xl">
        <div className="mx-auto max-w-3xl px-lg">
          <h2 className="text-3xl font-extrabold leading-tight text-neutral-900 sm:text-4xl">Vos questions.</h2>
          <div className="mt-2xl divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
            {PARTNER_FAQ.map((f) => (
              <details key={f.q} className="group p-lg">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-md text-base font-bold text-neutral-900">
                  {f.q}
                  <span className="text-xl text-primary-500 transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-md text-base leading-relaxed text-neutral-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-700 to-primary-500 py-4xl text-center text-white">
        <div className="relative z-10 mx-auto max-w-3xl px-lg">
          <h2 className="text-3xl font-extrabold sm:text-4xl">On en parle ?</h2>
          <p className="mx-auto mt-md max-w-xl text-lg text-primary-100">
            Dites-nous quel véhicule vous avez ou souhaitez acquérir ; nous vous répondons avec les chiffres de votre cas.
          </p>
          <div className="mt-xl flex flex-wrap items-center justify-center gap-md">
            <a href={`mailto:${CONTACT_EMAIL}?subject=Partenaire%20v%C3%A9hicule%20TamCar`} className="rounded-full bg-white px-2xl py-md text-base font-extrabold text-primary-700 shadow-xl transition hover:scale-105">
              Nous écrire
            </a>
            <Link href="/connexion" className="rounded-full px-2xl py-md text-base font-bold text-white ring-2 ring-white/50 transition hover:bg-white/10">
              Espace partenaire
            </Link>
          </div>
        </div>
        <Road bare className="absolute inset-x-0 bottom-0 opacity-40" height={100} speed={0.9} />
      </section>
    </>
  );
}
