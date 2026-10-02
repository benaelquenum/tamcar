'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';

const MAX_IMAGE_BYTES = 5_242_880;
const PUBLIC_MARK = '/storage/v1/object/public/banners/';

function refresh() {
  revalidatePath('/admin/banners');
  revalidatePath('/');
  revalidatePath('/dealer');
}

/** Retour à la page avec un message (Next masque le texte des exceptions de server action en production). */
function fail(message: string): never {
  redirect(`/admin/banners?err=${encodeURIComponent(message.slice(0, 200))}#accueil`);
}

/** Chemin du fichier dans le bucket « banners » d'après son URL publique (null = fichier du site, pas du bucket). */
function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const i = url.indexOf(PUBLIC_MARK);
  return i === -1 ? null : decodeURIComponent(url.slice(i + PUBLIC_MARK.length).split('?')[0]);
}

/** Téléverse l'image dans le bucket sous un NOM UNIQUE (jamais de cache périmé) et renvoie son URL publique. */
async function uploadBannerImage(file: File, audience: string): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image trop lourde (max 5 Mo)');
  const admin = createAdminSupabase();
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${audience}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await admin.storage.from('banners').upload(path, file, {
    contentType: file.type || 'image/png',
    upsert: false,
  });
  if (upErr) throw new Error('Téléversement image : ' + upErr.message);
  return admin.storage.from('banners').getPublicUrl(path).data.publicUrl;
}

async function removeStoredImage(url: string | null): Promise<void> {
  const path = storagePathFromUrl(url);
  if (!path) return;
  const admin = createAdminSupabase();
  await admin.storage.from('banners').remove([path]);
}

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
    image_url = await uploadBannerImage(file, audience);
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
  refresh();
}

export async function toggleBannerActive(formData: FormData) {
  const id = String(formData.get('id') || '');
  const next = String(formData.get('next') || '') === 'true';
  if (!id) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.from('home_banners').update({ is_active: next }).eq('id', id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteBanner(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const supabase = createServerSupabase();
  const { data: row } = await supabase.from('home_banners').select('image_url').eq('id', id).maybeSingle();
  const { error } = await supabase.from('home_banners').delete().eq('id', id);
  if (error) throw new Error(error.message);
  // L'image téléversée n'a plus d'utilité (les fichiers du site, eux, ne sont pas touchés).
  await removeStoredImage((row as { image_url: string | null } | null)?.image_url ?? null);
  refresh();
}

// ------------------------------------------------------------
// Contrôle de l'accueil client
// ------------------------------------------------------------

/** Remplace l'image d'une bannière : nouvelle image sous un nouveau nom, l'ancienne est supprimée. */
export async function replaceBannerImage(formData: FormData) {
  const id = String(formData.get('id') || '');
  const file = formData.get('image_file');
  if (!id) return;
  if (!(file instanceof File) || file.size === 0) fail('Choisissez une image.');

  const supabase = createServerSupabase();
  const { data: row, error: readErr } = await supabase
    .from('home_banners')
    .select('image_url, audience')
    .eq('id', id)
    .maybeSingle();
  if (readErr || !row) fail('Bannière introuvable.');
  const current = row as { image_url: string | null; audience: string };

  let url: string;
  try {
    url = await uploadBannerImage(file as File, current.audience);
  } catch (e) {
    fail(e instanceof Error ? e.message : 'Téléversement impossible.');
  }
  const { error } = await supabase.from('home_banners').update({ image_url: url }).eq('id', id);
  if (error) fail(error.message);
  await removeStoredImage(current.image_url);
  refresh();
}

/** Modifie le titre (lu par les lecteurs d'écran) et le lien d'une bannière. */
export async function updateBanner(formData: FormData) {
  const id = String(formData.get('id') || '');
  const title = String(formData.get('title') || '').trim();
  const link_url = String(formData.get('link_url') || '').trim();
  if (!id) return;
  if (!title) fail('Le titre est obligatoire.');
  if (link_url && !link_url.startsWith('/') && !/^https?:\/\//i.test(link_url)) {
    fail('Le lien doit commencer par « / » (page de l’app) ou « https:// ».');
  }
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('home_banners')
    .update({ title, link_url: link_url || null })
    .eq('id', id);
  if (error) fail(error.message);
  refresh();
}

/** Monte ou descend une bannière dans l'ordre d'affichage de son audience. */
export async function moveBanner(formData: FormData) {
  const id = String(formData.get('id') || '');
  const dir = String(formData.get('dir') || '') === 'up' ? -1 : 1;
  if (!id) return;
  const supabase = createServerSupabase();
  const { data: me } = await supabase.from('home_banners').select('audience').eq('id', id).maybeSingle();
  if (!me) return;
  const { data } = await supabase
    .from('home_banners')
    .select('id, display_order')
    .eq('audience', (me as { audience: string }).audience)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  const list = (data ?? []) as Array<{ id: string; display_order: number }>;
  const i = list.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  // Ordres renumérotés 10, 20, 30… : plus d'égalités ambiguës.
  for (let k = 0; k < list.length; k += 1) {
    const order = (k + 1) * 10;
    if (list[k].display_order !== order) {
      const { error } = await supabase.from('home_banners').update({ display_order: order }).eq('id', list[k].id);
      if (error) fail(error.message);
    }
  }
  refresh();
}

/**
 * Reprend dans l'admin les deux bannières que l'accueil affichait jusque-là (fichiers du site),
 * pour pouvoir les remplacer, les réordonner ou les désactiver sans passer par un déploiement.
 * Sans effet s'il existe déjà des bannières client.
 */
export async function importDefaultClientBanners() {
  const supabase = createServerSupabase();
  const { count } = await supabase
    .from('home_banners')
    .select('id', { count: 'exact', head: true })
    .eq('audience', 'client');
  if ((count ?? 0) > 0) fail('Il existe déjà des bannières client.');
  const { error } = await supabase.from('home_banners').insert([
    {
      audience: 'client',
      title: 'Ta course est claire, ta course éclair.',
      image_url: '/banners/accueil-1.webp',
      link_url: '/commande',
      display_order: 10,
      is_active: true,
    },
    {
      audience: 'client',
      title: 'TamPass : plus de trajets, plus d’avantages.',
      image_url: '/banners/accueil-2.webp',
      link_url: '/tampass',
      display_order: 20,
      is_active: true,
    },
  ]);
  if (error) fail(error.message);
  refresh();
}
