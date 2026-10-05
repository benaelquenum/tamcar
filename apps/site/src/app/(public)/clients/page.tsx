import type { Metadata } from 'next';
import { Gauge } from '@/components/anim/Gauge';
import { Reveal } from '@/components/anim/Reveal';
import { Road } from '@/components/anim/Road';
import { CLIENT_APP_URL } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Clients',
  description: 'Commandez une course à Cotonou, Porto-Novo ou sur le corridor : prix annoncé avant de partir, chauffeur vérifié, suivi en direct.',
};

const FEATURES = [
  { t: 'Le prix avant de partir', d: 'Vous voyez le prix de la course avant de commander, et il ne bouge pas : jamais de surge pricing.' },
  { t: 'Un chauffeur que vous reconnaissez', d: 'Sa photo officielle est prise et contrôlée par TamCar : le badge « photo vérifiée » s’affiche sur sa carte.' },
  { t: 'Le suivi en direct', d: 'Voyez le chauffeur arriver, suivez votre trajet, et partagez le lien avec un proche.' },
  { t: 'La nuit, un proche prévenu', d: 'À partir de 21 h, l’application vous propose de prévenir un proche en un geste. Vous acceptez ou vous refusez.' },
  { t: 'Un bouton SOS', d: 'En cas de problème pendant la course, une alerte part immédiatement vers l’équipe TamCar.' },
  { t: 'Réserver à l’avance', d: 'Programmez votre course, ajoutez des arrêts, voyagez avec ou sans bagages.' },
  { t: 'Payer comme vous voulez', d: 'Espèces, crédit TamCar ou Mobile Money.' },
  { t: 'Le corridor Cotonou ↔ Porto-Novo', d: 'Un prix fixe pour la route entre les deux villes.' },
];

export default function ClientsPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-white pb-4xl pt-4xl">
        <div className="mx-auto grid max-w-6xl items-center gap-2xl px-lg lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600">Clients</p>
            <h1 className="mt-sm text-4xl font-extrabold leading-tight text-neutral-900 sm:text-5xl">Une course claire, de bout en bout.</h1>
            <p className="mt-lg max-w-xl text-lg text-neutral-600">
              Commandez à Cotonou, Porto-Novo ou sur le corridor. Le prix est annoncé avant le départ, le chauffeur est vérifié, et vos proches peuvent
              suivre votre trajet.
            </p>
            <a href={CLIENT_APP_URL} className="mt-xl inline-block rounded-full bg-gradient-to-r from-primary-500 to-primary-700 px-2xl py-md text-base font-bold text-white shadow-glow transition hover:brightness-110">
              Ouvrir l’application TamCar
            </a>
          </div>
          <div className="mx-auto w-56">
            <Gauge live value={1} valueText="Fixe" label="PRIX DE LA COURSE" sub="annoncé avant de partir" className="w-full drop-shadow-2xl" />
          </div>
        </div>
      </section>

      <section className="bg-neutral-100 py-4xl">
        <div className="mx-auto max-w-6xl px-lg">
          <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.t} delay={(i % 4) * 90}>
                <div className="h-full rounded-2xl bg-white p-xl shadow-sm ring-1 ring-neutral-200">
                  <h2 className="text-lg font-extrabold text-neutral-900">{f.t}</h2>
                  <p className="mt-sm text-base leading-relaxed text-neutral-600">{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Road className="-mb-1" height={150} speed={1.3} />
    </>
  );
}
