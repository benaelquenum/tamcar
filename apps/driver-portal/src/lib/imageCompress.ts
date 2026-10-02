'use client';

/**
 * Réduit une photo avant envoi : côté long ≤ `maxSide` px, JPEG qualité `quality`.
 * Une photo de téléphone (3-6 Mo) tombe à ~100-250 Ko — la data du chauffeur est comptée.
 * En cas d'échec de décodage (format inattendu), renvoie le fichier d'origine.
 */
export async function compressImage(file: File, maxSide = 1280, quality = 0.72): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  }
}
