'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

type Props = { rideId?: string };

export function SosButton({ rideId }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSending(true);
    setError(null);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 12000,
        }),
      );
      const { error: rpcErr } = await supabaseBrowser.rpc('send_sos_alert', {
        p_ride_id: rideId ?? null,
        p_lat: pos.coords.latitude,
        p_lng: pos.coords.longitude,
        p_reason: reason.trim() || null,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setSent(true);
      if (navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 80]);
      setTimeout(() => { setConfirming(false); setSent(false); setReason(''); }, 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="fixed bottom-lg right-lg z-40 grid h-14 w-14 place-items-center rounded-full bg-error text-white font-black shadow-lg ring-4 ring-error/20"
        aria-label="Envoyer une alerte SOS"
      >
        SOS
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/70 backdrop-blur-sm sm:items-center"
      onClick={() => !sending && setConfirming(false)}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-primary-50 text-primary-700">✓</div>
            <p className="font-bold text-neutral-900">Alerte envoyée</p>
            <p className="mt-xs text-xs text-neutral-600">
              Le support TamCar reçoit ta position en temps réel.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-md text-center">
              <div className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-error/15 text-error">!</div>
              <h2 className="text-lg font-extrabold text-neutral-900">Envoyer une alerte SOS ?</h2>
              <p className="mt-xs text-xs text-neutral-600">
                Ta position GPS est transmise à l&apos;équipe TamCar qui te rappellera au plus vite.
              </p>
            </div>
            <textarea
              rows={2}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Raison (optionnel)"
              className="w-full resize-none rounded-lg bg-neutral-100 p-md text-sm ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-error"
            />
            {error && (
              <div className="mt-md rounded-md bg-error/10 p-md text-xs text-error">{error}</div>
            )}
            <div className="mt-lg flex gap-md">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={sending}
                className="flex-1 rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-600"
              >
                Non
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={sending}
                className="flex-1 rounded-xl bg-error py-md text-sm font-bold text-white shadow-md disabled:opacity-50"
              >
                {sending ? 'Envoi…' : 'Envoyer SOS'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
