'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Recharge les données de la page toutes les 30 secondes (activité en direct des chauffeurs). */
export function AutoRefresh({ everyMs = 30_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}
