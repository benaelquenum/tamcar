'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function approvePlace(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('verify_place', { place_id: id });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('approvePlace error:', error.message);
  }
  revalidatePath('/admin/places');
}

export async function rejectPlace(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('reject_place', { place_id: id });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('rejectPlace error:', error.message);
  }
  revalidatePath('/admin/places');
}

// Ajout direct par l'admin : source 'admin', vérifié d'office → visible
// immédiatement dans l'autocomplete client avec le badge TamCar vérifié.
// Coordonnées attendues au format Google Maps « lat, lng » (clic droit
// sur Google Maps → copier les coordonnées).
export async function addPlace(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const city = String(formData.get('city') || '').trim() || 'Cotonou';
  const district = String(formData.get('district') || '').trim() || null;
  const categoryGroup = String(formData.get('category_group') || '').trim() || null;
  const coords = String(formData.get('coords') || '').trim();

  const m = coords.match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/);
  if (!name || !m) return;
  const lat = parseFloat(m[1].replace(',', '.'));
  const lng = parseFloat(m[2].replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  // Garde-fou Bénin : lat 6-13, lng 0.7-4 (évite l'inversion lat/lng)
  if (lat < 5.5 || lat > 13 || lng < 0.5 || lng > 4.5) return;

  const supabase = createServerSupabase();
  const { error } = await supabase.from('places').insert({
    name,
    city,
    district,
    category_group: categoryGroup,
    location: `POINT(${lng} ${lat})`,
    source: 'admin',
    verified: true,
    verified_at: new Date().toISOString(),
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('addPlace error:', error.message);
  }
  revalidatePath('/admin/places');
}

export async function deletePlace(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.from('places').delete().eq('id', id);
  if (error) {
    // eslint-disable-next-line no-console
    console.error('deletePlace error:', error.message);
  }
  revalidatePath('/admin/places');
}
