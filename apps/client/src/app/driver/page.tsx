import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { DriverHome } from './DriverHome';

export default async function DriverPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = createServerSupabase();
  const { data: driverRow, error } = await supabase
    .from('drivers')
    .select('id, status, is_online, current_vehicle_id')
    .eq('profile_id', profile.id)
    .single();

  if (error || !driverRow) {
    // Pas encore driver → à créer manuellement dans DB (session suivante : onboarding driver)
    notFound();
  }

  return (
    <DriverHome
      driverName={profile.full_name}
      initialIsOnline={driverRow.is_online}
      hasVehicle={driverRow.current_vehicle_id !== null}
    />
  );
}
