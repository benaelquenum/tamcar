'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export function DecideButtons({ opId }: { opId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser.rpc('bo_decide_operation', {
      p_id: opId,
      p_approve: approve,
      p_reason: approve ? null : reason.trim() || null,
    });
    if (err) setError(err.message);
    router.refresh();
    setBusy(false);
    setRejecting(false);
  }

  if (rejecting) {
    return (
      <div className="flex shrink-0 flex-col items-end gap-sm">
        {error && <p className="text-xs text-error">{error}</p>}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motif du rejet (opt.)"
          className="w-56 rounded-lg bg-neutral-50 px-md py-sm text-xs ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <div className="flex gap-sm">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            className="rounded-lg bg-error px-lg py-sm text-xs font-bold text-white disabled:opacity-50"
          >
            Confirmer le rejet
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejecting(false)}
            className="rounded-lg bg-neutral-100 px-lg py-sm text-xs font-bold text-neutral-600"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-sm">
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="flex gap-sm">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(true)}
          className="rounded-lg bg-success px-lg py-sm text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? '…' : 'Valider et comptabiliser'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRejecting(true)}
          className="rounded-lg bg-neutral-100 px-lg py-sm text-xs font-bold text-neutral-700 transition hover:bg-error/10 hover:text-error"
        >
          Rejeter
        </button>
      </div>
    </div>
  );
}
