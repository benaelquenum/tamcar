'use server';

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

export type RequestRentalInput = {
  starts_at: string;
  hours: number;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  notes?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
};

/**
 * Demande de location VIP avec chauffeur. En cas d'échec on RETOURNE l'erreur
 * (Next masque le message des exceptions de server action en production).
 */
export async function requestRentalAction(input: RequestRentalInput): Promise<{ error: string } | void> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.rpc('request_vehicle_rental', {
    p_starts_at: input.starts_at,
    p_hours: input.hours,
    p_pickup_address: input.pickup_address,
    p_pickup_lat: input.pickup_lat,
    p_pickup_lng: input.pickup_lng,
    p_notes: input.notes ?? null,
    p_contact_name: input.contact_name ?? null,
    p_contact_phone: input.contact_phone ?? null,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('request_vehicle_rental error:', error.message);
    if (/schema cache|could not find the function/i.test(error.message)) {
      return { error: 'La location VIP arrive très bientôt. Réessayez dans quelques minutes.' };
    }
    return { error: error.message.trim() || 'La demande n’a pas pu être enregistrée.' };
  }

  redirect('/reservations?rental=requested');
}
