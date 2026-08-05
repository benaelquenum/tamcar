'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { DOC_STATUS_LABELS, type BoDocStatus } from '@/lib/bo';

const ORDER: BoDocStatus[] = ['a_traiter', 'en_cours', 'traite', 'archive'];

export function StatusButtons({
  docId,
  current,
}: {
  docId: string;
  current: BoDocStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: BoDocStatus) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser
      .from('bo_documents')
      .update({ status })
      .eq('id', docId);
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="mt-lg border-t border-neutral-100 pt-lg">
      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
        Changer le statut
      </p>
      {error && (
        <p className="mt-xs text-xs text-error">{error}</p>
      )}
      <div className="mt-sm flex flex-wrap gap-sm">
        {ORDER.filter((s) => s !== current).map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => setStatus(s)}
            className="rounded-full bg-neutral-100 px-lg py-sm text-xs font-bold text-neutral-700 transition hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50"
          >
            {DOC_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
