'use client';

import { useScrollProgress } from './hooks';

/**
 * Traces de pneus qui se dessinent au fil du défilement de la section qui les contient : deux sillons
 * parallèles faits de petites sculptures, révélés par un masque proportionnel à la progression.
 */
export function TireTracks({ className = '' }: { className?: string }) {
  const [ref, p] = useScrollProgress<HTMLDivElement>();
  const d = 'M 60 0 C 160 140, -20 260, 90 400 S 170 600, 70 760 S 20 900, 90 1000';
  const reveal = Math.min(1, Math.max(0, (p - 0.05) / 0.8));

  return (
    <div ref={ref} className={className} aria-hidden>
      <svg viewBox="0 0 200 1000" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <mask id="tc-tracks-mask">
            <path d={d} fill="none" stroke="#fff" strokeWidth="60" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - reveal} />
          </mask>
        </defs>
        <g mask="url(#tc-tracks-mask)" fill="none" stroke="#2563EB" opacity="0.28">
          <path d={d} transform="translate(-14 0)" strokeWidth="9" strokeDasharray="3 7" />
          <path d={d} transform="translate(14 0)" strokeWidth="9" strokeDasharray="3 7" />
        </g>
      </svg>
    </div>
  );
}
