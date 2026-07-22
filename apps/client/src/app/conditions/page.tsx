import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { TERMS_VERSION } from '@/lib/terms';
import { acceptTermsAction } from './actions';

type SearchParams = { error?: string; next?: string };

export default function ConditionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const error = searchParams.error;
  const next = searchParams.next ?? '/';

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-lg py-xl">
        <header className="flex flex-col items-center gap-xs">
          <Logo className="h-12 w-auto" />
        </header>

        <div className="mt-2xl">
          <h1 className="text-2xl font-extrabold leading-tight text-neutral-900">
            Nos conditions ont été mises à jour
          </h1>
          <p className="mt-sm text-sm text-neutral-600">
            Pour continuer à utiliser TamCar, merci de lire et d’accepter la
            version du {TERMS_VERSION} de nos documents :
          </p>
        </div>

        <div className="mt-lg space-y-sm">
          <Link
            href="/cgu"
            target="_blank"
            className="block rounded-xl border border-neutral-200 bg-neutral-50 px-lg py-md text-sm font-semibold text-neutral-900 hover:border-primary-300 hover:bg-primary-50"
          >
            📄 Conditions Générales d’Utilisation →
          </Link>
          <Link
            href="/confidentialite"
            target="_blank"
            className="block rounded-xl border border-neutral-200 bg-neutral-50 px-lg py-md text-sm font-semibold text-neutral-900 hover:border-primary-300 hover:bg-primary-50"
          >
            🔒 Politique de confidentialité →
          </Link>
        </div>

        <form action={acceptTermsAction} className="mt-xl">
          <input type="hidden" name="next" value={next} />
          <label className="flex items-start gap-md rounded-xl bg-neutral-100 p-lg">
            <input
              type="checkbox"
              name="accept_terms"
              required
              className="mt-0.5 h-5 w-5 flex-none accent-primary-500"
            />
            <span className="text-sm text-neutral-700">
              J’ai lu et j’accepte les{' '}
              <strong>Conditions Générales d’Utilisation</strong> et la{' '}
              <strong>Politique de confidentialité</strong> de TamCar.
            </span>
          </label>

          {error && (
            <div className="mt-md rounded-md bg-error/10 p-md text-sm font-medium text-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="mt-lg w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
          >
            Accepter et continuer
          </button>
        </form>

        <div className="flex-1" />
        <p className="mt-xl text-center text-[11px] text-neutral-400">
          Votre acceptation est enregistrée avec la date et la version du
          document, à valeur de preuve.
        </p>
      </div>
    </main>
  );
}
