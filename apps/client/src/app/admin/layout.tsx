import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { AdminSidebar } from './AdminSidebar';
import { AdminAlertsProvider } from './AdminAlerts';

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

  // Mode TEST des paiements : recharges et règlements de dette gratuits. À désactiver avant le lancement
  // (réglage « payments_test_mode » dans Bonus chauffeur).
  const supabase = createServerSupabase();
  const { data: testRule } = await supabase
    .from('program_rules')
    .select('value')
    .eq('key', 'payments_test_mode')
    .maybeSingle();
  const paymentsTestMode = (testRule as { value: number } | null)?.value === 1;

  return (
    <AdminAlertsProvider>
      <div className="flex min-h-dvh bg-neutral-100">
        <AdminSidebar fullName={profile.full_name} />
        <main className="min-w-0 flex-1">
          {paymentsTestMode && (
            <div role="status" className="bg-warning px-lg py-sm text-center text-xs font-bold text-neutral-900">
              Paiements en mode TEST : les recharges et les règlements de dette sont gratuits (simulation). À désactiver
              avant le lancement, dans Bonus chauffeur → « Paiements en mode TEST » = 0.
            </div>
          )}
          <div className="mx-auto max-w-6xl px-lg py-xl">{children}</div>
        </main>
      </div>
    </AdminAlertsProvider>
  );
}
