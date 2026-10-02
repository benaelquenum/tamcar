'use client';

import { useRef, useState } from 'react';

// Largeur maximale utile : un téléphone affiche la bannière sur ~400 px à 3× de densité.
const MAX_WIDTH = 1400;
// Ratio de l'accueil client (aspect-[5/2]) : l'image est recadrée au centre si elle diffère.
const TARGET_RATIO = 5 / 2;

function fmtSize(bytes: number): string {
  return bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

/**
 * Champ fichier d'une bannière. L'image choisie est réduite AVANT l'envoi (1400 px de large
 * au plus, WebP) : une bannière de 1,3 Mo devient ~100 Ko, ce qui compte pour la data des clients.
 * Les GIF (animés) sont envoyés tels quels. Le fichier traité remplace celui du champ : le
 * formulaire s'envoie normalement.
 */
export function BannerImageInput({
  name = 'image_file',
  required = false,
  className = '',
}: {
  name?: string;
  required?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<{ text: string; warn: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) {
      setInfo(null);
      return;
    }
    if (file.type === 'image/gif') {
      setInfo({ text: `GIF envoyé tel quel (${fmtSize(file.size)}).`, warn: file.size > 1_500_000 });
      return;
    }
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_WIDTH / bitmap.width);
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close?.();

      let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.84));
      let type = 'image/webp';
      let ext = 'webp';
      if (!blob || blob.type !== 'image/webp') {
        blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
        type = 'image/jpeg';
        ext = 'jpg';
      }
      if (!blob) throw new Error('encode');

      // On ne remplace le fichier que si la version traitée est plus légère.
      if (blob.size < file.size) {
        const dt = new DataTransfer();
        dt.items.add(new File([blob], `banniere.${ext}`, { type }));
        input.files = dt.files;
      }
      const used = Math.min(blob.size, file.size);
      const ratio = w / h;
      const off = Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO > 0.05;
      setInfo({
        text:
          `${w}×${h} px · ${fmtSize(used)} (original ${fmtSize(file.size)})` +
          (off ? ` · format ${ratio.toFixed(2)}:1, l’accueil affiche du 2,5:1 : l’image sera recadrée au centre.` : ''),
        warn: off,
      });
    } catch {
      // Format que le navigateur ne décode pas : envoi tel quel, plafonné côté serveur.
      setInfo({ text: `Envoyée telle quelle (${fmtSize(file.size)}).`, warn: file.size > 1_500_000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <input
        ref={ref}
        type="file"
        name={name}
        required={required}
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={onChange}
        className="w-full cursor-pointer rounded-md bg-neutral-100 text-sm text-neutral-700 ring-1 ring-neutral-200 file:mr-md file:cursor-pointer file:border-0 file:bg-primary-500 file:px-md file:py-sm file:text-xs file:font-bold file:text-white hover:file:brightness-110"
      />
      {busy && <span className="mt-xs block text-[10px] text-neutral-500">Optimisation de l’image…</span>}
      {!busy && info && (
        <span className={`mt-xs block text-[10px] font-semibold ${info.warn ? 'text-warning' : 'text-success'}`}>
          {info.text}
        </span>
      )}
    </div>
  );
}
