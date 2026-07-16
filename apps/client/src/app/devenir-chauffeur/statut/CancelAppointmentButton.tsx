'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export function CancelAppointmentButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function handleCancel() {
    setBusy(true);
    const { error } = await supabaseBrowser.rpc('cancel_appointment', { app_id: appointmentId });
    if (error) {
      alert(error.message);
      setBusy(false);
      return;
    }
    router.push('/devenir-chauffeur');
    router.refresh();
  }

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="w-full rounded-xl border border-neutral-200 bg-white py-md text-sm font-semibold text-neutral-600 hover:border-error/40 hover:text-error"
      >
        Annuler mon rendez-vous
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-error/30 bg-error/5 p-md">
      <p className="text-sm font-semibold text-neutral-900">
        Confirmes-tu l&apos;annulation ? Ton créneau sera libéré.
      </p>
      <div className="mt-md flex gap-sm">
        <button
          type="button"
          onClick={() => setConfirm(false)}
          disabled={busy}
          className="flex-1 rounded-lg bg-white py-sm text-sm font-semibold text-neutral-600 ring-1 ring-neutral-200"
        >
          Non, garder
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={busy}
          className="flex-1 rounded-lg bg-error py-sm text-sm font-bold text-white disabled:opacity-40"
        >
          {busy ? '…' : 'Oui, annuler'}
        </button>
      </div>
    </div>
  );
}
