import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { CheckIcon } from '@/components/Icon';
import { PasswordInput } from '@/components/PasswordInput';
import { requestPasswordResetAction, signInAction } from './actions';

type SearchParams = {
  error?: string;
  reset_sent?: string;
  next?: string;
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const error = searchParams.error;
  const resetSent = searchParams.reset_sent;
  const next = searchParams.next ?? '/';

  const clientUrl =
    process.env.NEXT_PUBLIC_CLIENT_URL ?? 'https://tamcar-client.vercel.app';

  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-80 blur-3xl" />
        <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-lg py-xl">
        <header className="flex flex-col items-center gap-xs">
          <Logo className="h-12 w-auto" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
            Espace chauffeur TamCar
          </p>
        </header>

        {resetSent ? (
          <ResetSentPanel email={resetSent} />
        ) : (
          <>
            <div className="mt-2xl">
              <h1 className="text-2xl font-extrabold leading-tight text-neutral-900">
                Bienvenue,{' '}
                <span className="bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">
                  chauffeur
                </span>
              </h1>
              <p className="mt-xs text-sm text-neutral-600">
                Connecte-toi avec ton email et ton mot de passe TamCar.
              </p>
            </div>

            <SignInForm error={error} next={next} />

            <div className="mt-xl border-t border-neutral-200 pt-lg">
              <p className="text-center text-xs text-neutral-500">
                Mot de passe oublié ? Reçois un lien pour en définir un nouveau.
              </p>
              <form action={requestPasswordResetAction} className="mt-md">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="Ton email chauffeur"
                  className="w-full rounded-lg bg-neutral-100 px-lg py-md text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="submit"
                  className="mt-md w-full rounded-lg border-2 border-primary-500 bg-white py-md text-sm font-bold text-primary-700 hover:bg-primary-50"
                >
                  Réinitialiser mon mot de passe
                </button>
              </form>
            </div>
          </>
        )}

        <div className="flex-1" />

        <p className="mt-xl text-center text-xs text-neutral-500">
          Tu n&apos;es pas encore chauffeur TamCar ?{' '}
          <a
            href={`${clientUrl}/devenir-chauffeur`}
            className="font-semibold text-primary-500 hover:underline"
          >
            Prends rendez-vous
          </a>
        </p>
      </div>
    </main>
  );
}

function SignInForm({ error, next }: { error?: string; next: string }) {
  return (
    <form action={signInAction} className="mt-xl space-y-md">
      <input type="hidden" name="next" value={next} />
      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="tu@exemple.bj"
          className="w-full rounded-lg bg-neutral-100 px-lg py-md text-base text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </Field>
      <Field label="Mot de passe">
        <PasswordInput
          name="password"
          required
          minLength={6}
          autoComplete="current-password"
          placeholder="Au moins 6 caractères"
        />
      </Field>

      {error && (
        <div className="rounded-md bg-error/10 p-md text-sm font-medium text-error">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
      >
        Se connecter
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <div className="mt-xs">{children}</div>
    </label>
  );
}

function ResetSentPanel({ email }: { email: string }) {
  return (
    <div className="mt-2xl rounded-xl border border-primary-200 bg-primary-50 p-lg">
      <div className="flex items-start gap-md">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary-500 text-white">
          <CheckIcon className="h-4 w-4" strokeWidth={3} />
        </span>
        <div className="flex-1">
          <p className="font-bold text-neutral-900">Lien envoyé !</p>
          <p className="mt-xs text-sm text-neutral-600">
            Ouvre ta boîte mail (<strong>{email}</strong>). Clique sur le lien
            pour définir un nouveau mot de passe. Après quoi tu pourras te
            connecter avec ce nouveau mot de passe.
          </p>
        </div>
      </div>
      <Link
        href="/login"
        className="mt-md inline-block text-sm font-semibold text-primary-500 underline"
      >
        Retour à la connexion
      </Link>
    </div>
  );
}
