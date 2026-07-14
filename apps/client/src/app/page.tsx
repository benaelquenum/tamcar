import { Logo } from '@/components/Logo';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-lg py-xl">
      <header className="flex items-center justify-between">
        <Logo className="h-8 w-auto" />
        <button
          type="button"
          aria-label="Profil"
          className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-neutral-900 transition hover:bg-neutral-200"
        >
          <UserIcon />
        </button>
      </header>

      <section className="mt-2xl">
        <h1 className="text-3xl font-extrabold leading-tight">
          Où allez-vous ?
        </h1>
        <p className="mt-sm text-neutral-600">
          Réservez maintenant ou plus tard, prix fixe garanti.
        </p>
      </section>

      <section className="mt-xl space-y-md">
        <button
          type="button"
          className="flex w-full items-center gap-md rounded-lg bg-neutral-100 px-lg py-lg text-left transition hover:bg-neutral-200"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-500 text-white">
            <PinIcon />
          </span>
          <span className="flex-1 text-neutral-400">Adresse de destination</span>
        </button>
      </section>

      <section className="mt-xl space-y-md">
        <button
          type="button"
          className="w-full rounded-md bg-primary-500 py-lg text-base font-semibold text-white shadow-md transition hover:bg-primary-700"
        >
          Commander une course
        </button>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-sm rounded-md border-2 border-primary-300 py-lg text-base font-semibold text-primary-700 transition hover:bg-primary-50"
        >
          <CalendarIcon />
          Réserver à l&apos;avance
        </button>
      </section>

      <div className="flex-1" />

      <section className="mt-xl rounded-lg bg-neutral-100 p-lg">
        <div className="flex items-center gap-md">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary-100 text-primary-500">
            <WalletIcon />
          </div>
          <div className="flex-1">
            <p className="text-sm text-neutral-600">TamCar Crédit</p>
            <p
              className="text-lg font-bold"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              0 FCFA
            </p>
          </div>
          <button
            type="button"
            className="rounded-md bg-primary-500 px-md py-sm text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            Recharger
          </button>
        </div>
      </section>
    </main>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}
