import { notFound, redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase-server';
import { DriverRideView, type DriverRideForView } from './DriverRideView';

export default async function DriverRideDetail({ params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'driver' && profile.role !== 'admin') redirect('/');

  const supabase = createServerSupabase();

  const { data: ride, error } = await supabase
    .from('rides_view')
    .select(
      'id, status, driver_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, distance_km, duration_min, price_total_fcfa, driver_share_fcfa, driver_rachat_fcfa, client_id',
    )
    .eq('id', params.id)
    .single();

  if (error || !ride) notFound();

  // Récupère les infos client
  const { data: client } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', ride.client_id)
    .single();

  const initialRide: DriverRideForView = {
    id: ride.id,
    status: ride.status,
    pickup_address: ride.pickup_address,
    pickup_lat: ride.pickup_lat,
    pickup_lng: ride.pickup_lng,
    dropoff_address: ride.dropoff_address,
    dropoff_lat: ride.dropoff_lat,
    dropoff_lng: ride.dropoff_lng,
    distance_km: ride.distance_km,
    duration_min: ride.duration_min,
    price_total_fcfa: ride.price_total_fcfa,
    driver_share_fcfa: ride.driver_share_fcfa,
    driver_rachat_fcfa: ride.driver_rachat_fcfa,
    client_full_name: client?.full_name ?? null,
    client_phone: client?.phone ? `+${client.phone.replace(/^\+/, '')}` : null,
  };

  return <DriverRideView initialRide={initialRide} />;
}
