'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

/** Démarrer puis terminer une location VIP, avec le kilométrage du compteur. */
export function RentalActions({
  id,
  status,
  startsAt,
  odometerStart,
}: {
  id: string;
  status: string;
  startsAt: string;
  odometerStart: number | null;
}) {
  const router = useRouter();
  const [odo, setOdo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tooEarly = Date.now() < new Date(startsAt).getTime() - 60 * 60_000;

  function parseOdo(): number | null | 'invalid' {
    if (odo.trim() === '') return null;
    const n = parseInt(odo.replace(/\s/g, ''), 10);
    return Number.isFinite(n) && n >= 0 ? n : 'invalid';
  }

  function start() {
    setError(null);
    const v = parseOdo();
    if (v === 'invalid') return setError('Kilométrage invalide.');
    startTransition(async () => {
      const { error: err } = await supabaseBrowser.rpc('driver_start_vehicle_rental', {
        p_id: id,
        p_odometer_start: v,
      });
      if (err) setError(err.message);
      else router.refresh();
    });
  }

  function complete() {
    setError(null);
    const v = parseOdo();
    if (v === 'invalid') return setError('Kilométrage invalide.');
    if (!window.confirm('Terminer la location ? Cette action est définitive.')) return;
    startTransition(async () => {
      const { error: err } = await supabaseBrowser.rpc('driver_complete_vehicle_rental', {
        p_id: id,
        p_odometer_end: v,
      });
      if (err) setError(err.message);
      else router.refresh();
    });
  }

  if (status !== 'confirmed' && status !== 'in_progress') return null;

  return (
    <div className="mt-md rounded-lg bg-neutral-100 p-sm">
      <label className="block text-[11px] font-semibold text-neutral-600">
        {status === 'confirmed'
          ? 'Kilométrage du compteur au départ'
          : `Kilométrage du compteur à la fin${odometerStart != null ? ` (départ : ${odometerStart} km)` : ''}`}
        <input
          value={odo}
          onChange={(e) => setOdo(e.target.value)}
          inputMode="numeric"
          placeholder="Ex. 84 250"
          className="mt-xs w-full rounded-lg border border-neutral-300 bg-white px-sm py-sm text-sm text-neutral-900"
        />
      </label>

      {status === 'confirmed' ? (
        <button
          type="button"
          onClick={start}
          disabled={pending || tooEarly}
          className="mt-sm w-full rounded-lg bg-primary-500 py-sm text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? '…' : 'Démarrer la location'}
        </button>
      ) : (
        <button
          type="button"
          onClick={complete}
          disabled={pending}
          className="mt-sm w-full rounded-lg bg-neutral-900 py-sm text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? '…' : 'Terminer la location'}
        </button>
      )}
      {status === 'confirmed' && tooEarly && (
        <p className="mt-xs text-[11px] text-neutral-500">Disponible 1 h avant le début.</p>
      )}
      {error && <p className="mt-xs text-xs font-semibold text-error">{error}</p>}
    </div>
  );
}
