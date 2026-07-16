import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { LogOutIcon, UserIcon, WalletIcon, HistoryIcon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { getCurrentProfile, getCurrentUser } from '@/lib/session';
import { logout } from '@/app/login/actions';
import { AccountForm } from './AccountForm';

export default async function ComptePage() {
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);
  if (!user || !profile) redirect('/login?next=/compte');

  // Un driver n'a rien à faire sur /compte du client — il a son propre portail.
  if (profile.role === 'driver') {
    redirect(process.env.NEXT_PUBLIC_DRIVER_URL || 'http://localhost:3002/compte');
  }

  const isDriver = false;
  const isAdmin = profile.role === 'admin';

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
              {profile.role === 'client' && 'Compte client'}
              {profile.role === 'driver' && 'Compte chauffeur'}
              {profile.role === 'admin' && 'Compte administrateur'}
              {profile.role === 'dealer' && 'Compte concessionnaire'}
            </p>
          </div>
        </section>

        {/* Édition profil (client + admin uniquement — driver édite via TamCar) */}
        {!isDriver && (
          <section className="mt-xl">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Mes informations
            </h2>
            <AccountForm
              initialFullName={profile.full_name}
              userEmail={user.email ?? ''}
              userPhone={profile.phone ?? ''}
            />
          </section>
        )}

        {/* Info driver — non éditable */}
        {isDriver && (
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
        )}

        {/* Raccourcis */}
        <section className="mt-lg grid grid-cols-2 gap-sm">
          {isDriver ? (
            <>
              <ShortcutLink href="/driver/dashboard" Icon={WalletIcon} label="Mes gains" />
              <ShortcutLink href="/driver" Icon={UserIcon} label="Espace chauffeur" />
            </>
          ) : (
            <>
              <ShortcutLink href="/wallet" Icon={WalletIcon} label="Portefeuille" />
              <ShortcutLink href="/history" Icon={HistoryIcon} label="Historique" />
            </>
          )}
        </section>

        {isAdmin && (
          <section className="mt-lg">
            <Link
              href="/admin/rides"
              className="flex w-full items-center justify-center rounded-xl bg-neutral-900 py-md text-sm font-bold text-white shadow-md"
            >
              Accéder au back-office admin
            </Link>
          </section>
        )}

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
  label,
}: {
  href: string;
  Icon: (p: { className?: string }) => JSX.Element;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-xs rounded-xl border border-neutral-200 bg-white p-md text-center shadow-sm transition hover:shadow-md"
    >
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary-50 text-primary-500">
        <Icon />
      </span>
      <span className="text-xs font-semibold text-neutral-900">{label}</span>
    </Link>
  );
}
