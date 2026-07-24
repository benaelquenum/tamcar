'use client';

import { useState } from 'react';
import { CheckIcon } from '@/components/Icon';

export function ParrainerClient({ code, reward }: { code: string; reward: number }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  async function share() {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://tamcar.app';
    const url = `${origin}/login?ref=${encodeURIComponent(code)}`;
    const text = `Utilise mon code ${code} sur TamCar et on gagne chacun ${reward} F crédits. ${url}`;
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
        className="flex flex-1 items-center justify-center gap-xs rounded-full bg-white/95 px-md py-sm text-xs font-bold text-primary-700 shadow-sm"
      >
        {copied ? (
          <>
            <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
            Copié
          </>
        ) : (
          'Copier le code'
        )}
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
