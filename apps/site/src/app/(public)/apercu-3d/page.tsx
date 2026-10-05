import type { Metadata } from 'next';
import { SteeringScene } from '@/components/anim/SteeringScene';
import { SteeringScene3DLazy } from '@/components/anim/SteeringScene3DLazy';

export const metadata: Metadata = { title: 'Aperçu 3D', robots: { index: false, follow: false } };

function Hero({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-700 to-primary-500 text-white">
      {children}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[62%] bg-gradient-to-r from-primary-900/75 via-primary-900/35 to-transparent" />
      <div className="relative z-10 mx-auto max-w-6xl px-lg pb-[300px] pt-3xl lg:flex lg:min-h-[640px] lg:items-center lg:pb-4xl lg:pt-4xl">
        <div className="max-w-xl">
          <p className="inline-flex rounded-full bg-white/15 px-md py-xs text-xs font-bold uppercase tracking-wider ring-1 ring-white/25">{label}</p>
          <h1 className="mt-lg text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Prenez le volant. <span className="text-[#8BE3FF]">Deux formules, vous décidez.</span>
          </h1>
          <p className="mt-lg text-lg leading-relaxed text-primary-50">
            Roulez avec un véhicule fourni par un partenaire et devenez-en propriétaire au terme du contrat, ou venez avec le vôtre.
          </p>
          <div className="mt-xl flex flex-wrap gap-md">
            <span className="rounded-full bg-white px-xl py-md text-base font-extrabold text-primary-700 shadow-xl">Prendre rendez-vous</span>
            <span className="rounded-full px-xl py-md text-base font-bold text-white ring-2 ring-white/45">Déjà chauffeur : TamCar Pro</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Preview3D({ searchParams }: { searchParams: { lg?: string } }) {
  return (
    <>
      <Hero label="Aperçu · version 3D">
        <SteeringScene3DLazy className={searchParams.lg !== undefined ? 'inset-0' : 'inset-x-0 bottom-0 h-[420px] lg:inset-0 lg:h-auto'} />
      </Hero>
      <Hero label="Actuelle · version 2D">
        <SteeringScene className="left-1/2 lg:left-[72%]" />
      </Hero>
    </>
  );
}
