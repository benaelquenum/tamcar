import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { ArrowRightIcon, CarIcon } from '@/components/Icon';

/**
 * L'espace chauffeur est désormais une app dédiée : `apps/driver-portal`.
 * Cette page conserve le chemin /driver comme point d'atterrissage informatif
 * et redirige vers le portail.
 */
export default function DriverPortalRedirect() {
  const driverPortalUrl =
    process.env.NEXT_PUBLIC_DRIVER_URL || 'http://localhost:3002';

  return (
    <main className="grid min-h-dvh place-items-center bg-neutral-50 px-lg">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-xl text-center shadow-md">
        <div className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow">
          <CarIcon className="h-7 w-7" />
        </div>
        <Logo className="mx-auto h-8 w-auto" />
        <h1 className="mt-lg text-2xl font-extrabold text-neutral-900">
          L&apos;espace chauffeur a déménagé
        </h1>
        <p className="mt-md text-sm text-neutral-600">
          Utilise désormais le portail dédié pour te connecter, prendre des courses et suivre
          tes gains.
        </p>
        <a
          href={driverPortalUrl}
          className="mt-xl inline-flex items-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 px-xl py-md text-sm font-bold text-white shadow-glow"
        >
          Ouvrir l&apos;espace chauffeur
          <ArrowRightIcon className="h-4 w-4" />
        </a>
        <p className="mt-lg text-[11px] text-neutral-500">
          Tu n&apos;es pas encore chauffeur ?{' '}
          <Link href="/devenir-chauffeur" className="font-semibold text-primary-500 hover:underline">
            Prends rendez-vous
          </Link>
        </p>
      </div>
    </main>
  );
}
