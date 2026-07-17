import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getCurrentUser } from '@/lib/session';
import { updatePasswordAction } from './actions';

type Props = {
  searchParams: { error?: string };
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      '/login?error=' +
        encodeURIComponent(
          'Ta session de récupération a expiré. Redemande un lien.',
        ),
    );
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-80 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-lg py-xl">
        <header className="flex flex-col items-center gap-xs">
          <Logo className="h-12 w-auto" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
            Nouveau mot de passe
          </p>
        </header>

        <div className="mt-2xl">
          <h1 className="text-2xl font-extrabold leading-tight text-neutral-900">
            Définis ton nouveau mot de passe
          </h1>
          <p className="mt-xs text-sm text-neutral-600">
            Au moins 6 caractères. Tu l&apos;utiliseras à chaque connexion.
          </p>
        </div>

        <form action={updatePasswordAction} className="mt-xl space-y-md">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Nouveau mot de passe
            </span>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Au moins 6 caractères"
              className="mt-xs w-full rounded-lg bg-neutral-100 px-lg py-md text-base text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Confirmer le mot de passe
            </span>
            <input
              name="password_confirm"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Retape le même mot de passe"
              className="mt-xs w-full rounded-lg bg-neutral-100 px-lg py-md text-base text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>

          {searchParams.error && (
            <div className="rounded-md bg-error/10 p-md text-sm font-medium text-error">
              {searchParams.error}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
          >
            Enregistrer et me reconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
