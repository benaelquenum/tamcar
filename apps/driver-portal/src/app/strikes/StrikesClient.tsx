'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

type Strike = {
  ride_id: string;
  ended_at: string;
  pickup_address: string;
  dropoff_address: string;
  cancel_reason_user: string | null;
  cancel_driver_fault_evidence: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  resolved_at: string | null;
  upheld: boolean | null;
  can_dispute: boolean;
};

const REASON_LABELS: Record<string, string> = {
  driver_asked: "Client dit : je l'ai demandé d'annuler",
  driver_not_moving: 'Client dit : je ne bougeais pas',
  wrong_direction: 'Client dit : mauvaise direction',
  wait_too_long: 'Client dit : trop long à venir',
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function StrikesClient({ strikes }: { strikes: Strike[] }) {
  const router = useRouter();
  const [openDispute, setOpenDispute] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitDispute(rideId: string) {
    if (reason.trim().length < 10) {
      setError('Explique en au moins 10 caractères.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: rpcErr } = await supabaseBrowser.rpc('driver_dispute_strike', {
      p_ride_id: rideId,
      p_reason: reason.trim(),
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setSubmitting(false);
      return;
    }
    setOpenDispute(null);
    setReason('');
    setSubmitting(false);
    router.refresh();
  }

  const activeCount = strikes.filter((s) => s.upheld !== false).length;

  return (
    <main className="relative min-h-dvh bg-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-64 overflow-hidden">
        <div className="absolute -right-16 -top-32 h-64 w-64 rounded-full bg-error/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-lg py-lg">
        <header className="flex items-center gap-md">
          <Link
            href="/"
            aria-label="Retour"
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-900 shadow-md ring-1 ring-neutral-200"
          >
            <span className="text-xl leading-none">←</span>
          </Link>
          <h1 className="flex-1 text-xl font-extrabold text-neutral-900">Signalements</h1>
        </header>

        <section className="mt-xl rounded-2xl bg-white p-lg shadow-md ring-1 ring-neutral-200">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Strikes actifs (30 derniers jours)
          </p>
          <p
            className={`mt-xs text-4xl font-extrabold ${activeCount >= 5 ? 'text-error' : activeCount >= 3 ? 'text-warning' : 'text-neutral-900'}`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {activeCount}
          </p>
          <p className="mt-xs text-xs text-neutral-600">
            À 5 strikes sur 30 jours, ton compte est suspendu automatiquement.
          </p>
        </section>

        {strikes.length === 0 ? (
          <div className="mt-xl rounded-xl bg-primary-50 p-lg text-center">
            <p className="text-lg">👌</p>
            <p className="mt-xs text-sm font-semibold text-primary-900">
              Aucun signalement. Continue comme ça.
            </p>
          </div>
        ) : (
          <ul className="mt-xl space-y-md">
            {strikes.map((s) => {
              const isResolved = s.resolved_at !== null;
              const isRevoked = isResolved && s.upheld === false;
              const isUpheld = isResolved && s.upheld === true;
              const isPending = s.disputed_at !== null && !isResolved;

              return (
                <li
                  key={s.ride_id}
                  className={`overflow-hidden rounded-xl bg-white shadow-sm ring-1 ${
                    isRevoked ? 'ring-primary-300' : 'ring-error/20'
                  }`}
                >
                  <div className="p-md">
                    <div className="flex items-baseline justify-between gap-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        {fmt(s.ended_at)}
                      </p>
                      {isRevoked && (
                        <span className="rounded-full bg-primary-100 px-sm py-0.5 text-[10px] font-bold text-primary-700">
                          ✓ Révoqué
                        </span>
                      )}
                      {isUpheld && (
                        <span className="rounded-full bg-error/15 px-sm py-0.5 text-[10px] font-bold text-error">
                          Confirmé
                        </span>
                      )}
                      {isPending && (
                        <span className="rounded-full bg-warning/15 px-sm py-0.5 text-[10px] font-bold text-warning">
                          En examen
                        </span>
                      )}
                    </div>

                    <p className="mt-sm text-sm font-semibold text-neutral-900">
                      {REASON_LABELS[s.cancel_reason_user ?? ''] ?? s.cancel_reason_user ?? 'Signalé'}
                    </p>
                    {s.cancel_driver_fault_evidence && (
                      <p className="mt-xs text-[11px] text-neutral-600">
                        Preuve : {s.cancel_driver_fault_evidence}
                      </p>
                    )}

                    <p className="mt-md truncate text-xs text-neutral-700">
                      {s.pickup_address}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      → {s.dropoff_address}
                    </p>

                    {s.dispute_reason && (
                      <div className="mt-md rounded-lg bg-neutral-50 p-sm ring-1 ring-neutral-200">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                          Ta contestation
                        </p>
                        <p className="mt-xs text-xs text-neutral-800">{s.dispute_reason}</p>
                      </div>
                    )}

                    {s.can_dispute && openDispute !== s.ride_id && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenDispute(s.ride_id);
                          setReason('');
                          setError(null);
                        }}
                        className="mt-md w-full rounded-lg border-2 border-primary-500 bg-white py-sm text-xs font-bold text-primary-700 hover:bg-primary-50"
                      >
                        Contester ce signalement
                      </button>
                    )}

                    {openDispute === s.ride_id && (
                      <div className="mt-md space-y-sm">
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">
                            Explique ce qui s&apos;est passé
                          </span>
                          <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={4}
                            placeholder="Ex : je roulais vers le client, il a annulé pendant mon trajet, la circulation était bloquée…"
                            className="mt-xs w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm"
                          />
                        </label>
                        {error && <p className="text-xs text-error">{error}</p>}
                        <div className="flex gap-sm">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenDispute(null);
                              setReason('');
                              setError(null);
                            }}
                            className="flex-1 rounded-lg bg-neutral-100 py-sm text-xs font-bold text-neutral-700"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={() => submitDispute(s.ride_id)}
                            disabled={submitting}
                            className="flex-1 rounded-lg bg-primary-500 py-sm text-xs font-bold text-white disabled:opacity-50"
                          >
                            {submitting ? '…' : 'Envoyer'}
                          </button>
                        </div>
                      </div>
                    )}

                    {!s.can_dispute && !s.dispute_reason && !isResolved && (
                      <p className="mt-md text-[11px] text-neutral-500">
                        Délai de contestation dépassé (7 jours).
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
