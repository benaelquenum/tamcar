'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelRentalAdminAction, updateRentalAction } from './actions';

/** Location confirmée ou en cours : régler le paiement, annuler. */
export function RentalRowActions({
  id,
  status,
  paymentMode,
  paidFcfa,
}: {
  id: string;
  status: string;
  paymentMode: 'cash' | 'prepaid';
  paidFcfa: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'cash' | 'prepaid'>(paymentMode);
  const [paid, setPaid] = useState(String(paidFcfa));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    const p = parseInt(paid, 10);
    if (!Number.isFinite(p) || p < 0) return setError('Montant invalide.');
    startTransition(async () => {
      const res = await updateRentalAction(id, { payment_mode: mode, paid_fcfa: p });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function cancel() {
    const reason = window.prompt('Motif de l’annulation (affiché au client) :', '');
    if (reason === null) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelRentalAdminAction(id, reason);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-xs">
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as 'cash' | 'prepaid')}
        className="rounded-md border border-neutral-300 bg-white px-xs py-xs text-xs"
        aria-label="Mode de paiement"
      >
        <option value="cash">Client → chauffeur</option>
        <option value="prepaid">Réglé à TamCar</option>
      </select>
      <input
        value={paid}
        onChange={(e) => setPaid(e.target.value)}
        inputMode="numeric"
        className="w-20 rounded-md border border-neutral-300 bg-white px-xs py-xs text-xs"
        aria-label="Montant déjà réglé (F)"
        title="Montant déjà réglé (F)"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded-md bg-primary-500 px-sm py-xs text-xs font-bold text-white disabled:opacity-60"
      >
        Enregistrer
      </button>
      {status === 'confirmed' && (
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="rounded-md bg-warning/10 px-sm py-xs text-xs font-bold text-warning hover:bg-warning/20 disabled:opacity-60"
        >
          Annuler
        </button>
      )}
      {error && <span className="w-full text-xs font-semibold text-error">{error}</span>}
    </div>
  );
}
