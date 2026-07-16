import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import {
  ArrowRightIcon,
  CarIcon,
  HistoryIcon,
  LogOutIcon,
  WalletIcon,
} from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { getCurrentProfile, getCurrentUser } from '@/lib/session';
import { logout } from '@/app/login/actions';

export default async function ComptePage() {
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);
  if (!user || !profile) redirect('/login?next=/compte');
  if (profile.role !== 'driver' && profile.role !== 'admin') redirect('/login');

  return (
    <main className="relative min-h-dvh bg-neutral-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-primary-100 opacity-70 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href="/"
            aria-label="Retour à l'accueil"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <Logo className="h-8 w-auto" />
        </header>

        <section className="mt-xl flex items-center gap-md">
          <Avatar src={profile.avatar_url} name={profile.full_name} size={64} />
          <div>
            <h1 className="text-2xl font-extrabold text-neutral-900">{profile.full_name}</h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">
              Compte chauffeur TamCar
            </p>
          </div>
        </section>

        {/* Info non éditable */}
        <section className="mt-xl rounded-xl border border-neutral-200 bg-white p-lg shadow-sm">
          <h2 className="mb-md text-xs font-bold uppercase tracking-wider text-neutral-500">
            Mes informations
          </h2>
          <dl className="space-y-sm text-sm">
            <Row label="Nom complet" value={profile.full_name} />
            <Row label="Téléphone" value={profile.phone ?? '—'} />
            <Row label="Email" value={user.email ?? '—'} />
          </dl>
          <p className="mt-md rounded-md bg-warning/10 p-sm text-[11px] text-warning">
            Pour modifier ces informations, contacte l&apos;équipe TamCar.
          </p>
        </section>

        {/* Raccourcis chauffeur */}
        <section className="mt-lg space-y-sm">
          <ShortcutLink
            href="/dashboard"
            Icon={WalletIcon}
            title="Mes gains"
            sub="Cash, fonds rachat, progression du jour"
          />
          <ShortcutLink
            href="/history"
            Icon={HistoryIcon}
            title="Historique des courses"
            sub="Ce que chaque course t'a rapporté"
          />
          <ShortcutLink
            href="/"
            Icon={CarIcon}
            title="Prendre des courses"
            sub="Se connecter, voir les courses autour"
          />
        </section>

        {/* Déconnexion */}
        <section className="mt-2xl">
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-sm rounded-xl border border-error/30 bg-white py-md text-sm font-bold text-error hover:bg-error/5"
            >
              <LogOutIcon />
              Se déconnecter
            </button>
          </form>
        </section>

        <div className="h-2xl" />
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="text-right font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}

function ShortcutLink({
  href,
  Icon,
  title,
  sub,
}: {
  href: string;
  Icon: (p: { className?: string }) => JSX.Element;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-md rounded-xl border border-neutral-200 bg-white p-md shadow-sm transition hover:shadow-md"
    >
      <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-primary-50 text-primary-500">
        <Icon />
      </span>
      <div className="flex-1">
        <p className="text-sm font-bold text-neutral-900">{title}</p>
        <p className="text-[11px] text-neutral-600">{sub}</p>
      </div>
      <ArrowRightIcon className="h-4 w-4 text-neutral-400" />
    </Link>
  );
}
