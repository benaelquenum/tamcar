'use client';

import { useEffect, useRef, useState } from 'react';
import { fmt } from './lib';

/** Montant en F ; quand il augmente (course terminée), un « +X F » apparaît quelques secondes. */
export function LiveAmount({ value, className = '', onDark = false }: { value: number; className?: string; onDark?: boolean }) {
  const prev = useRef(value);
  const [gain, setGain] = useState<number | null>(null);

  useEffect(() => {
    if (value > prev.current) {
      setGain(value - prev.current);
      prev.current = value;
      const t = setTimeout(() => setGain(null), 7_000);
      return () => clearTimeout(t);
    }
    prev.current = value;
    return undefined;
  }, [value]);

  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {fmt(value)} F
      {gain !== null && (
        <span
          className={`ml-xs inline-block animate-pulse rounded-full px-sm py-0.5 align-middle text-[11px] font-bold ${
            onDark ? 'bg-white text-success' : 'bg-success/15 text-success'
          }`}
        >
          +{fmt(gain)} F
        </span>
      )}
    </span>
  );
}
