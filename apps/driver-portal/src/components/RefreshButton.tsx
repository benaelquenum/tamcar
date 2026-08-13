'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Rafraîchissement à la demande, disponible sur toutes les pages.
 *
 * `router.refresh()` rejoue les composants serveur en conservant l'état
 * de la page — la carte n'est pas démontée, le GPS n'est pas redemandé,
 * un formulaire en cours n'est pas vidé. C'est ce qu'on veut d'un bouton
 * pressé en pleine course ; un rechargement complet ferait tout perdre.
 *
 * Placement : petit, translucide, au-dessus de la barre d'onglets. Le
 * bouton SOS avait été retiré pour avoir masqué du texte — celui-ci
 * s'efface tant qu'on ne le touche pas.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function handleClick() {
    setSpinning(true);
    startTransition(() => router.refresh());
    // La rotation dure au moins le temps d'être vue, même si le
    // rafraîchissement est instantané.
    window.setTimeout(() => setSpinning(false), 700);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Rafraîchir la page"
      className="fixed right-md z-30 grid h-10 w-10 place-items-center rounded-full bg-white/80 text-neutral-600 opacity-60 shadow-md ring-1 ring-neutral-200 backdrop-blur transition hover:opacity-100 active:scale-95"
      style={{ bottom: 'calc(92px + env(safe-area-inset-bottom))' }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-4 w-4 ${spinning || pending ? 'animate-spin' : ''}`}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}
