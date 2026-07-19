'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';

export async function createVehicle(formData: FormData) {
  const plate = String(formData.get('plate') || '').trim();
  const brand = String(formData.get('brand') || '').trim();
  const model = String(formData.get('model') || '').trim();
  const category = String(formData.get('category') || 'essentiel');
  const formula = String(formData.get('formula') || 'cession');
  const dealer_partner_id = String(formData.get('dealer_partner_id') || '') || null;
  const owner_profile_id = String(formData.get('owner_profile_id') || '') || null;
  const year_raw = String(formData.get('year') || '').trim();
  const color = String(formData.get('color') || '').trim();
  const seats = parseInt(String(formData.get('seats') || '4'), 10);

  if (!plate || !brand || !model) throw new Error('Plaque, marque, modèle obligatoires');
  if (formula === 'cession' && !dealer_partner_id) {
    throw new Error('Formule cession : concessionnaire obligatoire');
  }
  if (formula === 'proprietaire' && !owner_profile_id) {
    throw new Error('Formule propriétaire : chauffeur propriétaire obligatoire');
  }

  // Si formule propriétaire, on s'assure que le chauffeur choisi est bien
  // marqué en 'proprietaire' — sinon on le bascule (split 80/20 à sa faveur).
  if (formula === 'proprietaire' && owner_profile_id) {
    const admin = createAdminSupabase();
    await admin
      .from('drivers')
      .update({ application_type: 'proprietaire', updated_at: new Date().toISOString() })
      .eq('profile_id', owner_profile_id);
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_register_vehicle', {
    p_plate: plate,
    p_brand: brand,
    p_model: model,
    p_category: category,
    p_formula: formula,
    p_dealer_partner_id: formula === 'cession' ? dealer_partner_id : null,
    p_owner_profile_id: formula === 'proprietaire' ? owner_profile_id : null,
    p_year: year_raw ? parseInt(year_raw, 10) : null,
    p_color: color || null,
    p_seats: seats,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/vehicles');
}

export async function activateVehicle(formData: FormData) {
  const id = String(formData.get('id') || '');
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_activate_vehicle', { p_vehicle_id: id });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/vehicles');
}

export async function assignVehicle(formData: FormData) {
  const vehicle_id = String(formData.get('vehicle_id') || '');
  const driver_id = String(formData.get('driver_id') || '');
  if (!vehicle_id || !driver_id) throw new Error('Véhicule et chauffeur requis');

  const admin = createAdminSupabase();

  // Récupère la formule du véhicule pour synchroniser le driver si nécessaire.
  const { data: v } = await admin
    .from('vehicles')
    .select('dealer_partner_id, owner_profile_id')
    .eq('id', vehicle_id)
    .single();
  if (!v) throw new Error('Véhicule introuvable');

  const vehicleFormula = v.dealer_partner_id ? 'cession' : 'proprietaire';
  const { data: d } = await admin
    .from('drivers')
    .select('profile_id, application_type')
    .eq('id', driver_id)
    .single();
  if (!d) throw new Error('Chauffeur introuvable');

  // Bascule automatiquement la formule du chauffeur si nécessaire, puis
  // pour Propriétaire on doit aussi passer owner_profile_id = driver.profile_id
  // sur le véhicule (contrainte formule = propriétaire ↔ owner_profile_id set).
  if (d.application_type !== vehicleFormula) {
    await admin
      .from('drivers')
      .update({ application_type: vehicleFormula, updated_at: new Date().toISOString() })
      .eq('id', driver_id);
  }
  if (vehicleFormula === 'proprietaire' && v.owner_profile_id !== d.profile_id) {
    await admin
      .from('vehicles')
      .update({ owner_profile_id: d.profile_id, updated_at: new Date().toISOString() })
      .eq('id', vehicle_id);
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_assign_vehicle_to_driver', {
    p_driver_id: driver_id,
    p_vehicle_id: vehicle_id,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/vehicles');
  revalidatePath('/admin/drivers');
}
