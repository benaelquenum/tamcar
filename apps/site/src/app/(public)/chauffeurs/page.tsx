import type { Metadata } from 'next';
import { DocsTabs } from '@/components/DocsTabs';
import { Reveal } from '@/components/anim/Reveal';
import { DriverHeroScene } from '@/components/anim/DriverHeroScene';
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
      {/* Le bleu domine toute la page ; le blanc sert de contraste (texte, cartes, boutons).
          La scène du volant n'a pas de cadre : elle est le décor du bandeau bleu, le texte passe par-dessus. */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-700 to-primary-500 text-white">
        <div className="pointer-events-none absolute -left-24 top-1/3 h-[420px] w-[420px] rounded-full bg-white/10 blur-3xl" />
        <DriverHeroScene />
        <div className="relative z-10 mx-auto max-w-6xl px-lg pb-[205px] pt-lg sm:pb-[255px] sm:pt-xl lg:flex lg:min-h-[585px] lg:items-center lg:pb-3xl lg:pt-3xl">
          <div className="max-w-xl">
            <p className="inline-flex rounded-full bg-white/15 px-md py-xs text-xs font-bold uppercase tracking-wider ring-1 ring-white/25">Chauffeurs</p>
            <h1 className="mt-md text-[1.7rem] font-extrabold leading-[1.08] tracking-tight sm:mt-lg sm:text-5xl lg:text-6xl">
              Prenez le volant. <span className="text-[#8BE3FF]">Deux formules, vous décidez.</span>
            </h1>
            <p className="mt-sm text-[0.95rem] leading-snug text-primary-50 sm:mt-lg sm:text-lg sm:leading-relaxed">
              Roulez avec un véhicule fourni par un partenaire et devenez-en propriétaire au terme du contrat, ou venez avec le vôtre.
              Le rendez-vous se prend dans l’application TamCar.
            </p>
            <div className="mt-md flex flex-wrap gap-sm sm:mt-xl sm:gap-md">
              <a
                href={`${CLIENT_APP_URL}/devenir-chauffeur`}
                className="rounded-full bg-white px-lg py-sm text-sm font-extrabold text-primary-700 shadow-xl transition hover:scale-[1.03] sm:px-xl sm:py-md sm:text-base"
              >
                Prendre rendez-vous
              </a>
              <a
                href={DRIVER_APP_URL}
                className="rounded-full px-lg py-sm text-sm font-bold text-white ring-2 ring-white/45 transition hover:bg-white/10 sm:px-xl sm:py-md sm:text-base"
              >
                Déjà chauffeur : TamCar Pro
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-primary-900 py-4xl text-white">
        <div className="mx-auto max-w-6xl px-lg">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8BE3FF]">Les formules</p>
          <h2 className="mt-sm max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">Un véhicule fourni, ou le vôtre.</h2>
          <div className="mt-2xl grid gap-xl md:grid-cols-2">
            {ORDER.map((id, i) => {
              const f = FORMULAS[id];
              return (
                <Reveal key={id} delay={i * 120}>
                  <article className="h-full rounded-2xl bg-primary-700/60 p-xl ring-1 ring-white/20 backdrop-blur">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#8BE3FF]">{id === 'cession' ? 'Formule A' : 'Formule B'}</p>
                    <h3 className="mt-xs text-2xl font-extrabold">{f.label}</h3>
                    <p className="mt-sm text-base text-primary-100">{f.tagline}</p>
                    <ul className="mt-lg space-y-sm">
                      {f.perks.map((p) => (
                        <li key={p} className="flex items-start gap-sm text-base text-white">
                          <span className="mt-1.5 inline-block h-2 w-2 flex-none rounded-full bg-[#8BE3FF]" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-primary-700 to-primary-900 py-4xl text-white">
        <div className="mx-auto max-w-3xl px-lg">
          <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">Les pièces à apporter au rendez-vous.</h2>
          <p className="mt-md text-base text-primary-100">Choisissez votre formule : la liste s’adapte.</p>
          <div className="mt-xl">
            <DocsTabs />
          </div>
        </div>
      </section>
    </>
  );
}
