import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { CheckIcon } from '@/components/Icon';
import { displayBeninPhone } from '@/lib/phone';
import { resend, verify } from './actions';

export default function VerifyPage({
  searchParams,
}: {
  searchParams: { phone?: string; error?: string; resent?: string };
}) {
  const phone = searchParams.phone;
  const error = searchParams.error;
  const resent = searchParams.resent === '1';

  if (!phone) {
    // Pas de numéro dans l'URL → renvoie au login
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-lg text-center">
        <p className="text-neutral-600">Session expirée.</p>
        <Link href="/login" className="mt-md text-primary-500 underline">
          Recommencer
        </Link>
      </main>
    );
  }

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
            Ton code
          </h1>
          <p className="mt-md text-base text-neutral-600">
            Un SMS avec un code à 6 chiffres a été envoyé au
            <br />
            <strong className="text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {displayBeninPhone(phone)}
            </strong>
          </p>
          <p className="mt-sm text-xs text-neutral-500">
            La livraison peut prendre 10-30 secondes. Vérifie tes messages.
          </p>
        </div>

        {resent && (
          <div className="mt-lg flex items-center gap-md rounded-md bg-success/10 p-md text-sm font-medium text-success">
            <CheckIcon className="h-4 w-4" strokeWidth={3} />
            Nouveau code envoyé.
          </div>
        )}

        <form action={verify} className="mt-xl space-y-md">
          <input type="hidden" name="phone" value={phone} />
          <div>
            <label
              htmlFor="token"
              className="mb-xs block text-sm font-semibold text-neutral-900"
            >
              Code à 6 chiffres
            </label>
            <input
              id="token"
              type="text"
              name="token"
              required
              autoComplete="one-time-code"
              autoFocus
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              placeholder="123456"
              className="w-full rounded-xl bg-neutral-100 px-lg py-lg text-center text-3xl font-extrabold tracking-[0.5em] text-neutral-900 shadow-sm ring-1 ring-neutral-200 transition placeholder:text-neutral-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              style={{ fontVariantNumeric: 'tabular-nums' }}
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
            Valider et me connecter
          </button>
        </form>

        <form action={resend} className="mt-md text-center">
          <input type="hidden" name="phone" value={phone} />
          <button
            type="submit"
            className="text-sm font-semibold text-primary-500 underline decoration-primary-500/30 underline-offset-4 hover:decoration-primary-500"
          >
            Renvoyer le code
          </button>
        </form>

        <div className="flex-1" />

        <Link
          href="/login"
          className="mt-xl text-center text-sm font-medium text-neutral-600 hover:text-primary-500"
        >
          ← Utiliser un autre numéro
        </Link>
      </div>
    </main>
  );
}
