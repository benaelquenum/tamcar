'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/lib/session';
import { createAdminSupabase } from '@/lib/supabase-admin';

export type SavePortraitState = { ok: boolean; error?: string; url?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 600 * 1024;

/**
 * Enregistre la photo d'identité traitée (JPEG 800 × 800, produite dans le navigateur par
 * lib/portrait.ts) comme photo officielle d'un chauffeur : elle remplace son avatar, que les clients
 * voient pendant la course. Réservé à l'admin (les actions serveur sont des points d'entrée publics :
 * le rôle est revérifié ici avant d'utiliser la clé de service).
 */
export async function savePortraitAction(formData: FormData): Promise<SavePortraitState> {
  try {
    const me = await getCurrentProfile();
    if (!me || me.role !== 'admin') throw new Error('Non autorisé');

    const profileId = String(formData.get('profile_id') || '');
    const driverId = String(formData.get('driver_id') || '');
    if (!UUID.test(profileId)) throw new Error('Chauffeur introuvable');

    const photo = formData.get('photo');
    if (!(photo instanceof File)) throw new Error('Photo manquante');
    if (photo.type !== 'image/jpeg') throw new Error('Format JPEG attendu');
    if (photo.size === 0 || photo.size > MAX_BYTES) throw new Error('Photo trop lourde ou vide');
    const bytes = new Uint8Array(await photo.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Fichier JPEG invalide');

    const admin = createAdminSupabase();
    const { data: prof } = await admin.from('profiles').select('id').eq('id', profileId).maybeSingle();
    if (!prof) throw new Error('Profil introuvable');

    const path = `${profileId}.jpg`;
    const { error: upErr } = await admin.storage
      .from('client-avatars')
      .upload(path, bytes, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (upErr) throw new Error(`Envoi de la photo : ${upErr.message}`);
    // anciennes versions éventuelles (autres extensions) : on les retire pour ne laisser qu'une photo
    await admin.storage.from('client-avatars').remove([`${profileId}.png`, `${profileId}.webp`]);

    const { data } = admin.storage.from('client-avatars').getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`;
    const { error: updErr } = await admin
      .from('profiles')
      .update({ avatar_url: url, avatar_verified_at: new Date().toISOString() })
      .eq('id', profileId);
    if (updErr) throw new Error(`Mise à jour du profil : ${updErr.message}`);

    if (UUID.test(driverId)) revalidatePath(`/admin/drivers/${driverId}`);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
