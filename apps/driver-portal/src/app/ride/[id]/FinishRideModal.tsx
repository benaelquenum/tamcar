'use client';

import { useState } from 'react';
import { AlertTriangleIcon, CheckIcon } from '@/components/Icon';

/** Réponse de la fonction serveur ride_end_preview (même logique que la fin réelle). */
export type FinishPreview = {
  dist_m: number;
  near: boolean;
  near_m: number;
  elapsed_min: number;
  expected_min: number;
  duration_reached: boolean;
  reason_required: boolean;
  price_fcfa: number;
  price_total_fcfa: number;
  contest_min: number;
};

export const FINISH_REASONS: { code: string; label: string }[] = [
  { code: 'client_asked_stop', label: 'Le client a demandé à s’arrêter ici' },
  { code: 'client_left', label: 'Le client est descendu sans terminer' },
  { code: 'vehicle_problem', label: 'Panne ou accident du véhicule' },
  { code: 'safety', label: 'Problème de sécurité' },
  { code: 'other', label: 'Autre raison' },
];

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function fmtDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export function FinishRideModal({
  preview,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  preview: FinishPreview;
  busy: boolean;
  error: string | null;
  onConfirm: (reasonCode: string | null, reasonText: string | null) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [text, setText] = useState('');
  const far = !preview.near;
  const priceChanged = preview.price_fcfa !== preview.price_total_fcfa;
  const needText = reason === 'other';
  const canConfirm = !busy && (!preview.reason_required || (reason !== null && (!needText || text.trim().length >= 5)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/75 backdrop-blur-sm sm:items-center"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-md text-center">
          <div
            className={`mx-auto mb-md grid h-14 w-14 place-items-center rounded-full ${
              far ? 'bg-warning/15 text-warning' : 'bg-primary-50 text-primary-700'
            }`}
          >
            {far ? <AlertTriangleIcon className="h-7 w-7" strokeWidth={2.5} /> : <CheckIcon className="h-7 w-7" strokeWidth={3} />}
          </div>
          <h2 className="text-lg font-extrabold text-neutral-900">
            {far ? 'Terminer la course ici ?' : 'Terminer la course ?'}
          </h2>
          <p className="mt-xs text-sm text-neutral-600">
            {far ? (
              <>
                Vous êtes à <strong>{fmtDistance(preview.dist_m)}</strong> de la destination.
                {preview.duration_reached && <> La durée estimée ({preview.expected_min} min) est atteinte.</>}
              </>
            ) : (
              <>Vous êtes à <strong>{fmtDistance(preview.dist_m)}</strong> de la destination.</>
            )}
          </p>
        </div>

        {far && (
          <div className="mb-md rounded-xl border border-warning/40 bg-warning/10 p-md text-xs text-neutral-700">
            {priceChanged ? (
              <p>
                Le prix est recalculé au prorata du trajet fait :{' '}
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(preview.price_fcfa)} F</strong> au lieu de{' '}
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(preview.price_total_fcfa)} F</span>.
              </p>
            ) : (
              <p>Le prix de la course ne change pas.</p>
            )}
            <p className="mt-xs">
              TamCar examinera cette fin de course. Le client est prévenu et peut la contester pendant {preview.contest_min} min.
            </p>
          </div>
        )}

        {(preview.reason_required || far) && (
          <fieldset className="mb-md">
            <legend className="mb-xs text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              {preview.reason_required ? 'Raison de la fin (obligatoire)' : 'Raison de la fin (facultative)'}
            </legend>
            <div className="space-y-xs">
              {FINISH_REASONS.map((r) => (
                <label
                  key={r.code}
                  className={`flex cursor-pointer items-center gap-sm rounded-lg px-md py-sm text-sm ring-1 transition ${
                    reason === r.code ? 'bg-primary-50 font-semibold text-primary-700 ring-primary-500' : 'bg-neutral-100 text-neutral-800 ring-neutral-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="finish-reason"
                    checked={reason === r.code}
                    onChange={() => setReason(r.code)}
                    className="h-4 w-4 accent-primary-500"
                  />
                  {r.label}
                </label>
              ))}
            </div>
            {needText && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Expliquez en quelques mots"
                className="mt-sm w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            )}
          </fieldset>
        )}

        {error && <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">{error}</div>}

        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => onConfirm(reason, needText ? text.trim() : null)}
          className="mb-sm w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Envoi…' : 'Terminer la course'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="w-full rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-700 hover:border-primary-500 disabled:opacity-50"
        >
          Continuer la course
        </button>
      </div>
    </div>
  );
}
