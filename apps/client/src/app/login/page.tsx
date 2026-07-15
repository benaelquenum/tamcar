import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { CheckIcon } from '@/components/Icon';
import { login } from './actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string };
}) {
  const sent = searchParams.sent;
  const error = searchParams.error;

  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      {/* Blobs décoratifs */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-80 blur-3xl" />
        <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-lg py-xl">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="Retour à l'accueil">
            <Logo className="h-9 w-auto" />
          </Link>
        </header>

        <div className="mt-3xl">
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-neutral-900">
            Bienvenue sur
            <br />
            <span className="bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">
              TamCar
            </span>
          </h1>
          <p className="mt-md text-base text-neutral-600">
            Reçois un lien de connexion instantané dans ta boîte mail. Pas de mot
            de passe à retenir.
          </p>
        </div>

        {sent ? (
          <div className="mt-xl rounded-xl border border-success/30 bg-success/5 p-lg">
            <div className="flex items-start gap-md">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-success text-white">
                <CheckIcon className="h-4 w-4" strokeWidth={3} />
              </span>
              <div className="flex-1">
                <p className="font-bold text-neutral-900">Lien envoyé !</p>
                <p className="mt-xs text-sm text-neutral-600">
                  Ouvre ta boîte mail (<strong>{sent}</strong>) et clique sur le lien pour te connecter.
                  Pense à vérifier les spams si tu ne le vois pas dans 2 min.
                </p>
              </div>
            </div>
            <form action={login} className="mt-md">
              <input type="hidden" name="email" value={sent} />
              <button
                type="submit"
                className="text-sm font-semibold text-primary-500 underline"
              >
                Renvoyer le lien
              </button>
            </form>
          </div>
        ) : (
          <form action={login} className="mt-xl space-y-md">
            <div>
              <label
                htmlFor="email"
                className="mb-xs block text-sm font-semibold text-neutral-900"
              >
                Ton email
              </label>
              <input
                id="email"
                type="email"
                name="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="ton.email@exemple.bj"
                className="w-full rounded-xl bg-neutral-100 px-lg py-lg text-base text-neutral-900 shadow-sm ring-1 ring-neutral-200 transition placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {error && (
              <div className="rounded-md bg-error/10 p-md text-sm font-medium text-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
            >
              Envoyer le lien magique
            </button>
          </form>
        )}

        <p className="mt-xl text-center text-xs text-neutral-400">
          En te connectant, tu acceptes les CGU TamCar.
          <br />
          Numéro de téléphone bientôt disponible.
        </p>

        <div className="flex-1" />

        <Link
          href="/"
          className="mt-xl text-center text-sm font-medium text-neutral-600 hover:text-primary-500"
        >
          ← Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
