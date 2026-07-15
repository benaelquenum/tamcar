import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import type { Wallet, WalletTransaction } from '@/lib/wallet';
import { WalletView } from '../../wallet/WalletView';

export default async function DriverWalletPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'driver' && profile.role !== 'admin') redirect('/');

  const supabase = createServerSupabase();
  const [{ data: wallets }, { data: transactions }] = await Promise.all([
    supabase.rpc('my_wallets'),
    supabase.rpc('wallet_transactions_for_user', { limit_count: 30 }),
  ]);

  return (
    <WalletView
      wallets={(wallets ?? []) as Wallet[]}
      transactions={(transactions ?? []) as WalletTransaction[]}
      isDriver
    />
  );
}
