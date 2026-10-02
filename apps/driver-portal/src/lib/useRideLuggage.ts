'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

/**
 * Courses du fil qui comptent des bagages. Le drapeau est lu directement sur `rides`
 * (le chauffeur voit les courses du pool et les siennes) : une requête de deux colonnes,
 * uniquement pour les courses dont on ne connaît pas encore le drapeau.
 *
 * Le client pose le drapeau juste APRÈS la création de la course : une nouvelle course
 * est donc relue une 2e fois 4 s plus tard, pour ne pas manquer cette mise à jour.
 * Sans la colonne en base (migration non passée), tout reste « sans bagages ».
 */
export function useRideLuggage(ids: string[]): Set<string> {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const seenRef = useRef<Set<string>>(new Set());
  const key = ids.slice().sort().join(',');

  useEffect(() => {
    const fresh = ids.filter((id) => !seenRef.current.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => seenRef.current.add(id));
    let cancelled = false;

    const read = async (list: string[]) => {
      const { data, error } = await supabaseBrowser.from('rides').select('id, has_luggage').in('id', list);
      if (cancelled || error || !data) return;
      setFlags((prev) => {
        const next = { ...prev };
        for (const row of data as Array<{ id: string; has_luggage: boolean | null }>) {
          next[row.id] = Boolean(row.has_luggage);
        }
        return next;
      });
    };

    void read(fresh);
    const t = setTimeout(() => void read(fresh), 4_000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(
    () => new Set(Object.entries(flags).filter(([, v]) => v).map(([id]) => id)),
    [flags],
  );
}
