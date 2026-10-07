'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { freshChannel } from '@/lib/realtime';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { clock } from './lib';

/**
 * Garde l'espace partenaire à jour : dès qu'une course de ses véhicules change (terminée, par
 * exemple), la page se recharge d'elle-même. Filet de sécurité : rechargement toutes les 30 s
 * et au retour sur l'onglet, au cas où la connexion temps réel serait coupée.
 */
export function LiveRefresh({ dealerId, updatedAt }: { dealerId: string; updatedAt: string }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refreshSoon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 700);
    };

    // Diffusion sans données émise par la base quand une course de ses véhicules change (le partenaire n'a plus
    // de droit de lecture direct sur les courses : ses chiffres viennent des fonctions dealer_my_*).
    const ch = freshChannel(`dealer-${dealerId}`)
      .on('broadcast', { event: 'refresh' }, refreshSoon)
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      void supabaseBrowser.removeChannel(ch);
    };
  }, [dealerId, router]);

  return (
    <span
      className="inline-flex items-center gap-xs rounded-full bg-white px-md py-xs text-[11px] font-semibold text-neutral-600 ring-1 ring-neutral-200"
      title={connected ? 'Connexion en direct active' : 'Actualisation automatique toutes les 30 secondes'}
    >
      <span className="relative flex h-2 w-2">
        {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-success' : 'bg-warning'}`} />
      </span>
      {connected ? 'En direct' : 'Actualisation auto'} · {clock(updatedAt)}
    </span>
  );
}
