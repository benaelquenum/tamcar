'use client';

import { useEffect, useState } from 'react';
import { DataIcon } from '@/components/Icon';
import {
  formatBytes,
  getTodayCounters,
  installDataMeter,
  subscribeMeter,
  totalBytes,
  type DataCounters,
} from '@/lib/dataMeter';

// Installe le compteur de data (monté dans le layout, rend rien).
export function DataMeter() {
  useEffect(() => {
    installDataMeter();
  }, []);
  return null;
}

const LABELS: Array<[keyof DataCounters, string]> = [
  ['api', 'Courses et données'],
  ['nav', 'Navigation'],
  ['tiles', 'Carte (estimé)'],
  ['realtime', 'Temps réel'],
  ['other', 'Autres'],
];

// Pastille « data du jour » : le chauffeur voit ce que TamCar Pro consomme.
export function DataUsageChip() {
  const [c, setC] = useState<DataCounters | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setC(getTodayCounters());
    return subscribeMeter(() => setC(getTodayCounters()));
  }, []);

  if (!c) return null;
  const total = totalBytes(c);

  return (
    <div className="mb-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg bg-neutral-50 px-md py-sm text-left ring-1 ring-neutral-200"
        aria-expanded={open}
      >
        <span className="flex items-center gap-sm text-xs font-semibold text-neutral-700">
          <DataIcon className="h-4 w-4 text-primary-600" />
          Data TamCar Pro aujourd&apos;hui
        </span>
        <span className="text-xs font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatBytes(total)}
        </span>
      </button>
      {open && (
        <div className="mt-xs space-y-xs rounded-lg bg-neutral-50 p-md ring-1 ring-neutral-200">
          {LABELS.map(([key, label]) => (
            <div key={key} className="flex justify-between text-xs text-neutral-600">
              <span>{label}</span>
              <span className="font-semibold text-neutral-800" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatBytes(c[key] as number)}
              </span>
            </div>
          ))}
          <p className="pt-xs text-[10px] leading-snug text-neutral-500">
            Estimation de ce que consomme l&apos;application sur votre forfait. Elle ne compte pas WhatsApp ni les autres applications.
          </p>
        </div>
      )}
    </div>
  );
}
