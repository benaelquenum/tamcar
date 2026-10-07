'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// Pages d'accueil publiques et de connexion : le bouton y recouvre le contenu sans servir (revue du 2026-10-07).
const HIDDEN_ON = ['/login', '/reset-password', '/auth', '/cgu', '/confidentialite', '/devenir-chauffeur', '/driver'];

/**
 * Rafraîchissement à la demande, disponible sur toutes les pages.
 *
 * `router.refresh()` rejoue les composants serveur en conservant l'état
 * de la page — la carte n'est pas démontée, le GPS n'est pas redemandé,
 * un formulaire en cours n'est pas vidé. C'est ce qu'on veut d'un bouton
 * pressé en pleine course ; un rechargement complet ferait tout perdre.
 *
 * Placement : languette collée au bord droit, au-dessus de la barre
 * d'onglets. Les pages ont 16 px de marge latérale : la languette (20 px)
 * reste dans cette marge au lieu de recouvrir les boutons et montants en
 * bout de ligne (revue visuelle du 2026-10-07).
 */
export function RefreshButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function handleClick() {
    setSpinning(true);
    startTransition(() => router.refresh());
    // La rotation dure au moins le temps d'être vue, même si le
    // rafraîchissement est instantané.
    window.setTimeout(() => setSpinning(false), 700);
  }

  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Rafraîchir la page"
      className="fixed right-0 z-30 grid h-11 w-5 place-items-center rounded-l-full bg-white/80 text-neutral-600 opacity-60 shadow-md ring-1 ring-neutral-200 backdrop-blur transition hover:opacity-100 active:opacity-100"
      style={{ bottom: 'calc(92px + env(safe-area-inset-bottom))' }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-3.5 w-3.5 ${spinning || pending ? 'animate-spin' : ''}`}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}
