import { Logo } from '@/components/Logo';

export default function HomePage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      {/* Blobs décoratifs en fond (subtils, flous) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-80 blur-3xl" />
        <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="absolute right-20 top-40 h-32 w-32 rounded-full bg-cyan-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-xl">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Logo className="h-9 w-auto" />
          <button
            type="button"
            aria-label="Profil"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200 transition hover:shadow-lg"
          >
            <UserIcon />
          </button>
        </header>

        {/* Greeting + hero */}
        <section className="mt-xl">
          <p className="flex items-center gap-xs text-base font-medium text-neutral-600">
            <span className="text-lg" aria-hidden>👋</span>
            <span>Bonjour</span>
          </p>
          <h1 className="mt-xs text-4xl font-extrabold leading-[1.05] tracking-tight text-neutral-900">
            Où allez-vous
            <br />
            <span className="bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">
              aujourd&apos;hui
            </span>
            &nbsp;?
          </h1>

          {/* Live status */}
          <div className="mt-md inline-flex items-center gap-sm rounded-full bg-success/10 px-md py-xs">
            <span className="relative grid h-2 w-2 place-items-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="text-xs font-semibold text-success">
              8 chauffeurs à Porto-Novo · ~3 min
            </span>
          </div>
        </section>

        {/* Search field */}
        <section className="mt-lg">
          <button
            type="button"
            className="group flex w-full items-center gap-md rounded-xl bg-white p-lg text-left shadow-md ring-1 ring-neutral-200 transition hover:shadow-lg hover:ring-primary-300"
          >
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow">
              <PinIcon />
            </span>
            <span className="flex-1 text-neutral-400 group-hover:text-neutral-600">
              Où voulez-vous aller ?
            </span>
            <ArrowIcon />
          </button>
        </section>

        {/* CTAs */}
        <section className="mt-lg space-y-md">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
          >
            <span className="text-lg" aria-hidden>🚗</span>
            Commander maintenant
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-sm rounded-xl border-2 border-primary-500 bg-white py-lg text-base font-semibold text-primary-700 transition hover:bg-primary-50"
          >
            <span aria-hidden>📅</span>
            Réserver à l&apos;avance
          </button>
        </section>

        {/* Featured : trajet phare corridor */}
        <section className="mt-xl">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-500 via-primary-700 to-violet-500 p-lg text-white shadow-glow">
            {/* Decoration emoji flou en arrière-plan */}
            <div className="pointer-events-none absolute -bottom-6 -right-4 select-none text-9xl opacity-15" aria-hidden>
              🛣️
            </div>
            <div className="relative">
              <div className="flex items-center gap-xs">
                <span className="inline-flex items-center rounded-full bg-gold/25 px-md py-xs text-xs font-bold uppercase tracking-wider text-white ring-1 ring-gold/40">
                  ⭐ Trajet phare
                </span>
              </div>
              <h2 className="mt-md text-2xl font-extrabold leading-tight">
                Cotonou → Porto-Novo
              </h2>
              <div className="mt-md flex items-baseline gap-sm">
                <span
                  className="text-4xl font-extrabold"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  3 500
                </span>
                <span className="text-sm font-medium text-white/80">
                  FCFA · 30 min · prix fixe
                </span>
              </div>
              <button
                type="button"
                className="mt-lg inline-flex items-center gap-xs rounded-md bg-white px-lg py-sm text-sm font-bold text-primary-700 shadow-md transition hover:brightness-105"
              >
                Réserver ce trajet
                <ArrowIcon />
              </button>
            </div>
          </div>
        </section>

        {/* Wallet — TamCar Crédit */}
        <section className="mt-xl">
          <div className="flex items-center gap-md rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-primary-500 text-white shadow-glow-violet">
              <WalletIcon />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                TamCar Crédit
              </p>
              <p
                className="text-xl font-extrabold text-neutral-900"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                12 500 FCFA
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-xs rounded-md bg-gold px-md py-sm text-sm font-bold text-neutral-900 shadow-glow-gold transition hover:brightness-105"
            >
              <span aria-hidden>＋</span> Recharger
            </button>
          </div>
        </section>

        {/* Quick actions row */}
        <section className="mt-lg grid grid-cols-3 gap-sm">
          <QuickAction icon="📜" label="Historique" />
          <QuickAction icon="🎁" label="Parrainer" tag="Bientôt" />
          <QuickAction icon="🆘" label="Aide" />
        </section>

        <div className="h-2xl" />
      </div>
    </main>
  );
}

function QuickAction({ icon, label, tag }: { icon: string; label: string; tag?: string }) {
  return (
    <button
      type="button"
      className="relative flex flex-col items-center gap-xs rounded-xl border border-neutral-200 bg-white p-md text-center shadow-sm transition hover:shadow-md"
    >
      <span className="text-2xl" aria-hidden>{icon}</span>
      <span className="text-xs font-semibold text-neutral-900">{label}</span>
      {tag && (
        <span className="absolute -top-1 -right-1 rounded-full bg-violet-500 px-xs py-0.5 text-[10px] font-bold text-white shadow-glow-violet">
          {tag}
        </span>
      )}
    </button>
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}
