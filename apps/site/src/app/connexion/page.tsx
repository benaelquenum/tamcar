import type { Metadata } from 'next';
import Link from 'next/link';
import { Road } from '@/components/anim/Road';
import { TrafficLight } from '@/components/anim/TrafficLight';
import { Wheel } from '@/components/anim/Wheel';
import { CLIENT_APP_URL, CONTACT_EMAIL, DRIVER_APP_URL } from '@/lib/config';
import { signInAction } from './actions';
import { SubmitButton } from './SubmitButton';

export const metadata: Metadata = {
  title: 'Espace partenaire',
  description: 'Connexion à l’espace partenaire TamCar : vos gains en direct, vos véhicules, votre historique.',
  robots: { index: false },
};

export default function LoginPage({ searchParams }: { searchParams: { erreur?: string; next?: string } }) {
  const erreur = searchParams.erreur;
  const roleError = erreur === 'role';

  return (
    <main className="relative grid min-h-dvh lg:grid-cols-2">
      {/* Côté visuel : le feu passe au vert, la roue tourne sur la route */}
      <section className="relative hidden overflow-hidden bg-neutral-900 lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/70 via-transparent to-cyan-500/10" />
        <div className="relative flex h-full flex-col items-center justify-center px-2xl pb-40">
          <div className="absolute left-2xl top-2xl w-14">
            <TrafficLight loop className="h-auto w-full" />
          </div>
          <Wheel className="w-[72%] max-w-[420px] drop-shadow-2xl" spinSeconds={8} scrollFactor={0} />
          <p className="mt-xl max-w-sm text-center text-2xl font-extrabold leading-snug text-white">
            Votre véhicule roule.
            <br />
            <span className="text-cyan-500">Vos gains, en direct.</span>
          </p>
        </div>
        <Road bare className="absolute inset-x-0 bottom-0" height={190} speed={1} />
      </section>

      {/* Côté formulaire */}
      <section className="flex items-center justify-center px-lg py-3xl">
        <div className="w-full max-w-md">
          <Link href="/" aria-label="TamCar, accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="TamCar" className="h-14 w-auto" />
          </Link>
          <h1 className="mt-xl text-3xl font-extrabold text-neutral-900">Espace partenaire</h1>
          <p className="mt-sm text-base text-neutral-600">
            Connectez-vous avec les identifiants que TamCar vous a remis.
          </p>

          {erreur && (
            <div className="mt-lg rounded-xl bg-error/10 p-md text-sm font-medium text-error" role="alert">
              {roleError ? (
                <>
                  Cet espace est réservé aux partenaires véhicule. Les clients commandent leurs courses dans{' '}
                  <a href={CLIENT_APP_URL} className="font-bold underline">l’application TamCar</a>, les chauffeurs utilisent{' '}
                  <a href={DRIVER_APP_URL} className="font-bold underline">TamCar Pro</a>.
                </>
              ) : (
                erreur
              )}
            </div>
          )}

          <form action={signInAction} className="mt-xl space-y-md">
            <input type="hidden" name="next" value={searchParams.next ?? '/espace'} />
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Adresse e-mail</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                className="mt-xs w-full rounded-xl bg-neutral-100 px-lg py-md text-base text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Mot de passe</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-xs w-full rounded-xl bg-neutral-100 px-lg py-md text-base text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <SubmitButton>Me connecter</SubmitButton>
          </form>

          <p className="mt-xl text-sm text-neutral-600">
            Mot de passe perdu, ou pas encore d’accès ?{' '}
            <a href={`mailto:${CONTACT_EMAIL}?subject=Acc%C3%A8s%20espace%20partenaire`} className="font-bold text-primary-700 underline underline-offset-4">
              Écrivez-nous
            </a>
            . Pas encore partenaire ?{' '}
            <Link href="/partenaires" className="font-bold text-primary-700 underline underline-offset-4">
              Découvrir l’offre
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
