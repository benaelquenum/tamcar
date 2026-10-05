import { redirect } from 'next/navigation';
import { CLIENT_APP_URL } from '@/lib/config';
import { getCurrentProfile } from '@/lib/session';
import { TERMS_VERSION } from '@/lib/terms';
import { signOutAction } from '@/app/connexion/actions';
import { SubmitButton } from '@/app/connexion/SubmitButton';
import { acceptTermsAction } from './actions';

export const metadata = { title: 'Conditions d’utilisation', robots: { index: false } };

export default async function ConditionsPage({ searchParams }: { searchParams: { erreur?: string; next?: string } }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/connexion?next=/espace');

  const next = searchParams.next && searchParams.next.startsWith('/espace') ? searchParams.next : '/espace';

  return (
    <main className="grid min-h-dvh place-items-center bg-neutral-100 px-lg py-xl">
      <div className="w-full max-w-md rounded-2xl bg-white p-xl shadow-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="TamCar" className="h-10 w-auto" />
        <h1 className="mt-lg text-2xl font-extrabold leading-tight text-neutral-900">Avant d’accéder à votre espace</h1>
        <p className="mt-sm text-sm text-neutral-600">
          Merci de lire et d’accepter la version du {TERMS_VERSION} de nos documents. Cette étape n’a lieu qu’une fois par version.
        </p>

        <div className="mt-lg space-y-sm">
          <a
            href={`${CLIENT_APP_URL}/cgu`}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-neutral-200 bg-neutral-50 px-lg py-md text-sm font-semibold text-neutral-900 hover:border-primary-300 hover:bg-primary-50"
          >
            Conditions générales d’utilisation <span aria-hidden>→</span>
          </a>
          <a
            href={`${CLIENT_APP_URL}/confidentialite`}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-neutral-200 bg-neutral-50 px-lg py-md text-sm font-semibold text-neutral-900 hover:border-primary-300 hover:bg-primary-50"
          >
            Politique de confidentialité <span aria-hidden>→</span>
          </a>
        </div>

        <form action={acceptTermsAction} className="mt-xl">
          <input type="hidden" name="next" value={next} />
          <label className="flex items-start gap-md rounded-xl bg-neutral-100 p-lg">
            <input type="checkbox" name="accept_terms" required className="mt-0.5 h-5 w-5 flex-none accent-primary-500" />
            <span className="text-sm text-neutral-700">
              J’ai lu et j’accepte les <strong>conditions générales d’utilisation</strong> et la{' '}
              <strong>politique de confidentialité</strong> de TamCar.
            </span>
          </label>

          {searchParams.erreur && (
            <p role="alert" className="mt-md rounded-lg bg-error/10 p-md text-sm font-medium text-error">
              {searchParams.erreur}
            </p>
          )}

          <div className="mt-lg">
            <SubmitButton pendingLabel="Enregistrement…">Accepter et continuer</SubmitButton>
          </div>
        </form>

        <form action={signOutAction} className="mt-md text-center">
          <button type="submit" className="text-xs font-semibold text-neutral-500 underline underline-offset-4 hover:text-neutral-700">
            Me déconnecter
          </button>
        </form>

        <p className="mt-lg text-center text-[11px] text-neutral-400">
          Votre acceptation est enregistrée avec la date et la version du document, à valeur de preuve.
        </p>
      </div>
    </main>
  );
}
