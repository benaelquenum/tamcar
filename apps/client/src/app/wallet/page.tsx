import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import type { Wallet, WalletTransaction } from '@/lib/wallet';
import { WalletView } from './WalletView';

export default async function WalletPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = createServerSupabase();
  const isDriver = profile.role === 'driver';

  const [{ data: wallets }, { data: transactions }, driverRes] = await Promise.all([
    supabase.rpc('my_wallets'),
    supabase.rpc('wallet_transactions_for_user', { limit_count: 30 }),
    isDriver
      ? supabase.from('drivers').select('application_type').eq('profile_id', profile.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const applicationType =
    (driverRes as { data: { application_type: 'cession' | 'proprietaire' } | null }).data
      ?.application_type ?? null;

  return (
    <WalletView
      wallets={(wallets ?? []) as Wallet[]}
      transactions={(transactions ?? []) as WalletTransaction[]}
      isDriver={isDriver}
      driverApplicationType={applicationType}
    />
  );
}
