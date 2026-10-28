'use client';

import { useState } from 'react';
import { AlertTriangleIcon, CheckIcon } from '@/components/Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';

/** Réponse de la fonction serveur ride_end_info (course terminée par le chauffeur). */
export type RideEndInfo = {
  ended_by: 'driver';
  ended_at: string;
  near: boolean;
  dist_m: number;
  price_before_fcfa: number | null;
  price_after_fcfa: number | null;
  status: 'recorded' | 'dispute' | 'resolved';
  contest_until: string;
  contested_at: string | null;
  verdict: string | null;
  credit_fcfa: number;
  can_contest: boolean;
};

const CONTEST_REASONS = [
  'Je n’étais pas arrivé(e) à destination',
  'Le prix n’est pas correct',
  'Le chauffeur m’a fait descendre avant la fin',
  'Autre problème',
];

function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}

function fmtDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/**
 * Fenêtre affichée au client quand son chauffeur a terminé la course à sa place :
 * il voit où et à quel prix, puis confirme ou conteste (délai limité côté serveur).
 */
export function DriverEndNotice({
  rideId,
  info,
  onDone,
}: {
  rideId: string;
  info: RideEndInfo;
  onDone: (contested: boolean) => void;
}) {
  const [stage, setStage] = useState<'info' | 'contest' | 'sent'>('info');
  const [reason, setReason] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minLeft = Math.max(1, Math.ceil((new Date(info.contest_until).getTime() - Date.now()) / 60_000));
  const priceChanged = info.price_before_fcfa != null && info.price_after_fcfa != null && info.price_before_fcfa !== info.price_after_fcfa;

  async function sendContest() {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    const note = text.trim() ? `${reason} — ${text.trim()}` : reason;
    const { error: rpcErr } = await supabaseBrowser.rpc('client_contest_ride_end', { p_ride_id: rideId, p_note: note });
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setStage('sent');
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-neutral-900/75 backdrop-blur-sm sm:items-center">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-lg shadow-xl sm:rounded-2xl">
        {stage === 'info' && (
          <>
            <div className="mb-md text-center">
              <div
                className={`mx-auto mb-md grid h-14 w-14 place-items-center rounded-full ${
                  info.near ? 'bg-primary-50 text-primary-700' : 'bg-warning/15 text-warning'
                }`}
              >
                {info.near ? <CheckIcon className="h-7 w-7" strokeWidth={3} /> : <AlertTriangleIcon className="h-7 w-7" strokeWidth={2.5} />}
              </div>
              <h2 className="text-lg font-extrabold text-neutral-900">Votre chauffeur a terminé la course</h2>
              <p className="mt-xs text-sm text-neutral-600">
                {info.near ? (
                  <>Il l’a terminée près de la destination (à <strong>{fmtDistance(info.dist_m)}</strong>).</>
                ) : (
                  <>Il l’a terminée à <strong>{fmtDistance(info.dist_m)}</strong> de la destination.</>
                )}
              </p>
            </div>

            {priceChanged && (
              <div className="mb-md rounded-xl border border-primary-200 bg-primary-50 p-md text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-neutral-600">Prix initial</span>
                  <span className="font-semibold text-neutral-500 line-through" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(info.price_before_fcfa as number)} F
                  </span>
                </div>
                <div className="mt-xs flex items-baseline justify-between">
                  <span className="font-bold text-neutral-900">Prix ajusté au trajet fait</span>
                  <span className="text-xl font-extrabold text-neutral-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(info.price_after_fcfa as number)} F
                  </span>
                </div>
              </div>
            )}

            <p className="mb-md text-xs text-neutral-600">
              Si ce n’est pas normal, vous pouvez contester pendant encore <strong>{minLeft} min</strong> : l’équipe TamCar examinera votre demande.
            </p>

            <button
              type="button"
              onClick={() => onDone(false)}
              className="mb-sm w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow"
            >
              C’est bon, continuer
            </button>
            {info.can_contest && (
              <button
                type="button"
                onClick={() => setStage('contest')}
                className="w-full rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-700 hover:border-error hover:text-error"
              >
                Contester la fin de course
              </button>
            )}
          </>
        )}

        {stage === 'contest' && (
          <>
            <h2 className="mb-md text-lg font-extrabold text-neutral-900">Qu’est-ce qui ne va pas ?</h2>
            <div className="mb-md space-y-xs">
              {CONTEST_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-center gap-sm rounded-lg px-md py-sm text-sm ring-1 transition ${
                    reason === r ? 'bg-primary-50 font-semibold text-primary-700 ring-primary-500' : 'bg-neutral-100 text-neutral-800 ring-neutral-200'
                  }`}
                >
                  <input type="radio" name="contest-reason" checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-primary-500" />
                  {r}
                </label>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Précisions (facultatif)"
              className="mb-md w-full rounded-lg bg-neutral-100 px-md py-sm text-sm text-neutral-900 ring-1 ring-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {error && <div className="mb-md rounded-md bg-error/10 p-md text-sm text-error">{error}</div>}
            <button
              type="button"
              disabled={!reason || busy}
              onClick={() => void sendContest()}
              className="mb-sm w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Envoi…' : 'Envoyer ma contestation'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setStage('info')}
              className="w-full rounded-xl border-2 border-neutral-200 py-md text-sm font-bold text-neutral-700 disabled:opacity-50"
            >
              Retour
            </button>
          </>
        )}

        {stage === 'sent' && (
          <div className="text-center">
            <div className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-primary-50 text-primary-700">
              <CheckIcon className="h-7 w-7" strokeWidth={3} />
            </div>
            <h2 className="text-lg font-extrabold text-neutral-900">Contestation envoyée</h2>
            <p className="mt-xs text-sm text-neutral-600">L’équipe TamCar examine votre demande. Vous serez prévenu(e) de la décision.</p>
            <button
              type="button"
              onClick={() => onDone(true)}
              className="mt-md w-full rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 py-md text-sm font-bold text-white shadow-glow"
            >
              Continuer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
