'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Rafraîchit la page serveur à intervalle régulier tant que `active` est vrai.
 * Utilisé sur /tampass pendant la recherche du chauffeur et l'attente de
 * paiement : dès que le chauffeur accepte (statut pending_driver →
 * awaiting_payment) ou qu'un délai expire, la page se met à jour toute seule.
 */
export function AutoRefresh({
  active,
  intervalMs = 4000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
