import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { AdminSidebar } from './AdminSidebar';

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
    <div className="flex min-h-dvh bg-neutral-100">
      <AdminSidebar fullName={profile.full_name} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-lg py-xl">{children}</div>
      </main>
    </div>
  );
}
