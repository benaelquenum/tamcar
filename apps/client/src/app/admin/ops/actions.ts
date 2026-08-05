'use server';

import { revalidatePath } from 'next/cache';
import { formatBeninPhone } from '@/lib/phone';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Nomme (ou remplace) le responsable opérations d'une ville.
 * Le profil est retrouvé par son numéro de téléphone : l'admin n'a pas à
 * manipuler d'UUID, et le rôle du compte n'entre pas en ligne de compte
 * (un chauffeur peut être responsable opérations).
 */
export async function setCityManagerAction(formData: FormData) {
  const rawPhone = String(formData.get('phone') || '').trim();
  const city = String(formData.get('city') || '').trim();
  const rate = Number(formData.get('rate') || 3);
  const cap = Number(formData.get('cap') || 150000);

  if (!city) throw new Error('Ville requise');
  const phone = formatBeninPhone(rawPhone);
  if (!phone) throw new Error(`Numéro invalide : ${rawPhone}`);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Taux invalide');
  if (!Number.isFinite(cap) || cap < 0) throw new Error('Plafond invalide');

  const supabase = createServerSupabase();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error(`Aucun compte TamCar avec le numéro ${phone}`);

  const { error } = await supabase.rpc('admin_set_city_manager', {
    p_profile_id: profile.id,
    p_city: city,
    p_rate: rate,
    p_cap: Math.round(cap),
  });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/ops');
}

/** Met fin au mandat d'un responsable (la ville se retrouve sans responsable). */
export async function endCityManagerAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('Nomination requise');

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('admin_end_city_manager', { p_id: id });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/ops');
}
