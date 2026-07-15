import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { RideView, type RideForView } from './RideView';

export default async function RideDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('rides_view')
    .select(
      'id, client_id, driver_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, distance_km, duration_min, price_total_fcfa, status, payment_method, requested_at',
    )
    .eq('id', params.id)
    .single();

  if (error || !data) notFound();

  return <RideView initialRide={data as RideForView} />;
}
