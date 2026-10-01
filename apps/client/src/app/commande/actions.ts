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
  passenger_name?: string | null;
  passenger_phone?: string | null;
  /** Course directe : le chauffeur visé (un chauffeur que le client a déjà eu). */
  target_driver_id?: string | null;
  /** Arrêts demandés dès la commande, dans l'ordre. */
  stops?: Array<{ address: string; lat: number; lng: number }>;
};

export type CreateRideResult = { error: string };

/**
 * Crée la course puis redirige. En cas d'échec on RETOURNE l'erreur au lieu
 * de la lancer : Next efface le message des exceptions de server action en
 * production (« An error occurred in the Server Components render… »), ce qui
 * privait le client de la vraie raison — heure de départ trop proche,
 * destination hors zone, code promo invalide…
 */
export async function createRideAction(
  input: CreateRideInput,
): Promise<CreateRideResult | void> {
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
    p_passenger_name: input.passenger_name ?? null,
    p_passenger_phone: input.passenger_phone ?? null,
    // Seulement quand ils servent : une base qui n'a pas encore la version à
    // 18 paramètres de create_ride continue d'accepter les commandes simples.
    ...(input.target_driver_id ? { p_target_driver_id: input.target_driver_id } : {}),
    ...(input.stops && input.stops.length > 0 ? { p_stops: input.stops } : {}),
  });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('create_ride error:', error?.message, error?.details, error?.hint);
    // Course directe ou arrêts demandés alors que la base n'a pas encore la
    // version à 18 paramètres : on le dit simplement.
    if (error && /schema cache|could not find the function/i.test(error.message) &&
        (input.target_driver_id || (input.stops && input.stops.length > 0))) {
      return {
        error:
          'Les arrêts et la commande directe sont en cours de mise en service. Réessayez dans quelques minutes, ou commandez sans arrêt.',
      };
    }
    return {
      error:
        error?.message?.trim() ||
        'Erreur inconnue lors de la création de la course',
    };
  }

  const ride = data as { id: string; status: string };
  // Une réservation enchaîne directement sur la recherche de chauffeur —
  // même parcours qu'une course immédiate, l'écran suit la recherche en
  // direct et propose les options si personne ne prend au bout d'une minute.
  if (ride.status === 'scheduled') {
    redirect(`/reservation/${ride.id}`);
  }
  redirect(`/ride/${ride.id}`);
}
