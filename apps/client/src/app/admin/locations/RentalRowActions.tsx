'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelRentalAdminAction, updateRentalAction } from './actions';

/** Location confirmée ou en cours : enregistrer le règlement reçu, annuler. */
export function RentalRowActions({
  id,
  status,
  priceFcfa,
  paidFcfa,
}: {
  id: string;
  status: string;
  priceFcfa: number;
  paidFcfa: number;
}) {
  const router = useRouter();
  const [paid, setPaid] = useState(String(paidFcfa));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(value: number) {
    setError(null);
    if (!Number.isFinite(value) || value < 0) return setError('Montant invalide.');
    startTransition(async () => {
      const res = await updateRentalAction(id, { paid_fcfa: value });
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
      <label className="flex items-center gap-xs text-xs font-semibold text-neutral-600">
        Réglé (F)
        <input
          value={paid}
          onChange={(e) => setPaid(e.target.value)}
          inputMode="numeric"
          className="w-24 rounded-md border border-neutral-300 bg-white px-xs py-xs text-xs"
        />
      </label>
      <button
        type="button"
        onClick={() => save(parseInt(paid, 10))}
        disabled={pending}
        className="rounded-md bg-primary-500 px-sm py-xs text-xs font-bold text-white disabled:opacity-60"
      >
        Enregistrer
      </button>
      {paidFcfa < priceFcfa && (
        <button
          type="button"
          onClick={() => {
            setPaid(String(priceFcfa));
            save(priceFcfa);
          }}
          disabled={pending}
          className="rounded-md bg-success/15 px-sm py-xs text-xs font-bold text-success hover:bg-success/25 disabled:opacity-60"
        >
          Tout est réglé ({priceFcfa.toLocaleString('fr-FR').replace(/,/g, ' ')} F)
        </button>
      )}
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
