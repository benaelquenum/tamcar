import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getCurrentProfile } from '@/lib/session';
import { completeOnboarding } from './actions';

const DEFAULT_NAMES = new Set(['utilisateur', 'Nouveau client', 'Ami TamCar']);

function isProfileIncomplete(fullName: string | null | undefined): boolean {
  if (!fullName) return true;
  return DEFAULT_NAMES.has(fullName.trim());
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  // Pré-remplissage si déjà partiel (rare, mais on prend)
  const isDefault = isProfileIncomplete(profile.full_name);
  const currentFullName = isDefault ? '' : profile.full_name.trim();
  const parts = currentFullName.split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ');

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
          <Logo className="h-9 w-auto" />
          <span className="rounded-full bg-gold/20 px-md py-xs text-xs font-bold text-neutral-900 ring-1 ring-gold/40">
            Étape 1/1
          </span>
        </header>

        <div className="mt-3xl">
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-neutral-900">
            Presque prêt
            <br />
            <span className="bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">
              à rouler
            </span>
            &nbsp;!
          </h1>
          <p className="mt-md text-base text-neutral-600">
            Un dernier détail : dis-nous comment on doit t&apos;appeler
            pour personnaliser tes trajets.
          </p>
        </div>

        <form action={completeOnboarding} className="mt-xl space-y-md">
          <div>
            <label
              htmlFor="firstName"
              className="mb-xs block text-sm font-semibold text-neutral-900"
            >
              Prénom
            </label>
            <input
              id="firstName"
              type="text"
              name="firstName"
              required
              autoComplete="given-name"
              autoFocus
              defaultValue={firstName}
              placeholder="Terence"
              className="w-full rounded-xl bg-neutral-100 px-lg py-lg text-base text-neutral-900 shadow-sm ring-1 ring-neutral-200 transition placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label
              htmlFor="lastName"
              className="mb-xs block text-sm font-semibold text-neutral-900"
            >
              Nom
            </label>
            <input
              id="lastName"
              type="text"
              name="lastName"
              required
              autoComplete="family-name"
              defaultValue={lastName}
              placeholder="Beniraphael"
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
            Continuer
          </button>
        </form>

        <p className="mt-xl text-center text-xs text-neutral-400">
          Ces infos restent privées et servent uniquement à personnaliser ton
          expérience TamCar.
        </p>
      </div>
    </main>
  );
}
