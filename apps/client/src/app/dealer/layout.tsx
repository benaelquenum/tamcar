import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { LogOutIcon } from '@/components/Icon';
import { getCurrentProfile } from '@/lib/session';
import { logout } from '@/app/login/actions';

export default async function DealerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login?next=/dealer');
  if (profile.role !== 'dealer' && profile.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="min-h-dvh bg-neutral-100">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-lg py-md">
          <div className="flex items-center gap-md">
            <Link href="/dealer" aria-label="Accueil concessionnaire">
              <Logo className="h-8 w-auto" />
            </Link>
            <span className="rounded-full bg-primary-500 px-md py-xs text-xs font-bold uppercase tracking-wider text-white">
              Concess.
            </span>
          </div>
          <nav className="flex items-center gap-lg">
            <Link href="/dealer" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Tableau de bord
            </Link>
            <Link href="/dealer/vehicles" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Mes véhicules
            </Link>
            <Link href="/dealer/transactions" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Transactions
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
