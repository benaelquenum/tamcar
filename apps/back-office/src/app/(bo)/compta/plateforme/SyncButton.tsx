'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { SendIcon } from '@/components/Icon';

export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabaseBrowser.rpc('bo_sync_platform');
    if (err) {
      setError(err.message);
    } else {
      setMessage(
        data === 0
          ? 'Rien à comptabiliser : tout est à jour.'
          : `${data} jour(s) comptabilisé(s).`,
      );
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={busy}
        onClick={sync}
        className="flex items-center gap-sm rounded-lg bg-primary-500 px-lg py-md text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
      >
        <SendIcon className="h-4 w-4" />
        {busy ? 'Synchronisation…' : 'Synchroniser jusqu’à hier'}
      </button>
      {message && <p className="mt-xs text-xs font-bold text-success">{message}</p>}
      {error && <p className="mt-xs text-xs text-error">{error}</p>}
    </div>
  );
}
