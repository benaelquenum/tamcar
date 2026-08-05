'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export function ReverseButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reverse() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabaseBrowser.rpc('bo_reverse_entry', {
      p_entry_id: entryId,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      setConfirming(false);
      return;
    }
    router.push(`/compta/ecritures/${data.id}`);
    router.refresh();
  }

  if (!confirming) {
    return (
      <div className="text-right">
        {error && <p className="mb-xs text-xs text-error">{error}</p>}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-neutral-100 px-lg py-sm text-xs font-bold text-neutral-700 transition hover:bg-warning/10 hover:text-warning"
        >
          Extourner cette écriture
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-sm">
      <p className="text-xs text-neutral-500">
        Une écriture inverse sera créée. Confirmer ?
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={reverse}
        className="rounded-lg bg-warning px-lg py-sm text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? 'Extourne…' : 'Oui, extourner'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(false)}
        className="rounded-lg bg-neutral-100 px-lg py-sm text-xs font-bold text-neutral-600"
      >
        Annuler
      </button>
    </div>
  );
}
