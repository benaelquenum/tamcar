'use client';

import { useInView } from './hooks';

const START = -120; // degrés : 0 en haut, l'aiguille balaie 240°
const SWEEP = 240;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * Compteur de bord : cadran, graduations, arc de progression et aiguille. Au premier affichage à
 * l'écran, l'aiguille monte jusqu'à la valeur (value : 0 → 1). Si `value` change ensuite (simulateur),
 * elle suit sans délai.
 */
export function Gauge({
  value,
  valueText,
  label,
  sub,
  className = '',
  live = false,
}: {
  value: number;
  valueText: string;
  label: string;
  sub?: string;
  className?: string;
  /** Pas d'attente d'entrée à l'écran (jauge pilotée par l'utilisateur). */
  live?: boolean;
}) {
  const [ref, seen] = useInView<SVGSVGElement>(0.4);
  const v = Math.min(1, Math.max(0, live || seen ? value : 0));
  const angle = START + SWEEP * v;
  const total = (Math.PI * 2 * 78 * SWEEP) / 360;
  const ticks = Array.from({ length: 13 }, (_, i) => i);

  return (
    <svg ref={ref} viewBox="0 0 200 200" className={className} role="img" aria-label={`${label} : ${valueText}`}>
      <defs>
        <linearGradient id="tc-g-arc" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
        <radialGradient id="tc-g-face" cx="50%" cy="40%" r="75%">
          <stop offset="0" stopColor="#1E293B" />
          <stop offset="1" stopColor="#0B1220" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="url(#tc-g-face)" stroke="#334155" strokeWidth="4" />
      <circle cx="100" cy="100" r="88" fill="none" stroke="#1E293B" strokeWidth="1.5" />

      {/* piste + progression */}
      <path d={arc(100, 100, 78, START, START + SWEEP)} fill="none" stroke="#1E293B" strokeWidth="9" strokeLinecap="round" />
      <path
        className="tc-gauge-arc"
        d={arc(100, 100, 78, START, START + SWEEP)}
        fill="none"
        stroke="url(#tc-g-arc)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={total}
        strokeDashoffset={total * (1 - v)}
      />

      {/* graduations */}
      {ticks.map((i) => {
        const deg = START + (SWEEP * i) / 12;
        const long = i % 3 === 0;
        const [x0, y0] = polar(100, 100, long ? 62 : 66, deg);
        const [x1, y1] = polar(100, 100, 71, deg);
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={long ? '#E2E8F0' : '#64748B'} strokeWidth={long ? 2.5 : 1.5} strokeLinecap="round" />;
      })}

      {/* aiguille */}
      <g className="tc-gauge-needle" style={{ transformOrigin: '100px 100px', transform: `rotate(${angle}deg)` }}>
        <path d="M 100 100 L 96.5 104 L 100 30 L 103.5 104 Z" fill="#EAB308" />
      </g>
      <circle cx="100" cy="100" r="9" fill="#EAB308" stroke="#0B1220" strokeWidth="3" />

      <text x="100" y="138" textAnchor="middle" fontSize="23" fontWeight="800" fill="#FFFFFF" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {valueText}
      </text>
      <text x="100" y="156" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#93C5FD" letterSpacing="0.6">
        {label}
      </text>
      {sub && (
        <text x="100" y="170" textAnchor="middle" fontSize="8" fill="#64748B">
          {sub}
        </text>
      )}
    </svg>
  );
}
