import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { StrikesClient } from './StrikesClient';

export default async function DriverStrikesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'driver' && profile.role !== 'admin') redirect('/');

  const supabase = createServerSupabase();
  const { data } = await supabase.rpc('my_driver_strikes');
  const strikes = (data ?? []) as Array<{
    ride_id: string;
    ended_at: string;
    pickup_address: string;
    dropoff_address: string;
    cancel_reason_user: string | null;
    cancel_driver_fault_evidence: string | null;
    disputed_at: string | null;
    dispute_reason: string | null;
    resolved_at: string | null;
    upheld: boolean | null;
    can_dispute: boolean;
  }>;

  return <StrikesClient strikes={strikes} />;
}
