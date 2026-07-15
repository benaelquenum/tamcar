import { supabase } from './supabase';

export type VehicleCategory = 'essentiel' | 'confort' | 'premium';

export type CorridorDetail = {
  from_checkpoint: string;
  to_checkpoint: string;
  pre_km: number;
  pre_price_fcfa: number;
  fixed_price_fcfa: number;
  post_km: number;
  post_price_fcfa: number;
  is_night: boolean;
};

export type PriceQuote = {
  price_total_fcfa: number;
  driver_cash_fcfa: number;
  driver_rachat_fcfa: number;
  dealer_share_fcfa: number;
  platform_share_fcfa: number;
  is_corridor: boolean;
  corridor_detail: CorridorDetail | null;
};

export type PriceParams = {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number;
  duration_min: number;
  p_category: VehicleCategory;
  is_night?: boolean;
  with_ac?: boolean;
};

/**
 * Calcule le prix + ventilation revenue-share d'une course via la fonction
 * Postgres `compute_price` déployée sur Supabase.
 *
 * Whiteliste explicite des paramètres — évite d'envoyer par erreur des
 * champs UI (label, etc.) qui feraient rater la résolution de signature RPC.
 */
export async function computePrice(params: PriceParams): Promise<PriceQuote | null> {
  const { data, error } = await supabase.rpc('compute_price', {
    pickup_lat: params.pickup_lat,
    pickup_lng: params.pickup_lng,
    dropoff_lat: params.dropoff_lat,
    dropoff_lng: params.dropoff_lng,
    distance_km: params.distance_km,
    duration_min: params.duration_min,
    p_category: params.p_category,
    is_night: params.is_night ?? false,
    with_ac: params.with_ac ?? false,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('compute_price rpc error:', error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as PriceQuote | null;
}

type Trajet = {
  label: string;
  params: Omit<PriceParams, 'p_category' | 'is_night' | 'with_ac'>;
};

/**
 * Presets de trajets pour les preview de prix côté home
 * (en attendant la saisie utilisateur + géocodage Mapbox).
 * Séparation stricte label (UI) vs params (RPC) pour éviter d'envoyer
 * accidentellement label à Postgres.
 */
export const DEMO_TRAJETS: Record<'corridorTokpaAssPn' | 'urbainCourt', Trajet> = {
  corridorTokpaAssPn: {
    label: 'Corridor Cotonou ↔ Porto-Novo',
    params: {
      pickup_lat: 6.3654,
      pickup_lng: 2.4258,
      dropoff_lat: 6.497,
      dropoff_lng: 2.603,
      distance_km: 30,
      duration_min: 45,
    },
  },
  urbainCourt: {
    label: 'Course urbaine 5 km',
    params: {
      pickup_lat: 6.4,
      pickup_lng: 2.4,
      dropoff_lat: 6.43,
      dropoff_lng: 2.43,
      distance_km: 5,
      duration_min: 15,
    },
  },
};
