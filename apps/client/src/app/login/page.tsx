import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { CheckIcon } from '@/components/Icon';
import { PasswordInput } from '@/components/PasswordInput';
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
} from './actions';

type SearchParams = {
  error?: string;
  sent?: string;
  reset_sent?: string;
  tab?: 'signin' | 'signup' | 'magic';
  next?: string;
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const activeTab = searchParams.tab === 'signup' ? 'signup' : 'signin';
  const error = searchParams.error;
  const sent = searchParams.sent;
  const resetSent = searchParams.reset_sent;
  const next = searchParams.next ?? '/';

  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      {/* Décors */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-80 blur-3xl" />
        <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-lg py-xl">
        {/* Logo header — sert de splash minimaliste */}
        <header className="flex flex-col items-center gap-xs">
          <Logo className="h-12 w-auto" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
            La course, sans surprise
          </p>
        </header>

        {resetSent ? (
          <ResetSentPanel email={resetSent} />
        ) : sent ? (
          <EmailSentPanel email={sent} />
        ) : (
          <>
            {/* Tabs */}
            <nav className="mt-2xl flex rounded-xl bg-neutral-100 p-xs">
              <Link
                href={{ pathname: '/login', query: { tab: 'signin', next } }}
                className={`flex-1 rounded-lg py-md text-center text-sm font-bold transition ${
                  activeTab === 'signin'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Se connecter
              </Link>
              <Link
                href={{ pathname: '/login', query: { tab: 'signup', next } }}
                className={`flex-1 rounded-lg py-md text-center text-sm font-bold transition ${
                  activeTab === 'signup'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Créer un compte
              </Link>
            </nav>

            {activeTab === 'signin' ? (
              <SignInForm error={error} next={next} />
            ) : (
              <SignUpForm error={error} />
            )}

            {/* Mot de passe oublié — reset propre */}
            <div className="mt-xl border-t border-neutral-200 pt-lg">
              <p className="text-center text-xs text-neutral-500">
                Mot de passe oublié ? Reçois un lien pour en définir un nouveau.
              </p>
              <form action={requestPasswordResetAction} className="mt-md">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="Ton email"
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

        <p className="mt-xl text-center text-xs text-neutral-400">
          <Link href="/cgu" className="underline hover:text-neutral-600">
            CGU
          </Link>
          {' · '}
          <Link
            href="/confidentialite"
            className="underline hover:text-neutral-600"
          >
            Politique de confidentialité
          </Link>
        </p>

        <div className="flex-1" />

        <p className="mt-xl text-center text-[11px] text-neutral-400">
          Tu veux devenir chauffeur ?{' '}
          <Link
            href="/devenir-chauffeur"
            className="font-semibold text-primary-500 hover:underline"
          >
            Prends rendez-vous
          </Link>
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

function SignUpForm({ error }: { error?: string }) {
  return (
    <form action={signUpAction} className="mt-xl space-y-md">
      <div className="grid grid-cols-2 gap-sm">
        <Field label="Prénom">
          <input
            name="first_name"
            type="text"
            required
            minLength={2}
            autoComplete="given-name"
            placeholder="Jean"
            className="w-full rounded-lg bg-neutral-100 px-md py-md text-base text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>
        <Field label="Nom">
          <input
            name="last_name"
            type="text"
            required
            minLength={2}
            autoComplete="family-name"
            placeholder="ADANDÉ"
            className="w-full rounded-lg bg-neutral-100 px-md py-md text-base text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>
      </div>

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

      <Field label="Téléphone (optionnel)">
        <div className="flex items-center overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-neutral-200 focus-within:ring-2 focus-within:ring-primary-500">
          <span className="border-r border-neutral-200 bg-neutral-100 px-md py-md text-base font-semibold text-neutral-600">
            +229
          </span>
          <input
            name="phone"
            type="tel"
            autoComplete="tel-national"
            inputMode="numeric"
            placeholder="01 67 59 18 17"
            className="flex-1 bg-transparent px-md py-md text-base text-neutral-900 outline-none placeholder:text-neutral-400"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />
        </div>
      </Field>

      <Field label="Mot de passe">
        <PasswordInput
          name="password"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Au moins 6 caractères"
        />
      </Field>

      <label className="flex items-start gap-md rounded-lg bg-neutral-100 p-md">
        <input
          type="checkbox"
          name="accept_terms"
          required
          className="mt-0.5 h-5 w-5 flex-none accent-primary-500"
        />
        <span className="text-xs leading-relaxed text-neutral-600">
          J&apos;ai lu et j&apos;accepte les{' '}
          <Link
            href="/cgu"
            target="_blank"
            className="font-semibold text-primary-600 underline"
          >
            Conditions Générales d&apos;Utilisation
          </Link>{' '}
          et la{' '}
          <Link
            href="/confidentialite"
            target="_blank"
            className="font-semibold text-primary-600 underline"
          >
            Politique de confidentialité
          </Link>{' '}
          de TamCar.
        </span>
      </label>

      {error && (
        <div className="rounded-md bg-error/10 p-md text-sm font-medium text-error">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
      >
        Créer mon compte
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
            pour définir un nouveau mot de passe. Puis reconnecte-toi avec ce
            nouveau mot de passe.
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

function EmailSentPanel({ email }: { email: string }) {
  return (
    <div className="mt-2xl rounded-xl border border-primary-200 bg-primary-50 p-lg">
      <div className="flex items-start gap-md">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary-500 text-white">
          <CheckIcon className="h-4 w-4" strokeWidth={3} />
        </span>
        <div className="flex-1">
          <p className="font-bold text-neutral-900">Lien envoyé !</p>
          <p className="mt-xs text-sm text-neutral-600">
            Ouvre ta boîte mail (<strong>{email}</strong>) et clique sur le lien
            pour te connecter. Vérifie les spams si tu ne le vois pas au bout
            de 2 min.
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
