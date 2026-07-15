import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'driver' && profile.role !== 'admin') {
    redirect('/');
  }
  return <>{children}</>;
}
