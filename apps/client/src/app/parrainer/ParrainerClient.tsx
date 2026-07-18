'use client';

import { useState } from 'react';

export function ParrainerClient({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  async function share() {
    const text = `Utilise mon code ${code} sur TamCar et on gagne chacun 500 F crédits. https://tamcar-client.vercel.app/parrainer`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Rejoins-moi sur TamCar', text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch { /* ignore user cancel */ }
  }

  return (
    <div className="mt-md flex gap-sm">
      <button
        type="button"
        onClick={copy}
        className="flex-1 rounded-full bg-white/95 px-md py-sm text-xs font-bold text-primary-700 shadow-sm"
      >
        {copied ? '✓ Copié' : 'Copier le code'}
      </button>
      <button
        type="button"
        onClick={share}
        className="flex-1 rounded-full bg-white/20 px-md py-sm text-xs font-bold text-white ring-1 ring-white/40 backdrop-blur"
      >
        Partager
      </button>
    </div>
  );
}
