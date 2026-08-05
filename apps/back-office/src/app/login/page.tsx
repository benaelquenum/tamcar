import { Logo } from '@/components/Logo';
import { PasswordInput } from '@/components/PasswordInput';
import { signInAction } from './actions';

type SearchParams = {
  error?: string;
  next?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  missing: 'Renseignez votre email et votre mot de passe.',
  credentials: 'Email ou mot de passe incorrect.',
  forbidden:
    "Ce compte n'a pas accès au back-office TamCar. Contactez l'administrateur.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const error = searchParams.error ? ERROR_MESSAGES[searchParams.error] : null;
  const next = searchParams.next ?? '/';

  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-80 blur-3xl" />
        <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col justify-center px-lg py-xl">
        <header className="flex flex-col items-center gap-xs">
          <Logo className="h-12 w-auto" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
            TamCar Office — Back-office administratif
          </p>
        </header>

        <div className="mt-2xl">
          <h1 className="text-2xl font-extrabold leading-tight text-neutral-900">
            Espace{' '}
            <span className="bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">
              administratif
            </span>
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Secrétariat, trésorerie, comptabilité et RH. Accès réservé à
            l&apos;équipe TamCar.
          </p>
        </div>

        {error && (
          <div className="mt-lg rounded-md bg-error/10 p-md text-sm text-error">
            {error}
          </div>
        )}

        <form action={signInAction} className="mt-xl flex flex-col gap-md">
          <input type="hidden" name="next" value={next} />
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="Email professionnel"
            className="w-full rounded-lg bg-neutral-100 px-lg py-md text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <PasswordInput
            name="password"
            required
            autoComplete="current-password"
            placeholder="Mot de passe"
          />
          <button
            type="submit"
            className="mt-sm w-full rounded-lg bg-primary-500 py-md text-sm font-bold text-white shadow-md transition hover:brightness-110"
          >
            Se connecter
          </button>
        </form>

        <p className="mt-xl text-center text-xs text-neutral-400">
          Les documents et écritures sont journalisés. Chaque action est tracée.
        </p>
      </div>
    </main>
  );
}
