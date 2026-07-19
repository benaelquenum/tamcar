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
      'id, status, driver_id, vehicle_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, distance_km, duration_min, price_total_fcfa, driver_share_fcfa, driver_rachat_fcfa, client_id, completion_requested_at, completion_recomputed_price_fcfa, completion_distance_from_dropoff_m, completion_auto_accept_at',
    )
    .eq('id', params.id)
    .single();

  if (error || !ride) notFound();

  // Récupère les infos client
  const { data: client } = await supabase
    .from('profiles')
    .select('full_name, phone, avatar_url')
    .eq('id', ride.client_id)
    .single();

  // Catégorie du véhicule qui fait la course (pour le pin sur la carte)
  let vehicleCategory: string | null = null;
  if (ride.vehicle_id) {
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('category')
      .eq('id', ride.vehicle_id)
      .single();
    vehicleCategory = vehicle?.category ?? null;
  }

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
    client_avatar_url: client?.avatar_url ?? null,
    completion_requested_at: ride.completion_requested_at ?? null,
    completion_recomputed_price_fcfa: ride.completion_recomputed_price_fcfa ?? null,
    completion_distance_from_dropoff_m: ride.completion_distance_from_dropoff_m ?? null,
    completion_auto_accept_at: ride.completion_auto_accept_at ?? null,
    vehicle_category: vehicleCategory,
  };

  return <DriverRideView initialRide={initialRide} />;
}
