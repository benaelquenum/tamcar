'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';

export async function approveAppointment(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;

  const dealerCompanyName = String(formData.get('dealer_company_name') || '').trim();
  const dealerRccm = String(formData.get('dealer_rccm') || '').trim();
  const vehiclePlate = String(formData.get('vehicle_plate') || '').trim().toUpperCase();
  const vehicleBrand = String(formData.get('vehicle_brand') || '').trim();
  const vehicleModel = String(formData.get('vehicle_model') || '').trim();
  const vehicleYearRaw = String(formData.get('vehicle_year') || '').trim();
  const vehicleYear = vehicleYearRaw ? parseInt(vehicleYearRaw, 10) : new Date().getFullYear();
  const vehicleColor = String(formData.get('vehicle_color') || '').trim();
  const vehicleSeats = parseInt(String(formData.get('vehicle_seats') || '5'), 10);
  const vehicleCategory = String(formData.get('vehicle_category') || 'confort');
  const notes = String(formData.get('notes') || '').trim();
  const photoUrl = String(formData.get('photo_url') || '').trim();

  if (!dealerCompanyName || !vehiclePlate || !vehicleBrand || !vehicleModel) {
    throw new Error('Champs obligatoires manquants (dealer, plaque, marque, modèle)');
  }

  const supabase = createServerSupabase();

  // Set avatar_url en amont pour que la promotion role='driver' garde la photo
  if (photoUrl) {
    const { data: app } = await supabase
      .from('driver_appointments')
      .select('profile_id')
      .eq('id', id)
      .single();
    if (app?.profile_id) {
      await supabase
        .from('profiles')
        .update({ avatar_url: photoUrl })
        .eq('id', app.profile_id);
    }
  }

  const { error } = await supabase.rpc('admin_approve_appointment', {
    app_id: id,
    p_dealer_company_name: dealerCompanyName,
    p_dealer_rccm: dealerRccm || null,
    p_vehicle_plate: vehiclePlate,
    p_vehicle_brand: vehicleBrand,
    p_vehicle_model: vehicleModel,
    p_vehicle_year: vehicleYear,
    p_vehicle_color: vehicleColor || null,
    p_vehicle_seats: vehicleSeats,
    p_vehicle_category: vehicleCategory,
    p_notes: notes || null,
  });
  if (error) throw new Error(error.message);

  // Créer l'ADR pour ce concessionnaire (formule Cession uniquement)
  const adrPaid = String(formData.get('adr_paid') || '') === 'on';
  if (adrPaid) {
    const { data: app } = await supabase
      .from('driver_appointments')
      .select('profile_id, application_type')
      .eq('id', id)
      .single();
    if (app?.application_type === 'cession' && app.profile_id) {
      const { data: dealer } = await supabase
        .from('dealer_partners')
        .select('id')
        .eq('profile_id', app.profile_id)
        .single();
      if (dealer?.id) {
        await supabase.rpc('create_dealer_advance', {
          p_dealer_partner_id: dealer.id,
          p_amount_fcfa: 100000,
        });
      }
    }
  }

  revalidatePath('/admin/candidatures');
  revalidatePath('/admin/dealer-advances');
  redirect('/admin/candidatures');
}

export async function rejectAppointment(formData: FormData) {
  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!id || reason.length < 3) return;

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_reject_appointment', {
    app_id: id,
    reason,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/candidatures');
  redirect('/admin/candidatures');
}

export async function markNoShow(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_mark_no_show', { app_id: id });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/candidatures');
  redirect('/admin/candidatures');
}
