import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { RideView, type RideForView } from './RideView';

export default async function RideDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = createServerSupabase();

  // Utilise la RPC ride_with_driver_details pour récupérer ride + chauffeur + véhicule en 1 appel
  const { data, error } = await supabase.rpc('ride_with_driver_details', {
    ride_id: params.id,
  });

  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) notFound();

  return <RideView initialRide={row as RideForView} />;
}
