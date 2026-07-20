import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { LogOutIcon } from '@/components/Icon';
import { getCurrentProfile } from '@/lib/session';
import { logout } from '@/app/login/actions';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) redirect('/login');
  if (profile.role !== 'admin') {
    // Non-admin : renvoi vers /, on ne dévoile pas l'existence du back-office
    redirect('/');
  }

  return (
    <div className="min-h-dvh bg-neutral-100">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-lg py-md">
          <div className="flex items-center gap-md">
            <Link href="/" aria-label="Retour app client">
              <Logo className="h-8 w-auto" />
            </Link>
            <span className="rounded-full bg-neutral-900 px-md py-xs text-xs font-bold uppercase tracking-wider text-white">
              Admin
            </span>
          </div>
          <nav className="flex items-center gap-lg">
            <Link href="/admin/rides" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Courses
            </Link>
            <Link href="/admin/drivers" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Chauffeurs
            </Link>
            <Link href="/admin/dealers" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Concess.
            </Link>
            <Link href="/admin/vehicles" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Véhicules
            </Link>
            <Link href="/admin/candidatures" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Rendez-vous
            </Link>
            <Link href="/admin/dealer-advances" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              ADR
            </Link>
            <Link href="/admin/litiges" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Litiges
            </Link>
            <Link href="/admin/promos" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Promos
            </Link>
            <Link href="/admin/banners" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Bannières
            </Link>
            <Link href="/admin/places" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Lieux
            </Link>
            <Link href="/compte" className="text-sm text-neutral-600 hover:text-primary-500">
              {profile.full_name}
            </Link>
            <form action={logout}>
              <button
                type="submit"
                aria-label="Se déconnecter"
                className="inline-flex items-center gap-xs rounded-lg border border-neutral-200 bg-white px-sm py-xs text-xs font-semibold text-neutral-700 hover:border-error/30 hover:text-error"
              >
                <LogOutIcon className="h-3.5 w-3.5" />
                Déconnexion
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-lg py-xl">{children}</main>
    </div>
  );
}
