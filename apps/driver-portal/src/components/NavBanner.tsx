'use client';

import type { NavStep } from '@/lib/mapbox';

// Flèche de manœuvre selon le type/modifier Mapbox.
function arrowPath(step: NavStep): string {
  const m = (step.modifier ?? '').toLowerCase();
  const t = (step.type ?? '').toLowerCase();
  if (t === 'arrive') return 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z'; // pin destination
  if (m.includes('uturn')) return 'M8 21V11a4 4 0 0 1 8 0v3m0 0 3-3m-3 3-3-3';
  if (m.includes('left')) return 'M15 21v-7a4 4 0 0 0-4-4H6m0 0 4-4m-4 4 4 4';
  if (m.includes('right')) return 'M9 21v-7a4 4 0 0 1 4-4h5m0 0-4-4m4 4-4 4';
  return 'M12 21V5m0 0-6 6m6-6 6 6'; // tout droit
}

function fmtDist(m: number | null): string {
  if (m == null) return '';
  if (m < 1000) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function NavBanner({ step, distanceM }: { step: NavStep | null; distanceM: number | null }) {
  if (!step || !step.instruction) return null;
  const dist = fmtDist(distanceM);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[68px] z-20 px-lg">
      <div className="mx-auto flex max-w-md items-center gap-md rounded-2xl bg-neutral-900/95 px-md py-3 text-white shadow-xl backdrop-blur">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-9 w-9 flex-none text-primary-300"
          aria-hidden="true"
        >
          <path d={arrowPath(step)} />
        </svg>
        <div className="min-w-0 flex-1">
          {dist && (
            <p className="text-xl font-extrabold leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {dist}
            </p>
          )}
          <p className="truncate text-sm text-white/90">{step.instruction}</p>
        </div>
      </div>
    </div>
  );
}
