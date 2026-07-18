import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import type { Wallet, WalletTransaction } from '@/lib/wallet';
import { WalletView } from './WalletView';

export default async function WalletPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = createServerSupabase();
  const [{ data: wallets }, { data: transactions }, { data: driver }] = await Promise.all([
    supabase.rpc('my_wallets'),
    supabase.rpc('wallet_transactions_for_user', { limit_count: 30 }),
    supabase.from('drivers').select('application_type').eq('profile_id', profile.id).single(),
  ]);

  const applicationType =
    (driver as { application_type: 'cession' | 'proprietaire' } | null)?.application_type ?? null;

  // Le chauffeur ne voit que ce qui le concerne : ni ligne dealer, ni ligne rachat,
  // ni ligne de la contrepartie du rendu monnaie.
  const HIDDEN_FOR_DRIVER = new Set<string>([
    'dealer_share_credit',
    'rachat_credit',
    'change_return_in',   // c'est le crédit côté client, ne devrait pas être là mais safe
  ]);
  // On retire aussi le wallet rachat des cards.
  const visibleWallets = ((wallets ?? []) as Wallet[]).filter((w) => w.kind !== 'tamcar_rachat');
  const visibleTx = ((transactions ?? []) as WalletTransaction[])
    .filter((tx) => !HIDDEN_FOR_DRIVER.has(tx.type) && tx.wallet_kind !== 'tamcar_rachat');

  return (
    <WalletView
      wallets={visibleWallets}
      transactions={visibleTx}
      isDriver
      driverApplicationType={applicationType}
    />
  );
}
