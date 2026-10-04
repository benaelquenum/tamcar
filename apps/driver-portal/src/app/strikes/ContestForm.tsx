'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export function ContestForm({ rideId }: { rideId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 10) {
      setError('Expliquez en au moins 10 caractères ce qui s’est réellement passé.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser.rpc('driver_dispute_strike', {
      p_ride_id: rideId,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-sm text-xs font-bold text-primary-700 underline"
      >
        Contester ce signalement
      </button>
    );
  }

  return (
    <div className="mt-sm">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Expliquez ce qui s’est réellement passé"
        className="w-full rounded-lg border border-neutral-200 bg-white p-sm text-sm"
      />
      {error && <p className="mt-xs text-xs font-semibold text-error">{error}</p>}
      <div className="mt-xs flex gap-xs">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex-1 rounded-lg bg-primary-600 py-sm text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Envoi…' : 'Envoyer ma contestation'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-md py-sm text-sm font-bold text-neutral-500">
          Annuler
        </button>
      </div>
    </div>
  );
}
