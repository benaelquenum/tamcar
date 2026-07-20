'use server';

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import type { VehicleCategory } from '@/lib/pricing';

export type CreateRideInput = {
  category: VehicleCategory;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  distance_km: number;
  duration_min: number;
  is_night?: boolean;
  with_ac?: boolean;
  scheduled_at?: string | null;
  payment_method?: 'cash' | 'mobile_money_mtn' | 'mobile_money_moov' | 'tamcar_credit';
  promo_code?: string | null;
};

export async function createRideAction(input: CreateRideInput) {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data, error } = await supabase.rpc('create_ride', {
    p_category: input.category,
    p_pickup_lat: input.pickup_lat,
    p_pickup_lng: input.pickup_lng,
    p_pickup_address: input.pickup_address,
    p_dropoff_lat: input.dropoff_lat,
    p_dropoff_lng: input.dropoff_lng,
    p_dropoff_address: input.dropoff_address,
    p_distance_km: input.distance_km,
    p_duration_min: input.duration_min,
    p_is_night: input.is_night ?? false,
    p_with_ac: input.with_ac ?? false,
    p_scheduled_at: input.scheduled_at ?? null,
    p_payment_method: input.payment_method ?? 'cash',
    p_promo_code: input.promo_code ?? null,
  });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('create_ride error:', error?.message);
    throw new Error(error?.message ?? 'Erreur inconnue lors de la création de la course');
  }

  const ride = data as { id: string; status: string };
  if (ride.status === 'scheduled') {
    redirect('/history?just_scheduled=1');
  }
  redirect(`/ride/${ride.id}`);
}
