'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

export async function createBanner(formData: FormData) {
  const title = String(formData.get('title') || '').trim();
  const subtitle = String(formData.get('subtitle') || '').trim();
  const image_url = String(formData.get('image_url') || '').trim();
  const link_url = String(formData.get('link_url') || '').trim();
  const cta_text = String(formData.get('cta_text') || '').trim();
  const gradient = String(formData.get('gradient') || 'from-primary-500 to-primary-700').trim();
  const display_order = parseInt(String(formData.get('display_order') || '0'), 10);

  if (!title) throw new Error('Titre obligatoire');
  const supabase = createServerSupabase();
  const { error } = await supabase.from('home_banners').insert({
    title,
    subtitle: subtitle || null,
    image_url: image_url || null,
    link_url: link_url || null,
    cta_text: cta_text || null,
    gradient,
    display_order,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/banners');
  revalidatePath('/');
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
}

export async function deleteBanner(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.from('home_banners').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/banners');
  revalidatePath('/');
}
