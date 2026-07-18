'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

type Props = {
  open: boolean;
  onClose: () => void;
  rideId: string;
  ridePrice: number;
  onDone: () => void;
};

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

export function ReturnChangeModal({ open, onClose, rideId, ridePrice, onDone }: Props) {
  const [amount, setAmount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  const isValid = amount > 0 && amount <= ridePrice;

  async function submit() {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    const { error: rpcErr } = await supabaseBrowser.rpc('driver_return_change', {
      p_ride_id: rideId,
      p_amount_fcfa: amount,
    });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      onDone();
      onClose();
    }, 1200);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-md text-center">
          <div className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-primary-50 text-primary-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <path d="M17 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5z" />
              <path d="M14 8a3 3 0 1 0 0 6M8 12h.01M16 12h.01" />
            </svg>
          </div>
          <h2 className="text-lg font-extrabold text-neutral-900">Rendre la monnaie</h2>
          <p className="mt-xs text-sm text-neutral-600">
            Transfère le reliquat vers le wallet TamCar Crédit du client.
          </p>
        </div>

        {success ? (
          <div className="rounded-xl bg-primary-50 p-lg text-center">
            <p className="text-sm font-bold text-primary-700">Transféré !</p>
            <p className="mt-xs text-xs text-neutral-600">
              {fmt(amount)} F crédités au wallet client.
            </p>
          </div>
        ) : (
          <>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Montant à rendre (max {fmt(ridePrice)} F)
              </span>
              <input
                type="number"
                min={0}
                max={ridePrice}
                step={50}
                value={amount || ''}
                onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
                placeholder="0"
                className="mt-xs w-full rounded-lg bg-neutral-100 px-md py-md text-lg font-bold text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </label>

            {error && (
              <div className="mt-md rounded-md bg-error/10 p-md text-xs text-error">{error}</div>
            )}

            <div className="mt-lg flex gap-md">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-600 hover:border-neutral-300"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!isValid || submitting}
                className="flex-1 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow disabled:opacity-50"
              >
                {submitting ? 'Envoi…' : `Transférer ${amount ? fmt(amount) + ' F' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
