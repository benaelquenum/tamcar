import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { DriverHome } from './DriverHome';

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  // Middleware bloque déjà les non-drivers/non-admins ; ceinture + bretelles ici.
  if (profile.role !== 'driver' && profile.role !== 'admin') {
    redirect('/login?error=' + encodeURIComponent('Compte non-chauffeur — accès refusé.'));
  }

  const supabase = createServerSupabase();
  const { data: driverRow } = await supabase
    .from('drivers')
    .select('id, status, is_online, current_vehicle_id')
    .eq('profile_id', profile.id)
    .single();

  // Reprise de course : si le chauffeur a une course active (acceptée, en cours),
  // on le renvoie directement dessus au lieu de le laisser sur l'accueil.
  if (driverRow) {
    const { data: activeRide } = await supabase
      .from('rides_view')
      .select('id, status')
      .eq('driver_id', driverRow.id)
      .in('status', ['matched', 'arrived', 'in_progress'])
      .order('matched_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeRide?.id) redirect(`/ride/${activeRide.id}`);
  }

  if (!driverRow) {
    // Cas edge : profil "driver" en base mais aucune fiche drivers. On informe.
    return (
      <main className="grid min-h-dvh place-items-center bg-neutral-50 p-lg text-center">
        <div className="max-w-md rounded-xl bg-white p-lg shadow-md">
          <h1 className="text-lg font-extrabold text-neutral-900">
            Compte en cours de finalisation
          </h1>
          <p className="mt-md text-sm text-neutral-600">
            Ton compte chauffeur n&apos;a pas encore de fiche opérationnelle. Contacte l&apos;équipe
            TamCar pour finaliser ton onboarding.
          </p>
        </div>
      </main>
    );
  }

  return (
    <DriverHome
      driverName={profile.full_name}
      initialIsOnline={driverRow.is_online}
      hasVehicle={driverRow.current_vehicle_id !== null}
    />
  );
}
