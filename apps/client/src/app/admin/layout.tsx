import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { getCurrentProfile } from '@/lib/session';

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
            <Link href="/admin/places" className="text-sm font-semibold text-neutral-900 hover:text-primary-500">
              Lieux
            </Link>
            <span className="text-sm text-neutral-600">{profile.full_name}</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-lg py-xl">{children}</main>
    </div>
  );
}
