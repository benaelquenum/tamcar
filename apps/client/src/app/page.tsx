import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CategoryPricingCards } from '@/components/CategoryPricingCards';
import { Logo } from '@/components/Logo';
import {
  ArrowRightIcon,
  CalendarIcon,
  CarIcon,
  GiftIcon,
  HistoryIcon,
  LifeBuoyIcon,
  PinIcon,
  PlusIcon,
  UserIcon,
  WalletIcon,
  WaveIcon,
} from '@/components/Icon';
import { firstNameOf, getCurrentProfile } from '@/lib/session';

const DEFAULT_NAMES = new Set(['utilisateur', 'Nouveau client', 'Ami TamCar']);

export default async function HomePage() {
  const profile = await getCurrentProfile();

  // Force onboarding si le profil est loggé mais pas encore complété
  if (profile && (!profile.full_name || DEFAULT_NAMES.has(profile.full_name.trim()))) {
    redirect('/onboarding');
  }

  const firstName = firstNameOf(profile);
  const isLoggedIn = profile !== null;

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
          {isLoggedIn ? (
            <button
              type="button"
              aria-label="Profil"
              className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200 transition hover:shadow-lg"
            >
              <UserIcon />
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-primary-500 px-lg py-sm text-sm font-bold text-white shadow-glow transition hover:brightness-110"
            >
              Se connecter
            </Link>
          )}
        </header>

        {/* Greeting + hero */}
        <section className="mt-xl">
          <p className="flex items-center gap-xs text-base font-medium text-neutral-600">
            <WaveIcon className="h-5 w-5 text-gold-500" />
            <span>{firstName ? `Bonjour ${firstName}` : 'Bonjour'}</span>
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
          <Link
            href="/commande"
            className="group flex w-full items-center gap-md rounded-xl bg-white p-lg text-left shadow-md ring-1 ring-neutral-200 transition hover:shadow-lg hover:ring-primary-300"
          >
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow">
              <PinIcon />
            </span>
            <span className="flex-1 text-neutral-400 group-hover:text-neutral-600">
              Où voulez-vous aller ?
            </span>
            <ArrowRightIcon />
          </Link>
        </section>

        {/* CTAs */}
        <section className="mt-lg space-y-md">
          <Link
            href="/commande"
            className="flex w-full items-center justify-center gap-sm rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-lg text-base font-bold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]"
          >
            <CarIcon className="h-5 w-5" />
            Commander maintenant
          </Link>
          <Link
            href="/commande?scheduled=1"
            className="flex w-full items-center justify-center gap-sm rounded-xl border-2 border-primary-500 bg-white py-lg text-base font-semibold text-primary-700 transition hover:bg-primary-50"
          >
            <CalendarIcon className="h-5 w-5" />
            Réserver à l&apos;avance
          </Link>
        </section>

        {/* Cartes catégories — prix calculés en direct via Supabase RPC compute_price */}
        <CategoryPricingCards />

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
              <PlusIcon className="h-3.5 w-3.5" strokeWidth={3} />
              Recharger
            </button>
          </div>
        </section>

        {/* Quick actions row */}
        <section className="mt-lg grid grid-cols-3 gap-sm">
          <QuickActionLink href="/history" Icon={HistoryIcon} label="Historique" tint="primary" />
          <QuickAction Icon={GiftIcon} label="Parrainer" tag="Bientôt" tint="violet" />
          <QuickAction Icon={LifeBuoyIcon} label="Aide" tint="cyan" />
        </section>

        <div className="h-2xl" />
      </div>
    </main>
  );
}

type Tint = 'primary' | 'violet' | 'cyan';

const TINT_CLASSES: Record<Tint, string> = {
  primary: 'text-primary-500 bg-primary-50',
  violet: 'text-violet-500 bg-violet-500/10',
  cyan: 'text-cyan-500 bg-cyan-500/10',
};

function QuickAction({
  Icon,
  label,
  tag,
  tint,
}: {
  Icon: (props: { className?: string }) => JSX.Element;
  label: string;
  tag?: string;
  tint: Tint;
}) {
  return (
    <button
      type="button"
      className="relative flex flex-col items-center gap-xs rounded-xl border border-neutral-200 bg-white p-md text-center shadow-sm transition hover:shadow-md"
    >
      <span className={`grid h-10 w-10 place-items-center rounded-lg ${TINT_CLASSES[tint]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-semibold text-neutral-900">{label}</span>
      {tag && (
        <span className="absolute -right-1 -top-1 rounded-full bg-violet-500 px-xs py-0.5 text-[10px] font-bold text-white shadow-glow-violet">
          {tag}
        </span>
      )}
    </button>
  );
}

function QuickActionLink({
  href,
  Icon,
  label,
  tint,
}: {
  href: string;
  Icon: (props: { className?: string }) => JSX.Element;
  label: string;
  tint: Tint;
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col items-center gap-xs rounded-xl border border-neutral-200 bg-white p-md text-center shadow-sm transition hover:shadow-md"
    >
      <span className={`grid h-10 w-10 place-items-center rounded-lg ${TINT_CLASSES[tint]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-semibold text-neutral-900">{label}</span>
    </Link>
  );
}
