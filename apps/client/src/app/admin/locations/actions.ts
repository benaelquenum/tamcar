'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

// Les fonctions SQL refont elles-mêmes le contrôle « équipe TamCar » ; ces
// actions ne font que les appeler et RETOURNENT l'erreur (Next masque le message
// des exceptions de server action en production).

export type ClientHit = { id: string; full_name: string; phone: string | null };

export type AvailableDriver = {
  driver_id: string;
  full_name: string;
  phone: string | null;
  vehicle_id: string;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  conflict: string | null;
};

export type ActionResult = { error?: string };

export async function findClientAction(query: string): Promise<ClientHit[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('admin_find_client', { p_query: query });
  if (error || !Array.isArray(data)) return [];
  return data as ClientHit[];
}

export async function availableDriversAction(
  startsAt: string,
  endsAt: string,
  excludeId?: string | null,
): Promise<AvailableDriver[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc('admin_available_rental_drivers', {
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_category: 'premium',
    p_exclude: excludeId ?? null,
  });
  if (error || !Array.isArray(data)) return [];
  return data as AvailableDriver[];
}

export type CreateRentalInput = {
  client_id: string;
  starts_at: string;
  ends_at: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  driver_id: string;
  price_fcfa?: number | null;
  payment_mode: 'prepaid';
  paid_fcfa?: number | null;
  notes?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
};

export async function createRentalAction(input: CreateRentalInput): Promise<ActionResult> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_create_vehicle_rental', {
    p_client_id: input.client_id,
    p_starts_at: input.starts_at,
    p_ends_at: input.ends_at,
    p_pickup_address: input.pickup_address,
    p_pickup_lat: input.pickup_lat,
    p_pickup_lng: input.pickup_lng,
    p_driver_id: input.driver_id,
    p_price_fcfa: input.price_fcfa ?? null,
    p_payment_mode: input.payment_mode,
    p_paid_fcfa: input.paid_fcfa ?? 0,
    p_notes: input.notes ?? null,
    p_contact_name: input.contact_name ?? null,
    p_contact_phone: input.contact_phone ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/locations');
  return {};
}

export async function confirmRentalAction(
  id: string,
  driverId: string,
  priceFcfa: number | null,
): Promise<ActionResult> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_confirm_vehicle_rental', {
    p_id: id,
    p_driver_id: driverId,
    p_price_fcfa: priceFcfa,
    p_payment_mode: 'prepaid',
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/locations');
  return {};
}

export async function updateRentalAction(
  id: string,
  patch: { price_fcfa?: number | null; paid_fcfa?: number | null; notes?: string | null },
): Promise<ActionResult> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_update_vehicle_rental', {
    p_id: id,
    p_price_fcfa: patch.price_fcfa ?? null,
    p_payment_mode: null,
    p_paid_fcfa: patch.paid_fcfa ?? null,
    p_notes: patch.notes ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/locations');
  return {};
}

export async function cancelRentalAdminAction(id: string, reason: string): Promise<ActionResult> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_cancel_vehicle_rental', { p_id: id, p_reason: reason || null });
  if (error) return { error: error.message };
  revalidatePath('/admin/locations');
  return {};
}

/** Valide les kilomètres (après contrôle des photos du compteur) : recalcule le supplément. */
export async function validateKmAction(id: string, odometerStart: number, odometerEnd: number): Promise<ActionResult> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_validate_rental_km', {
    p_id: id,
    p_odometer_start: odometerStart,
    p_odometer_end: odometerEnd,
  });
  if (error) return { error: error.message };
  revalidatePath('/admin/locations');
  return {};
}

/** Le supplément kilométrique a été encaissé : il suit le partage habituel (chauffeur, concessionnaire, TamCar). */
export async function settleExtraAction(id: string): Promise<ActionResult> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_settle_rental_extra', { p_id: id });
  if (error) return { error: error.message };
  revalidatePath('/admin/locations');
  return {};
}
