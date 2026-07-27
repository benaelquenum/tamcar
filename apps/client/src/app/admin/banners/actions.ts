'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';

export async function createBanner(formData: FormData) {
  const title = String(formData.get('title') || '').trim();
  const subtitle = String(formData.get('subtitle') || '').trim();
  const link_url = String(formData.get('link_url') || '').trim();
  const cta_text = String(formData.get('cta_text') || '').trim();
  const gradient = String(formData.get('gradient') || 'from-primary-500 to-primary-700').trim();
  const display_order = parseInt(String(formData.get('display_order') || '0'), 10);
  const audienceRaw = String(formData.get('audience') || 'client').trim();
  const audience = ['client', 'driver', 'dealer'].includes(audienceRaw) ? audienceRaw : 'client';

  if (!title) throw new Error('Titre obligatoire');

  // Image : téléversement direct du fichier conçu à l'avance → Storage → URL publique.
  let image_url: string | null = null;
  const file = formData.get('image_file');
  if (file instanceof File && file.size > 0) {
    if (file.size > 5_242_880) throw new Error('Image trop lourde (max 5 Mo)');
    const admin = createAdminSupabase();
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${audience}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage.from('banners').upload(path, file, {
      contentType: file.type || 'image/png',
      upsert: false,
    });
    if (upErr) throw new Error('Téléversement image : ' + upErr.message);
    image_url = admin.storage.from('banners').getPublicUrl(path).data.publicUrl;
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from('home_banners').insert({
    title,
    subtitle: subtitle || null,
    image_url: image_url || null,
    link_url: link_url || null,
    cta_text: cta_text || null,
    gradient,
    display_order,
    audience,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/banners');
  revalidatePath('/');
  revalidatePath('/dealer');
}

export async function toggleBannerActive(formData: FormData) {
  const id = String(formData.get('id') || '');
  const next = String(formData.get('next') || '') === 'true';
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.from('home_banners').update({ is_active: next }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/banners');
  revalidatePath('/');
  revalidatePath('/dealer');
}

export async function deleteBanner(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.from('home_banners').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/banners');
  revalidatePath('/');
  revalidatePath('/dealer');
}
