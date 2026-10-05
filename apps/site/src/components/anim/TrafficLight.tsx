'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './hooks';

const LAMPS = [
  { color: '#EF4444', label: 'rouge' },
  { color: '#F59E0B', label: 'orange' },
  { color: '#10B981', label: 'vert' },
] as const;

/**
 * Feu tricolore. `active` : 0 rouge, 1 orange, 2 vert (-1 : tous éteints). Sans `active`, le feu fait
 * son cycle de démarrage (rouge, orange, vert) puis reste au vert : « c'est parti ».
 */
export function TrafficLight({
  active,
  className = '',
  loop = false,
}: {
  active?: number;
  className?: string;
  /** Recommence le cycle indéfiniment (sinon : s'arrête au vert). */
  loop?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const [auto, setAuto] = useState(0);

  useEffect(() => {
    if (active !== undefined) return;
    if (reduced) {
      setAuto(2);
      return;
    }
    setAuto(0);
    const t1 = setTimeout(() => setAuto(1), 900);
    const t2 = setTimeout(() => setAuto(2), 1800);
    const t3 = loop ? setTimeout(() => setAuto(-1), 5200) : undefined;
    const loopTimer = loop
      ? setInterval(() => {
          setAuto(0);
          setTimeout(() => setAuto(1), 900);
          setTimeout(() => setAuto(2), 1800);
          setTimeout(() => setAuto(-1), 5200);
        }, 6200)
      : undefined;
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (t3) clearTimeout(t3);
      if (loopTimer) clearInterval(loopTimer);
    };
  }, [active, reduced, loop]);

  const current = active !== undefined ? active : auto;

  return (
    <svg viewBox="0 0 100 250" className={className} role="img" aria-label="Feu tricolore">
      <rect x="12" y="6" width="76" height="238" rx="26" fill="#0F172A" />
      <rect x="12" y="6" width="76" height="238" rx="26" fill="none" stroke="#1E293B" strokeWidth="3" />
      {LAMPS.map((l, i) => {
        const cy = 52 + i * 73;
        const on = current === i;
        return (
          <g key={l.label}>
            {/* visière */}
            <path d={`M 20 ${cy - 26} Q 50 ${cy - 46} 80 ${cy - 26} L 80 ${cy - 20} Q 50 ${cy - 38} 20 ${cy - 20} Z`} fill="#1E293B" />
            <circle
              className="tc-lamp"
              cx="50"
              cy={cy}
              r="25"
              fill={l.color}
              opacity={on ? 1 : 0.18}
              style={{ filter: on ? `drop-shadow(0 0 14px ${l.color}) drop-shadow(0 0 28px ${l.color})` : 'none' }}
            />
            <circle cx="42" cy={cy - 8} r="6" fill="#fff" opacity={on ? 0.45 : 0.1} />
          </g>
        );
      })}
    </svg>
  );
}
